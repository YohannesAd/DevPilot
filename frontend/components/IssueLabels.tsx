"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useOrganizationAction } from "@/lib/useOrganizationAction";
import { labelsPath, type Label, type Page, ORGANIZATION_PAGE_SIZE as SIZE } from "@/lib/organization";
import { issueCollectionPath } from "@/lib/issues";
import { Button } from "./Button";
import LabelBadges from "./LabelBadges";
import styles from "./Organization.module.css";

function LabelChoices({ projectId, issueId, assigned, onSaved }: { projectId: string; issueId: string; assigned: Label[]; onSaved: (labels: Label[]) => void }) {
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState("");
  const { data, error, retry } = useApi<Page<Label>>(`${labelsPath(projectId)}?limit=${SIZE}&offset=${offset}`);
  const action = useOrganizationAction();
  function change(label: Label, add: boolean) {
    void action.run(() => api<Label[]>(`${issueCollectionPath(projectId)}/${issueId}/labels/${label.id}`, { method: add ? "PUT" : "DELETE" }), labels => {
      onSaved(labels); setMessage(`${label.name} ${add ? "added" : "removed"}.`);
    });
  }
  return <>
    <Link href={`/projects/${projectId}?view=labels`}>Manage project labels</Link>
    {message && <p role="status">{message}</p>}
    {action.error && <p role="alert" className={styles.error}>{action.error}</p>}
    <div className={styles.actions}>{assigned.map(label => <Button variant="secondary" key={label.id} disabled={action.pending} onClick={() => change(label, false)}>Remove {label.name}</Button>)}</div>
    <Button variant="secondary" disabled={action.pending} onClick={retry}>Refresh available labels</Button>
    {error ? <p role="alert" className={styles.error}>Available labels could not load. Refresh this section to retry.</p> : !data ? <p role="status">Loading available labels…</p> : <>
      {!data.items.length && <p>No labels on this page. Create labels in the project Labels view.</p>}
      <ul className={styles.list}>{data.items.map(label => {
        const selected = assigned.some(row => row.id === label.id);
        return <li key={label.id} className={styles.actions}><LabelBadges labels={[label]} />
          <Button variant="secondary" disabled={selected || action.pending} onClick={() => change(label, true)}>{selected ? `Assigned: ${label.name}` : `Assign ${label.name}`}</Button></li>;
      })}</ul>
      {(offset > 0 || data.has_more) && <nav className={styles.actions} aria-label="Available label pages">
        <Button variant="secondary" disabled={!offset || action.pending} onClick={() => setOffset(value => Math.max(0, value - SIZE))}>Previous labels</Button>
        <span>Page {offset / SIZE + 1}</span>
        <Button variant="secondary" disabled={!data.has_more || action.pending} onClick={() => setOffset(value => value + SIZE)}>Next labels</Button>
      </nav>}
    </>}
  </>;
}

export default function IssueLabels({ projectId, issueId, labels = [], archived, onSaved }: {
  projectId: string; issueId: string; labels: Label[]; archived: boolean; onSaved: (labels: Label[]) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  return <section className={styles.section} aria-labelledby="issue-labels-heading">
    <h2 id="issue-labels-heading" ref={heading} tabIndex={-1}>Labels</h2><LabelBadges labels={labels} />
    {!labels.length && <p>No labels assigned.</p>}
    {archived ? <p className={styles.hint}>Restore the project to change labels.</p>
      : <LabelChoices projectId={projectId} issueId={issueId} assigned={labels} onSaved={saved => { onSaved(saved); heading.current?.focus(); }} />}
  </section>;
}
