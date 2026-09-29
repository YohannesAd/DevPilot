"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import styles from "./Workspace.module.css";

export default function ConfirmDialog({ title, children, pending, error, onCancel, onConfirm }: {
  title: string; children: ReactNode; pending: boolean; error: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`} aria-busy={pending}
    onCancel={event => { event.preventDefault(); if (!pending) onCancel(); }}>
    <h2 id={`${id}-title`}>{title}</h2>
    <div id={`${id}-description`}>{children}</div>
    {error && <p ref={errorRef} tabIndex={-1} className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      <Button ref={cancelRef} type="button" variant="secondary" disabled={pending} onClick={onCancel}>Keep active</Button>
      <Button type="button" disabled={pending} onClick={onConfirm}>{pending ? "Archiving…" : "Archive project"}</Button>
    </div>
    {pending && <p role="status">Saving archived state…</p>}
  </dialog>;
}
