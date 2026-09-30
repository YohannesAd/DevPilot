"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "./api";
import { loginDestination } from "./navigation";

export function useOrganizationAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const generation = useRef(0);
  useEffect(() => { generation.current++; return () => { generation.current++; }; }, []);
  async function run<T>(action: () => Promise<T>, saved: (value: T) => void) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    const current = generation.current;
    try {
      const value = await action();
      if (current === generation.current) saved(value);
    } catch (err) {
      if (current !== generation.current) return;
      if (err instanceof ApiError && err.status === 401) {
        try { router.replace(loginDestination()); }
        catch { setError("Your session expired. Sign in again to continue."); }
      } else setError(err instanceof ApiError && err.code === "project_archived"
        ? "This project is archived. Your draft is preserved. Restore the project and refresh before making changes."
        : err instanceof ApiError && err.code === "label_name_taken" ? "A label with that name already exists. Choose another name."
        : err instanceof ApiError && err.status === 404 ? "This item is no longer available in this project. Refresh this section to check the saved state."
        : err instanceof ApiError && err.code === "csrf_failed" ? "The request could not be verified. Copy your draft before refreshing."
        : err instanceof ApiError && err.status === 422 ? "Check the text length and allowed values, then try again."
        : "We could not confirm the change. Your draft is preserved. Refresh this section before repeating an add to avoid duplicates.");
    } finally {
      if (current === generation.current) { busy.current = false; setPending(false); }
    }
  }
  return { pending, error, setError, run };
}
