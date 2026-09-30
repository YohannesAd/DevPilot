"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/useApi";
import { projectDate } from "@/lib/projects";
import { issueCollectionPath, issueHref, ISSUE_PAGE_SIZE, ISSUE_TYPES, ISSUE_STATUSES, ISSUE_PRIORITIES, type IssuePage } from "@/lib/issues";
import { Button } from "./Button";
import IssueForm from "./IssueForm";
import workspace from "./Workspace.module.css";
import styles from "./Issues.module.css";

export default function ProjectIssues({ projectId, archived }: { projectId: string; archived: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [offset, setOffset] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef(false);
  const { data, error, retry } = useApi<IssuePage>(`${issueCollectionPath(projectId)}?limit=${ISSUE_PAGE_SIZE}&offset=${offset}`);
  useEffect(() => {
    if (!creating && returnFocus.current) { headingRef.current?.focus(); returnFocus.current = false; }
  }, [creating]);
  useEffect(() => { if (archived) setCreating(false); }, [archived]);
  const missing = error?.status === 404 || error?.status === 422;
  return <section className={styles.section} aria-labelledby="issues-heading">
    <div className={workspace.sectionHeading}>
      <h2 id="issues-heading" ref={headingRef} tabIndex={-1}>Issues</h2>
      {!archived && !creating && !missing && <Button onClick={() => setCreating(true)}>Create issue</Button>}
    </div>
    {archived && <p className={styles.readOnly}>These issues are read-only while the project is archived. Restore the project to make changes.</p>}
    {creating && !archived && <IssueForm projectId={projectId}
      onCancel={() => { returnFocus.current = true; setCreating(false); }}
      onSaved={issue => router.push(issueHref(projectId, issue.id))} />}
    {error ? <div className={workspace.empty}>
      <p role="alert">{missing ? "This project is no longer available to this account." : "Issues couldn’t load. Check your connection and try again."}</p>
      {!missing && <Button variant="secondary" onClick={retry}>Try again</Button>}
    </div> : !data ? <p className={workspace.loading} role="status">Loading issues…</p>
      : <>
        {!data.items.length && <div className={workspace.empty}><h3>{offset ? "No issues on this page." : "No issues yet."}</h3>
          <p>{offset ? "Go back to the previous page." : archived ? "Restore this project when you’re ready to add work." : "Create a task, bug, or feature to take your next step."}</p></div>}
        <ul className={styles.list}>{data.items.map(issue => <li key={issue.id}>
          <Link href={issueHref(projectId, issue.id)} className={styles.card}>
            <h3>{issue.title}</h3>
            <div className={styles.attributes}><span>Type: {ISSUE_TYPES[issue.type]}</span><span>Status: {ISSUE_STATUSES[issue.status]}</span><span>Priority: {ISSUE_PRIORITIES[issue.priority]}</span></div>
            <p className={styles.date}>Created <time dateTime={issue.created_at}>{projectDate(issue.created_at)}</time></p>
          </Link>
        </li>)}</ul>
        {(offset > 0 || data.has_more) && <nav className={workspace.pagination} aria-label="Issue pages">
          <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - ISSUE_PAGE_SIZE))}>Previous</Button>
          <span aria-live="polite">Page {Math.floor(offset / ISSUE_PAGE_SIZE) + 1}</span>
          <Button variant="secondary" disabled={!data.has_more} onClick={() => setOffset(value => value + ISSUE_PAGE_SIZE)}>Next</Button>
        </nav>}
      </>}
  </section>;
}
