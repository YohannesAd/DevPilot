"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./api";
import { loginDestination } from "./navigation";

export function useApi<T>(path: string) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ path: string; data?: T; error?: ApiError }>({ path: "" });
  useEffect(() => {
    // Let the GET finish, but ignore results from an obsolete effect instance.
    // This also covers Strict Mode replay, path changes, retries and unmounts.
    let active = true;
    setResult({ path });
    api<T>(path).then(data => {
      if (active) setResult({ path, data });
    }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace(loginDestination());
      else setResult({ path, error });
    });
    return () => { active = false; };
  }, [path, attempt, router]);
  const current = result.path === path ? result : { path };
  return { ...current, loading: current.data === undefined && !current.error,
    retry: () => { setResult({ path }); setAttempt(value => value + 1); } };
}
