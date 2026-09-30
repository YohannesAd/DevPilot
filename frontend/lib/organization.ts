export const LABEL_COLORS = { blue: "Blue", green: "Green", amber: "Amber", purple: "Purple", rose: "Rose", slate: "Slate" } as const;
export type Label = { id: string; project_id: string; name: string; color: keyof typeof LABEL_COLORS };
export type Comment = { id: string; issue_id: string; body: string; author: { id: string; display_name: string }; created_at: string; updated_at: string; edited: boolean };
export type Page<T> = { items: T[]; has_more: boolean };
export const ORGANIZATION_PAGE_SIZE = 20;
export const labelsPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/labels`;
export const commentsPath = (projectId: string, issueId: string) => `/api/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}/comments`;
