"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ProjectIssues from "./ProjectIssues";
import IssueBoard from "./IssueBoard";
import ProjectLabels from "./ProjectLabels";
import styles from "./Workspace.module.css";
import issues from "./Issues.module.css";

export default function ProjectIssueViews({ projectId, archived }: { projectId: string; archived: boolean }) {
  const view = useSearchParams().get("view");
  const board = view === "board";
  const labels = view === "labels";
  const path = `/projects/${encodeURIComponent(projectId)}`;
  return <section aria-label="Project work" className={issues.section}>
    <nav className={styles.projectViews} aria-label="Issue views">
      <Link href={path} scroll={false} aria-current={!board && !labels ? "page" : undefined}>List</Link>
      <Link href={`${path}?view=board`} scroll={false} aria-current={board ? "page" : undefined}>Board</Link>
      <Link href={`${path}?view=labels`} scroll={false} aria-current={labels ? "page" : undefined}>Labels</Link>
    </nav>
    {labels ? <ProjectLabels key={`${projectId}:${archived}`} projectId={projectId} archived={archived} />
      : board ? <IssueBoard key={`${projectId}:${archived}`} projectId={projectId} archived={archived} />
      : <ProjectIssues key={projectId} projectId={projectId} archived={archived} />}
  </section>;
}
