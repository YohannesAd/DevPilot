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
    const controller = new AbortController();
    setResult({ path });
    api<T>(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ path, data });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) router.replace(loginDestination());
      else setResult({ path, error });
    });
    return () => controller.abort();
  }, [path, attempt, router]);
  const current = result.path === path ? result : { path };
  return { ...current, loading: current.data === undefined && !current.error,
    retry: () => { setResult({ path }); setAttempt(value => value + 1); } };
}
