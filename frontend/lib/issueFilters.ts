export const FILTER_KEYS = ["status", "priority", "type", "label_id", "q"] as const;
export type IssueFilters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

export function readIssueFilters(params: { get: (key: string) => string | null }): IssueFilters {
  return Object.fromEntries(FILTER_KEYS.map(key => [key, params.get(key)]).filter(([, value]) => !!value));
}
export function filterQuery(filters: IssueFilters): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) if (filters[key]) params.set(key, filters[key]!);
  return params.toString();
}
export function projectViewHref(projectId: string, view: string, filters: IssueFilters = {}): string {
  const params = new URLSearchParams(filterQuery(filters));
  if (view === "board" || view === "labels") params.set("view", view);
  return `/projects/${encodeURIComponent(projectId)}${params.size ? `?${params}` : ""}`;
}
