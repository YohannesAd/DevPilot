"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "@/components/SiteShell";
import { Button } from "@/components/Button";
import { api, ApiError, type PublicUser } from "@/lib/api";
import styles from "./page.module.css";

export default function Account() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setFailed(false);
    api<PublicUser>("/api/users/me").then(data => { if (active) setUser(data); }).catch(err => {
      if (!active) return;
      if (err instanceof ApiError && err.status === 401) router.replace("/login");
      else setFailed(true);
    });
    return () => { active = false; };
  }, [router, attempt]);

  async function logout() {
    if (pending) return;
    setPending(true); setError("");
    try { await api<void>("/api/auth/logout", { method: "POST" }); router.replace("/login"); }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) { router.replace("/login"); return; }
      setError("We couldn’t log you out. Please try again."); setPending(false);
    }
  }

  return <SiteShell page="account">{!user ? <section className={styles.state}>
    <p className="eyebrow">Your DevPilot account</p>
    <h1>{failed ? "Let’s try that again." : "Getting your space ready…"}</h1>
    <p role={failed ? "alert" : "status"}>{failed ? "We couldn’t load your account. Check your connection and try again." : "Checking your account. Just a moment."}</p>
    {failed && <Button onClick={() => setAttempt(value => value + 1)}>Try again</Button>}
  </section> : <div className={styles.page}>
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
    <section className={styles.next}><span aria-hidden="true">↗</span><div><h2>A place for what’s next.</h2><p>Project and issue tools are on the way. For now, your DevPilot account is ready.</p></div></section>
  </div>}</SiteShell>;
}
