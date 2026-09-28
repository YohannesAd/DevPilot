"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicUser } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import SiteShell from "./SiteShell";
import { Button } from "./Button";
import styles from "./Workspace.module.css";

const UserContext = createContext<PublicUser | null>(null);
export function useWorkspaceUser() {
  const user = useContext(UserContext);
  if (!user) throw new Error("Workspace user requires Workspace");
  return user;
}

export function WorkspaceState({ title, children, retry, error = false }: {
  title: string; children?: ReactNode; retry?: () => void; error?: boolean;
}) {
  return <section className={styles.state} aria-live="polite">
    <h1>{title}</h1><div role={error ? "alert" : "status"}>{children}</div>
    {retry && <Button variant="secondary" onClick={retry}>Try again</Button>}
  </section>;
}

export default function Workspace({ page, children }: {
  page: "dashboard" | "projects" | "project" | "account"; children: ReactNode;
}) {
  const { data: user, error, retry } = useApi<PublicUser>("/api/users/me");
  return <SiteShell page={page}>{user ? <UserContext.Provider value={user}>{children}</UserContext.Provider>
    : <WorkspaceState title={error ? "Your workspace couldn’t load." : "Opening your workspace…"}
        error={!!error} retry={error ? retry : undefined}>
        <p>{error ? "Check your connection and try again." : "Checking your session. Just a moment."}</p>
      </WorkspaceState>}</SiteShell>;
}
