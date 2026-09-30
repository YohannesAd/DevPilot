"use client";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import type { DashboardSummary } from "@/lib/dashboard";
import { ISSUE_STATUSES, ISSUE_PRIORITIES, ISSUE_TYPES, issueHref } from "@/lib/issues";
import { projectDate } from "@/lib/projects";
import { useWorkspaceUser, WorkspaceState } from "./Workspace";
import { Button, ButtonLink } from "./Button";
import workspace from "./Workspace.module.css";
import styles from "./Dashboard.module.css";

export default function Dashboard() {
  const user = useWorkspaceUser();
  const { data, error, retry } = useApi<DashboardSummary>("/api/dashboard");
  return <div className={workspace.page}>
    <header className={workspace.heading}><div><p className="eyebrow">Your workspace</p>
      <h1>A little focus, {user.display_name.split(" ")[0]}.</h1><p>Your active work, as it stands today.</p></div>
      <ButtonLink href="/projects?create=1#new-project">Create project</ButtonLink></header>
    {error ? <WorkspaceState title="Your dashboard couldn’t load." error retry={retry}><p>Check your connection and try again.</p></WorkspaceState>
      : !data ? <p role="status" className={workspace.loading}>Loading your active work…</p> : <>
        <div className={styles.scope}><p>Only your active projects. Issue totals include all five statuses, including Done. Archived projects and their issues are excluded.</p>
          <Button variant="secondary" onClick={retry}>Refresh dashboard</Button></div>
        <dl className={styles.totals}>
          <div><dt>Active projects</dt><dd>{data.active_projects}</dd></div>
          <div><dt>Issues in active projects</dt><dd>{data.total_issues}</dd></div>
        </dl>
        <section aria-labelledby="status-summary"><h2 id="status-summary">Issues by status</h2>
          <dl className={styles.statuses}>{Object.entries(ISSUE_STATUSES).map(([status, label]) => <div key={status}>
            <dt>{label}</dt><dd>{data.status_counts[status as keyof typeof ISSUE_STATUSES]}</dd>
          </div>)}</dl>
        </section>
        {!data.active_projects && <section className={workspace.empty}><h2>No active projects yet.</h2>
          <p>Create your first project, or restore one from Archived, to bring work into this dashboard.</p>
          <ButtonLink href="/projects?create=1#new-project">Create project</ButtonLink><Link href="/projects?status=archived">View archived projects</Link>
        </section>}
        <section className={styles.section} aria-labelledby="recent-issues"><h2 id="recent-issues">Recently updated issues</h2>
          <p className={styles.hint}>Up to six issues from active projects, including Done. Ordered by issue update time; comments and label assignments do not change that time.</p>
          {!data.recent_issues.length ? <p>No issues in active projects yet. Open a project to add one.</p>
            : <ul className={styles.list}>{data.recent_issues.map(issue => <li key={issue.id}>
              <Link href={issueHref(issue.project_id, issue.id)} className={styles.card}><h3>{issue.title}</h3><p>{issue.project_name}</p>
                <p>Status: {ISSUE_STATUSES[issue.status]} · Type: {ISSUE_TYPES[issue.type]} · Priority: {ISSUE_PRIORITIES[issue.priority]}</p>
                <p>Updated <time dateTime={issue.updated_at}>{projectDate(issue.updated_at)}</time></p>
              </Link>
            </li>)}</ul>}
        </section>
        <section className={styles.section} aria-labelledby="recent-projects"><h2 id="recent-projects">Recent active projects</h2>
          <p className={styles.hint}>Up to four projects, ordered by project update time. Issue activity does not change the project timestamp.</p>
          <ul className={styles.list}>{data.recent_projects.map(project => <li key={project.id}>
            <Link href={`/projects/${project.id}`} className={styles.card}><h3>{project.name}</h3><p>{project.description || "No description added."}</p>
              <p>Updated <time dateTime={project.updated_at}>{projectDate(project.updated_at)}</time></p></Link>
          </li>)}</ul>
          <ButtonLink href="/projects" variant="secondary">View all projects</ButtonLink>
        </section>
      </>}
  </div>;
}
