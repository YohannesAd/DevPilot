"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useOrganizationAction } from "@/lib/useOrganizationAction";
import { labelsPath, type Label, type Page, ORGANIZATION_PAGE_SIZE as SIZE } from "@/lib/organization";
import { Button } from "./Button";
import LabelForm from "./LabelForm";
import LabelBadges from "./LabelBadges";
import ConfirmDialog from "./ConfirmDialog";
import styles from "./Organization.module.css";

export default function ProjectLabels({ projectId, archived }: { projectId: string; archived: boolean }) {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Label | null>(null);
  const [deleting, setDeleting] = useState<Label | null>(null);
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const { data, error, retry } = useApi<Page<Label>>(`${labelsPath(projectId)}?limit=${SIZE}&offset=${offset}`);
  const action = useOrganizationAction();
  function changed(text: string) { setMessage(text); setEditing(null); setDeleting(null); heading.current?.focus(); retry(); }
  return <section className={styles.section} aria-labelledby="labels-heading">
    <div className={styles.heading}><h2 id="labels-heading" ref={heading} tabIndex={-1}>Project labels</h2>
      <Button variant="secondary" onClick={retry}>Refresh labels</Button></div>
    <p className={styles.hint}>{archived ? "Labels are read-only while this project is archived." : "Organize work with names that mean something to you. Assign labels from an issue's details."}</p>
    {!archived && <LabelForm projectId={projectId} onSaved={() => changed("Label created. Labels are listed alphabetically.")} />}
    {message && <p role="status">{message}</p>}
    {error ? <p role="alert" className={styles.error}>Labels could not load. Check your access or connection, then refresh this section.</p>
      : !data ? <p role="status">Loading labels…</p> : <>
        {!data.items.length && <p>{offset ? "No labels on this page. Go to the previous page." : "No labels yet."}</p>}
        <ul className={styles.list}>{data.items.map(label => <li className={styles.item} key={label.id}>
          <LabelBadges labels={[label]} />
          {editing?.id === label.id && !archived ? <LabelForm key={label.id} projectId={projectId} label={label}
            onSaved={() => changed("Label saved. Assigned issues use the updated name and color.")} onCancel={() => { setEditing(null); heading.current?.focus(); }} />
            : !archived && <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setEditing(label)}>Edit {label.name}</Button>
              <Button variant="secondary" onClick={() => { action.setError(""); setDeleting(label); }}>Delete {label.name}</Button>
            </div>}
        </li>)}</ul>
        {(offset > 0 || data.has_more) && <nav className={styles.actions} aria-label="Label pages">
          <Button variant="secondary" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - SIZE))}>Previous labels</Button>
          <span>Page {offset / SIZE + 1}</span>
          <Button variant="secondary" disabled={!data.has_more} onClick={() => setOffset(value => value + SIZE)}>Next labels</Button>
        </nav>}
      </>}
    {deleting && !archived && <ConfirmDialog title={`Delete label “${deleting.name}”?`} cancelLabel="Keep label" confirmLabel="Delete label" pendingLabel="Deleting…"
      pending={action.pending} error={action.error} onCancel={() => setDeleting(null)} onConfirm={() => void action.run(
        () => api<void>(`${labelsPath(projectId)}/${deleting.id}`, { method: "DELETE" }), () => changed("Label deleted. Issues were preserved."))}>
      <p>This permanently deletes the label and removes it from every issue in this project. The issues themselves are preserved.</p>
    </ConfirmDialog>}
  </section>;
}
