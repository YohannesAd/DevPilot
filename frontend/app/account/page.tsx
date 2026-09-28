"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Workspace, { useWorkspaceUser } from "@/components/Workspace";
import { Button, ButtonLink } from "@/components/Button";
import { api, ApiError } from "@/lib/api";
import styles from "./page.module.css";

function Account() {
  const router = useRouter();
  const user = useWorkspaceUser();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (pending) return;
    setPending(true); setError("");
    try { await api<void>("/api/auth/logout", { method: "POST" }); router.replace("/login"); }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) { router.replace("/login"); return; }
      setError("We couldn’t log you out. Please try again."); setPending(false);
    }
  }

  return <div className={styles.page}>
    <div className={styles.heading}><div><p className="eyebrow">Your personal space</p><h1>You’re right at home, {user.display_name.split(" ")[0]}.</h1><p>A fresh perspective. A little room to build.</p></div><span className={styles.badge}>Signed in</span></div>
    <div className={styles.grid}>
      <section className={styles.card} aria-labelledby="profile-title">
        <div className={styles.profileTop}><span className={styles.avatar} aria-hidden="true">{user.display_name.slice(0, 1).toUpperCase()}</span><div><h2 id="profile-title">Your account</h2><p>The person behind the good ideas.</p></div></div>
        <dl className={styles.details}><div><dt>Display name</dt><dd>{user.display_name}</dd></div><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Member since</dt><dd>{new Date(user.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</dd></div></dl>
      </section>
      <section className={styles.card} aria-labelledby="session-title">
        <svg className={styles.sessionIcon} width="30" height="34" viewBox="0 0 30 34" fill="none" aria-hidden="true"><path d="M15 2 27 7v10c0 7-7 12-12 15C10 29 3 24 3 17V7L15 2Z" stroke="currentColor" strokeWidth="1.5"/><path d="m9 17 4 4 8-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <h2 id="session-title">You’re safely signed in.</h2>
        <p className={styles.sessionCopy}>You can close this tab and come back later. When you’re done on this device, log out here.</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <Button variant="secondary" onClick={logout} disabled={pending}>{pending ? "Logging out…" : "Log out"} <span aria-hidden="true">↗</span></Button>
        <p className={styles.sessionNote} role={pending ? "status" : undefined}>{pending ? "Ending your session…" : "Your session lasts up to seven days."}</p>
      </section>
    </div>
    <section className={styles.next}><span aria-hidden="true">↗</span><div><h2>A place for what’s next.</h2><p>Your ideas have a home. Pick up a project or start something new.</p><ButtonLink href="/dashboard" variant="secondary">Go to workspace</ButtonLink></div></section>
  </div>;
}

export default function AccountPage() { return <Workspace page="account"><Account /></Workspace>; }
