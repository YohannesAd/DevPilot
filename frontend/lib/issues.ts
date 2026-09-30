import { api } from "./api";
import type { Label } from "./organization";

export const ISSUE_TYPES = { task: "Task", bug: "Bug", feature: "Feature" } as const;
export const ISSUE_STATUSES = { backlog: "Backlog", todo: "Todo", in_progress: "In Progress", review: "Review", done: "Done" } as const;
export const ISSUE_PRIORITIES = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" } as const;
export type IssueFields = {
  title: string; description: string | null;
  type: keyof typeof ISSUE_TYPES; status: keyof typeof ISSUE_STATUSES; priority: keyof typeof ISSUE_PRIORITIES;
};
export type Issue = IssueFields & { id: string; project_id: string; created_at: string; updated_at: string; labels: Label[] };
export type IssuePage = { items: Issue[]; has_more: boolean };
export const ISSUE_PAGE_SIZE = 20;
export const issueCollectionPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/issues`;
export const issueHref = (projectId: string, issueId: string) => `/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`;
export function createIssue(projectId: string, fields: IssueFields) {
  return api<Issue>(issueCollectionPath(projectId), { method: "POST", body: JSON.stringify(fields) });
}
export function updateIssue(projectId: string, issueId: string, fields: Partial<IssueFields>) {
  return api<Issue>(`${issueCollectionPath(projectId)}/${encodeURIComponent(issueId)}`, {
    method: "PATCH", body: JSON.stringify(fields),
  });
}
