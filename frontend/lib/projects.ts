import { api } from "./api";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};
export type ProjectPage = { items: Project[]; has_more: boolean };
export const PROJECT_PAGE_SIZE = 20;
export function createProject(name: string, description: string) {
  return api<Project>("/api/projects", {
    method: "POST", body: JSON.stringify({ name, description: description || null }),
  });
}
export function projectDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
