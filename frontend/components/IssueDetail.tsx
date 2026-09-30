"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/useApi";
import { projectDate, type Project } from "@/lib/projects";
import { issueCollectionPath, ISSUE_TYPES, ISSUE_STATUSES, ISSUE_PRIORITIES, type Issue } from "@/lib/issues";
import { Button, ButtonLink } from "./Button";
import { WorkspaceState } from "./Workspace";
import IssueForm from "./IssueForm";
import IssueComments from "./IssueComments";
import IssueLabels from "./IssueLabels";
import workspace from "./Workspace.module.css";
import styles from "./Issues.module.css";

function SavedIssue({ initialIssue, project }: { initialIssue: Issue; project: Project }) {
  const [issue, setIssue] = useState(initialIssue);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => { if (message) messageRef.current?.focus(); }, [message]);
  useEffect(() => {
    if (!editing && returnFocus.current) { headingRef.current?.focus(); returnFocus.current = false; }
  }, [editing]);
  return <div className={workspace.page}>
    <Link href={`/projects/${project.id}`} className={workspace.back}>← Back to {project.name}</Link>
    <header className={workspace.heading}><div><p className="eyebrow">Issue details</p>
      <h1 ref={headingRef} tabIndex={-1}>{issue.title}</h1><p>One step toward something that matters.</p></div>
      {!project.archived_at && !editing && <Button onClick={() => { setMessage(""); setEditing(true); }}>Edit issue</Button>}
    </header>
    {project.archived_at && <section className={workspace.archiveNotice} aria-labelledby="issue-archived-heading">
      <h2 id="issue-archived-heading">This project is archived.</h2>
      <p>You can read this issue. Restore the project before changing its details or status.</p>
      <Link href={`/projects/${project.id}`}>Open project to restore it</Link>
    </section>}
    {message && <p role="status" ref={messageRef} tabIndex={-1} className={workspace.successNotice}>{message}</p>}
    {editing && !project.archived_at && <IssueForm projectId={project.id} issue={issue}
      onCancel={() => { returnFocus.current = true; setEditing(false); }}
      onSaved={saved => { setIssue(saved); setEditing(false); setMessage("Issue changes saved."); }} />}
    <section className={workspace.detail} aria-labelledby="issue-about-heading">
      <h2 id="issue-about-heading">About this issue</h2>
      <div className={`${styles.attributes} ${styles.detailAttributes}`}>
        <span>Type: {ISSUE_TYPES[issue.type]}</span><span>Status: {ISSUE_STATUSES[issue.status]}</span><span>Priority: {ISSUE_PRIORITIES[issue.priority]}</span>
      </div>
      <p className={workspace.description}>{issue.description || "No description added."}</p>
      <dl className={workspace.metadata}>
        <div><dt>Created</dt><dd><time dateTime={issue.created_at}>{projectDate(issue.created_at)}</time></dd></div>
        <div><dt>Last updated</dt><dd><time dateTime={issue.updated_at}>{projectDate(issue.updated_at)}</time></dd></div>
        <div><dt>Visibility</dt><dd>Only you</dd></div>
      </dl>
    </section>
    <IssueLabels projectId={project.id} issueId={issue.id} labels={issue.labels} archived={!!project.archived_at}
      onSaved={labels => setIssue(previous => ({ ...previous, labels }))} />
    <IssueComments projectId={project.id} issueId={issue.id} archived={!!project.archived_at} />
  </div>;
}

export default function IssueDetail({ projectId, issueId }: { projectId: string; issueId: string }) {
  const projectResult = useApi<Project>(`/api/projects/${encodeURIComponent(projectId)}`);
  const issueResult = useApi<Issue>(`${issueCollectionPath(projectId)}/${encodeURIComponent(issueId)}`);
  const error = projectResult.error || issueResult.error;
  if (error) {
    const missing = error.status === 404 || error.status === 422;
    return <WorkspaceState title={missing ? "Issue not found." : "This issue couldn’t load."} error
      retry={missing ? undefined : () => { projectResult.retry(); issueResult.retry(); }}>
      <p>{missing ? "It may not exist in this project, or it may belong to another account." : "Check your connection and try again."}</p>
      <ButtonLink href="/projects" variant="secondary">Back to projects</ButtonLink>
    </WorkspaceState>;
  }
  if (!projectResult.data || !issueResult.data) return <WorkspaceState title="Opening your issue…"><p>Loading its saved details.</p></WorkspaceState>;
  return <SavedIssue key={issueResult.data.id} initialIssue={issueResult.data} project={projectResult.data} />;
}
