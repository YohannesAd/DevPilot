import type { Issue } from "./issues";
import type { Project } from "./projects";
type RecentIssue = Pick<Issue, "id" | "project_id" | "title" | "status" | "type" | "priority" | "updated_at"> & { project_name: string };
export type DashboardSummary = {
  active_projects: number;
  total_issues: number;
  status_counts: Record<Issue["status"], number>;
  recent_projects: Project[];
  recent_issues: RecentIssue[];
};
