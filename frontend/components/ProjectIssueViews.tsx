"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ProjectIssues from "./ProjectIssues";
import IssueBoard from "./IssueBoard";
import ProjectLabels from "./ProjectLabels";
import IssueFilters from "./IssueFilters";
import { readIssueFilters, filterQuery, projectViewHref } from "@/lib/issueFilters";
import styles from "./Workspace.module.css";
import issues from "./Issues.module.css";

export default function ProjectIssueViews({ projectId, archived }: { projectId: string; archived: boolean }) {
  const params = useSearchParams();
  const view = params.get("view");
  const filters = readIssueFilters(params);
  const query = filterQuery(filters);
  const board = view === "board";
  const labels = view === "labels";
  return <section aria-label="Project work" className={issues.section}>
    <nav className={styles.projectViews} aria-label="Issue views">
      <Link href={projectViewHref(projectId, "list", filters)} scroll={false} aria-current={!board && !labels ? "page" : undefined}>List</Link>
      <Link href={projectViewHref(projectId, "board", filters)} scroll={false} aria-current={board ? "page" : undefined}>Board</Link>
      <Link href={projectViewHref(projectId, "labels", filters)} scroll={false} aria-current={labels ? "page" : undefined}>Labels</Link>
    </nav>
    {!labels && <IssueFilters key={`filters:${projectId}:${query}`} projectId={projectId} view={board ? "board" : "list"} filters={filters} />}
    {labels ? <ProjectLabels key={`${projectId}:${archived}`} projectId={projectId} archived={archived} />
      : board ? <IssueBoard key={`${projectId}:${archived}:${query}`} projectId={projectId} archived={archived} filters={filters} />
      : <ProjectIssues key={`${projectId}:${query}`} projectId={projectId} archived={archived} filters={filters} />}
  </section>;
}
