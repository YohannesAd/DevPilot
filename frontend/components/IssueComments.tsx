"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useOrganizationAction } from "@/lib/useOrganizationAction";
import { commentsPath, type Comment, type Page, ORGANIZATION_PAGE_SIZE as SIZE } from "@/lib/organization";
import { useWorkspaceUser } from "./Workspace";
import { Button } from "./Button";
import CommentForm from "./CommentForm";
import ConfirmDialog from "./ConfirmDialog";
import styles from "./Organization.module.css";

function CommentItem({ initial, path, editable, onDeleted }: { initial: Comment; path: string; editable: boolean; onDeleted: () => void }) {
  const [comment, setComment] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const editRef = useRef<HTMLButtonElement>(null);
  const action = useOrganizationAction();
  useEffect(() => { if (!editing && message) editRef.current?.focus(); }, [editing, message]);
  return <li className={styles.item}>
    <div className={styles.meta}><strong>{comment.author.display_name}</strong>
      <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time>
      {comment.edited && <span>Edited <time dateTime={comment.updated_at}>{new Date(comment.updated_at).toLocaleString()}</time></span>}
    </div>
    {editing ? <CommentForm path={path} comment={comment} onSaved={saved => { setComment(saved); setEditing(false); setMessage("Comment saved."); }}
      onCancel={() => { setEditing(false); setMessage("Editing cancelled."); }} /> : <p className={styles.body}>{comment.body}</p>}
    {message && <p role="status">{message}</p>}
    {editable && !editing && <div className={styles.actions}>
      <Button ref={editRef} variant="secondary" onClick={() => { setMessage(""); setEditing(true); }}>Edit comment</Button>
      <Button variant="secondary" onClick={() => { action.setError(""); setConfirming(true); }}>Delete comment</Button>
    </div>}
    {confirming && <ConfirmDialog title="Delete this comment?" cancelLabel="Keep comment" confirmLabel="Delete comment" pendingLabel="Deleting…"
      pending={action.pending} error={action.error} onCancel={() => setConfirming(false)}
      onConfirm={() => void action.run(() => api<void>(`${path}/${comment.id}`, { method: "DELETE" }), onDeleted)}>
      <p>This permanently removes the comment. The issue and its other comments are preserved.</p>
    </ConfirmDialog>}
  </li>;
}

export default function IssueComments({ projectId, issueId, archived }: { projectId: string; issueId: string; archived: boolean }) {
  const user = useWorkspaceUser();
  const path = commentsPath(projectId, issueId);
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const { data, error, retry } = useApi<Page<Comment>>(`${path}?limit=${SIZE}&offset=${offset}`);
  return <section className={styles.section} aria-labelledby="comments-heading">
    <div className={styles.heading}><h2 id="comments-heading" ref={heading} tabIndex={-1}>Comments</h2><Button variant="secondary" onClick={retry}>Refresh comments</Button></div>
    {archived ? <p className={styles.hint}>Comments are read-only while this project is archived.</p>
      : <CommentForm path={path} onSaved={() => { setMessage("Comment added. Comments are shown oldest first; use Newer comments to reach the end."); retry(); }} />}
    {message && <p role="status">{message}</p>}
    {error ? <p role="alert" className={styles.error}>Comments could not load. Check your access or connection, then refresh this section.</p>
      : !data ? <p role="status">Loading comments…</p> : <>
        {!data.items.length && <p>{offset ? "No comments on this page. Use Older comments." : "No comments yet."}</p>}
        <ol className={styles.list}>{data.items.map(comment => <CommentItem key={comment.id} initial={comment} path={path}
          editable={!archived && comment.author.id === user.id} onDeleted={() => {
            setMessage("Comment deleted."); heading.current?.focus(); retry();
          }} />)}</ol>
        {(offset > 0 || data.has_more) && <nav className={styles.actions} aria-label="Comment pages">
          <Button variant="secondary" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - SIZE))}>Older comments</Button>
          <span>Page {offset / SIZE + 1} · oldest first</span>
          <Button variant="secondary" disabled={!data.has_more} onClick={() => setOffset(value => value + SIZE)}>Newer comments</Button>
        </nav>}
      </>}
  </section>;
}
