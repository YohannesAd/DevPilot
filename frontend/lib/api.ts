export type PublicUser = { id: string; email: string; display_name: string; created_at: string; updated_at: string };
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}${path}`, {
      ...options, credentials: "include", cache: "no-store",
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    });
  } catch { throw new ApiError(0, "unavailable", "We couldn’t connect. Please try again in a moment."); }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error?.code ?? "request_failed", "Something went wrong. Please try again.");
  }
  return response.status === 204 ? undefined as T : response.json();
}
