"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./api";
import { issueCollectionPath, updateIssue, ISSUE_STATUSES, type Issue, type IssuePage } from "./issues";
import { loginDestination } from "./navigation";
import { filterQuery, type IssueFilters } from "./issueFilters";

export const BOARD_PAGE_SIZE = 100;
export type IssueStatus = Issue["status"];

export function useIssueBoard(projectId: string, archived: boolean, filters: IssueFilters = {}) {
  const router = useRouter();
  const query = filterQuery(filters);
  const [items, setItems] = useState<Issue[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [retryMove, setRetryMove] = useState<{ issue: Issue; status: IssueStatus } | null>(null);
  const [moved, setMoved] = useState<{ id: string; status: IssueStatus; hidden?: boolean } | null>(null);
  const offset = useRef(0);
  const busy = useRef(false);
  const generation = useRef(0);

  function failure(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 401) {
      try { router.replace(loginDestination()); }
      catch { setError("Your session expired. Open Sign in to continue, then return to this project."); }
      return;
    }
    if (err instanceof ApiError && err.status === 409) {
      setBlocked(true); setRetryMove(null);
      setError("This project is archived. Restore it and refresh the project before moving issues.");
    } else if (err instanceof ApiError && err.status === 404) {
      setBlocked(true); setRetryMove(null);
      setError("This project or issue is no longer available to this account. Refresh the project to check access.");
    } else if (err instanceof ApiError && err.code === "csrf_failed") {
      setError("The request could not be verified. Refresh the project and try again.");
    } else if (err instanceof ApiError && err.status === 422) {
      setError("The request was rejected. Check or clear the filters, then refresh the board.");
    } else setError(fallback);
  }

  async function load(reset = false) {
    if (busy.current) return;
    busy.current = true;
    const current = generation.current;
    setPending("load"); if (!blocked) setError(""); setMessage(""); setRetryMove(null);
    const start = reset ? 0 : offset.current;
    try {
      const page = await api<IssuePage>(`${issueCollectionPath(projectId)}?limit=${BOARD_PAGE_SIZE}&offset=${start}${query ? `&${query}` : ""}`);
      if (generation.current !== current) return;
      setItems(previous => {
        // De-duplicate shifted offset pages; keep newer confirmed versions.
        const rows = new Map((reset ? [] : previous).map(issue => [issue.id, issue]));
        for (const issue of page.items) {
          const old = rows.get(issue.id);
          if (!old || Date.parse(issue.updated_at) >= Date.parse(old.updated_at)) rows.set(issue.id, issue);
        }
        // Map insertion order retains the API's exact timestamp/UUID ordering.
        return [...rows.values()];
      });
      offset.current = start + page.items.length;
      setHasMore(page.has_more); setLoaded(true);
    } catch (err) {
      if (generation.current === current) failure(err, "Issues could not load. Your loaded cards are preserved. Try loading again.");
    } finally {
      if (generation.current === current) { busy.current = false; setPending(null); }
    }
  }

  async function move(issue: Issue, status: IssueStatus) {
    if (busy.current || archived || blocked || issue.status === status || !(status in ISSUE_STATUSES)) return;
    busy.current = true;
    const current = generation.current;
    setPending(issue.id); setError(""); setMessage(""); setRetryMove(null);
    try {
      const saved = await updateIssue(projectId, issue.id, { status });
      if (generation.current !== current) return;
      const hidden = !!filters.status && filters.status !== saved.status;
      setItems(previous => hidden ? previous.filter(row => row.id !== saved.id)
        : previous.map(row => row.id === saved.id ? saved : row));
      // Removing a row from the filtered range shifts the server's next offset.
      if (hidden) offset.current = Math.max(0, offset.current - 1);
      setMessage(`${saved.title} moved to ${ISSUE_STATUSES[saved.status]}.${hidden ? " It no longer matches the status filter." : ""}`);
      setMoved({ id: saved.id, status: saved.status, hidden });
    } catch (err) {
      if (generation.current !== current) return;
      setRetryMove({ issue, status });
      failure(err, `Could not confirm the move to ${ISSUE_STATUSES[status]}. The card still shows its last confirmed status. Retry the same move or refresh the board to check.`);
    } finally {
      if (generation.current === current) { busy.current = false; setPending(null); }
    }
  }

  useEffect(() => {
    generation.current++; busy.current = false; offset.current = 0;
    setItems([]); setLoaded(false); setBlocked(false); setMoved(null);
    void load(true);
    // Ignore stale results, without aborting fetch during Strict Mode/unmount.
    return () => { generation.current++; busy.current = false; };
    // The view is keyed by project and archived state; router changes also restart safely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, archived, router, query]);

  return { items, loaded, hasMore, pending, error, message, moved,
    disabled: archived || blocked || !!pending, load, move, retryMove };
}
