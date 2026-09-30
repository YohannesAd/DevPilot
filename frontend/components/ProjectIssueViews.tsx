"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ProjectIssues from "./ProjectIssues";
import IssueBoard from "./IssueBoard";
import styles from "./Workspace.module.css";
import issues from "./Issues.module.css";

export default function ProjectIssueViews({ projectId, archived }: { projectId: string; archived: boolean }) {
  const board = useSearchParams().get("view") === "board";
  const path = `/projects/${encodeURIComponent(projectId)}`;
  return <section aria-label="Project work" className={issues.section}>
    <nav className={styles.projectViews} aria-label="Issue views">
      <Link href={path} scroll={false} aria-current={!board ? "page" : undefined}>List</Link>
      <Link href={`${path}?view=board`} scroll={false} aria-current={board ? "page" : undefined}>Board</Link>
    </nav>
    {board ? <IssueBoard key={`${projectId}:${archived}`} projectId={projectId} archived={archived} />
      : <ProjectIssues key={projectId} projectId={projectId} archived={archived} />}
  </section>;
}
