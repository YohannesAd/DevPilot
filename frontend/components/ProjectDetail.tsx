"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { loginDestination } from "@/lib/navigation";
import { projectDate, setProjectArchived, type Project } from "@/lib/projects";
import { Button, ButtonLink } from "./Button";
import ProjectForm from "./ProjectForm";
import ConfirmDialog from "./ConfirmDialog";
import styles from "./Workspace.module.css";

export default function ProjectDetail({ initialProject }: { initialProject: Project }) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  useEffect(() => {
    if (!confirming && (error || message)) feedbackRef.current?.focus();
  }, [confirming, error, message]);
  useEffect(() => {
    if (!editing && focusHeading.current) { headingRef.current?.focus(); focusHeading.current = false; }
  }, [editing]);

  async function changeArchive(archived: boolean) {
    if (submitting.current) return;
    submitting.current = true; setPending(true); setError(""); setMessage("");
    try {
      const saved = await setProjectArchived(project.id, archived);
      setProject(saved); setConfirming(false);
      setMessage(archived ? "Project archived. Its data is preserved, and you can restore it anytime."
        : "Project restored. It’s back in your active projects.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { router.replace(loginDestination()); return; }
      setError(err instanceof ApiError && err.status === 404 ? "This project is no longer available to this account. Return to your projects."
        : err instanceof ApiError && err.code === "csrf_failed" ? "This request couldn’t be verified. Refresh the page and try again."
        : "We couldn’t confirm the change. Try again, or reload to check the saved state. Repeating this action is safe.");
    } finally {
      submitting.current = false; setPending(false);
    }
  }

  function cancelEdit() { focusHeading.current = true; setEditing(false); }

  return <div className={styles.page}>
    <Link href={project.archived_at ? "/projects?status=archived" : "/projects"} className={styles.back}>
      ← {project.archived_at ? "Archived projects" : "All projects"}</Link>
    <header className={styles.heading}><div><p className="eyebrow">Project overview</p>
      <h1 ref={headingRef} tabIndex={-1}>{project.name}</h1><p>One idea. A little room to build.</p></div></header>
    {project.archived_at && <section className={styles.archiveNotice} aria-labelledby="archived-heading">
      <h2 id="archived-heading">This project is archived.</h2>
      <p>Its data is preserved. Restore it to edit it and return it to your active projects.</p>
      <p>Archived <time dateTime={project.archived_at}>{projectDate(project.archived_at)}</time></p>
    </section>}
    {!confirming && (error || message) && <p ref={feedbackRef} tabIndex={-1}
      className={error ? styles.errorNotice : styles.successNotice} role={error ? "alert" : "status"}>{error || message}</p>}
    {editing ? <ProjectForm project={project} onCancel={cancelEdit} onSaved={saved => {
      setProject(saved); setEditing(false); setMessage("Project changes saved.");
    }} /> : <div className={styles.managementActions}>
      {project.archived_at ? <Button disabled={pending} onClick={() => changeArchive(false)}>{pending ? "Restoring…" : "Restore project"}</Button>
        : <><Button onClick={() => { setError(""); setMessage(""); setEditing(true); }}>Edit project</Button>
          <Button variant="secondary" onClick={() => { setError(""); setMessage(""); setConfirming(true); }}>Archive project</Button></>}
      {pending && <p role="status">Saving your project…</p>}
    </div>}
    <section className={styles.detail} aria-labelledby="about-title"><h2 id="about-title">About this project</h2>
      <p className={styles.description}>{project.description || "No description added."}</p>
      <dl className={styles.metadata}><div><dt>Created</dt><dd><time dateTime={project.created_at}>{projectDate(project.created_at)}</time></dd></div>
        <div><dt>Last updated</dt><dd><time dateTime={project.updated_at}>{projectDate(project.updated_at)}</time></dd></div>
        <div><dt>Visibility</dt><dd>Only you</dd></div></dl>
    </section>
    {project.archived_at && <div className={styles.listFooter}><ButtonLink href="/projects?status=archived" variant="secondary">View archived projects</ButtonLink></div>}
    {confirming && <ConfirmDialog title="Archive this project?" pending={pending} error={error}
      onCancel={() => { setConfirming(false); setError(""); }} onConfirm={() => changeArchive(true)}>
      <p><strong>{project.name}</strong> will leave your dashboard and active projects. Its data is preserved.
        You can find it in Archived and restore it anytime. Restore it before editing.</p>
    </ConfirmDialog>}
  </div>;
}
