"use client";
import { useId, useState } from "react";
import { api } from "@/lib/api";
import { useOrganizationAction } from "@/lib/useOrganizationAction";
import type { Comment } from "@/lib/organization";
import { Button } from "./Button";
import styles from "./Organization.module.css";

export default function CommentForm({ path, comment, onSaved, onCancel }: {
  path: string; comment?: Comment; onSaved: (comment: Comment) => void; onCancel?: () => void;
}) {
  const [body, setBody] = useState(comment?.body ?? "");
  const action = useOrganizationAction();
  const id = useId();
  return <form className={styles.form} noValidate aria-busy={action.pending} onSubmit={event => {
    event.preventDefault();
    const text = body.trim();
    if (!text || [...text].length > 5000) { action.setError("Enter a comment between 1 and 5,000 characters."); return; }
    void action.run(() => api<Comment>(comment ? `${path}/${comment.id}` : path,
      { method: comment ? "PATCH" : "POST", body: JSON.stringify({ body: text }) }), saved => { onSaved(saved); if (!comment) setBody(""); });
  }}>
    <label htmlFor={id}>{comment ? "Edit comment" : "Add a comment"}</label>
    <textarea id={id} value={body} onChange={event => setBody(event.target.value)} disabled={action.pending}
      required aria-describedby={`${id}-help`} aria-invalid={!!action.error} autoFocus={!!comment} />
    <p id={`${id}-help`} className={styles.hint}>Plain text, 1–5,000 characters.</p>
    {action.error && <p role="alert" className={styles.error}>{action.error}</p>}
    <div className={styles.actions}><Button disabled={action.pending}>{action.pending ? "Saving…" : comment ? "Save comment" : "Add comment"}</Button>
      {onCancel && <Button type="button" variant="secondary" disabled={action.pending} onClick={onCancel}>Cancel</Button>}</div>
  </form>;
}
