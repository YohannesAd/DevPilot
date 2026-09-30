export type PublicUser = { id: string; email: string; display_name: string; created_at: string; updated_at: string };
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options, credentials: "include", cache: "no-store",
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    });
  } catch { throw new ApiError(0, "unavailable", "We couldn’t connect. Please try again in a moment."); }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const retry = response.headers?.get("Retry-After");
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : undefined;
    throw new ApiError(response.status, data?.error?.code ?? ([502, 503, 504].includes(response.status) ? "proxy_unavailable" : "request_failed"), "Something went wrong. Please try again.",
      seconds !== undefined && Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined);
  }
  return response.status === 204 ? undefined as T : response.json();
}
