import { api } from "./api";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};
export type ProjectPage = { items: Project[]; has_more: boolean };
export const PROJECT_PAGE_SIZE = 20;
export function createProject(name: string, description: string) {
  return api<Project>("/api/projects", {
    method: "POST", body: JSON.stringify({ name, description: description || null }),
  });
}
export function updateProject(id: string, changes: { name?: string; description?: string | null }) {
  return api<Project>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(changes),
  });
}
export function setProjectArchived(id: string, archived: boolean) {
  return api<Project>(`/api/projects/${encodeURIComponent(id)}/${archived ? "archive" : "restore"}`, {
    method: "POST", body: JSON.stringify({}),
  });
}
export function projectDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
