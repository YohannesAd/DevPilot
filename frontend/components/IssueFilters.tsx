"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ISSUE_STATUSES, ISSUE_PRIORITIES, ISSUE_TYPES } from "@/lib/issues";
import { projectViewHref, type IssueFilters as Filters } from "@/lib/issueFilters";
import { useApi } from "@/lib/useApi";
import { labelsPath, type Label, type Page } from "@/lib/organization";
import { Button } from "./Button";
import styles from "./IssueFilters.module.css";

export default function IssueFilters({ projectId, view, filters }: { projectId: string; view: string; filters: Filters }) {
  const router = useRouter();
  const [draft, setDraft] = useState(filters);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [selectedName, setSelectedName] = useState("Selected label (not on this page)");
  const labels = useApi<Page<Label>>(`${labelsPath(projectId)}?limit=20&offset=${offset}`);
  return <form className={styles.form} aria-label="Issue filters" onSubmit={event => {
    event.preventDefault();
    const q = (draft.q ?? "").trim();
    if ([...q].length > 200) { setError("Keep title search within 200 characters."); return; }
    setError(""); router.push(projectViewHref(projectId, view, { ...draft, q }), { scroll: false });
  }}>
    <div className={styles.controls}>
      {([{ key: "status", text: "Status", values: ISSUE_STATUSES }, { key: "priority", text: "Priority", values: ISSUE_PRIORITIES },
        { key: "type", text: "Type", values: ISSUE_TYPES }] as const).map(({ key, text, values }) => <div key={key}>
        <label htmlFor={`filter-${key}`}>{text}</label>
        <select id={`filter-${key}`} value={draft[key] ?? ""} onChange={event => setDraft(old => ({ ...old, [key]: event.target.value }))}>
          <option value="">All {text.toLowerCase()} values</option>
          {draft[key] && !(draft[key]! in values) && <option value={draft[key]}>Invalid value: {draft[key]}</option>}
          {Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>)}
      <div><label htmlFor="filter-label">Label</label>
        <select id="filter-label" value={draft.label_id ?? ""} onChange={event => {
          setDraft(old => ({ ...old, label_id: event.target.value }));
          setSelectedName(event.target.selectedOptions[0].textContent ?? "Selected label");
        }}>
          <option value="">All labels</option>
          {draft.label_id && !labels.data?.items.some(label => label.id === draft.label_id) && <option value={draft.label_id}>{selectedName}</option>}
          {labels.data?.items.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}
        </select>
        {labels.error ? <><p role="alert">Label choices could not load.</p><Button type="button" variant="secondary" onClick={labels.retry}>Retry labels</Button></>
          : !labels.data ? <p role="status">Loading label choices…</p> : <>
            {!labels.data.items.length && <p>No labels on this page.</p>}
            {(offset > 0 || labels.data.has_more) && <div className={styles.actions}>
              <Button type="button" variant="secondary" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 20))}>Previous labels</Button>
              <Button type="button" variant="secondary" disabled={!labels.data.has_more} onClick={() => setOffset(value => value + 20)}>More labels</Button>
            </div>}
          </>}
      </div>
      <div className={styles.search}><label htmlFor="filter-search">Search issue titles</label>
        <input id="filter-search" type="search" value={draft.q ?? ""} onChange={event => setDraft(old => ({ ...old, q: event.target.value }))} aria-describedby="filter-help" />
      </div>
    </div>
    <p id="filter-help">Matches all selected filters. Title search ignores case and searches the whole project.</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.actions}><Button type="submit">Apply filters</Button>
      <Link href={projectViewHref(projectId, view)} scroll={false} onClick={() => { setDraft({}); setError(""); }}>Clear filters</Link></div>
  </form>;
}
