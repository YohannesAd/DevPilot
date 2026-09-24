"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import SiteShell from "./SiteShell";
import FormField from "./FormField";
import { Button } from "./Button";
import { api, ApiError, type PublicUser } from "@/lib/api";
import styles from "./AuthForm.module.css";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  useEffect(() => { setCreated(!register && new URLSearchParams(window.location.search).get("registered") === "1"); }, [register]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("display_name") ?? "").trim();
    const invalid: Record<string, string> = {};
    if (register && (!name || name.length > 100)) invalid.display_name = "Enter a name between 1 and 100 characters.";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid.email = "Enter a valid email address.";
    if (password.length < (register ? 12 : 1) || password.length > 128) invalid.password = register ? "Use between 12 and 128 characters." : "Enter your password (up to 128 characters).";
    setFields(invalid); setError("");
    if (Object.keys(invalid).length) { (form.elements.namedItem(Object.keys(invalid)[0]) as HTMLInputElement)?.focus(); return; }
    submitting.current = true; setPending(true);
    try {
      await api<PublicUser>(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password, ...(register ? { display_name: name } : {}) }) });
      form.reset();
      router.replace(register ? "/login?registered=1" : "/account");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(code === "email_already_registered" ? "An account with this email already exists. Log in instead." : code === "invalid_credentials" ? "That email and password don’t match. Please try again." : code === "validation_error" ? "Please check your details and try again." : code === "csrf_failed" ? "This request couldn’t be verified. Refresh this page and try again." : "We couldn’t connect right now. Please try again in a moment.");
      setPending(false); submitting.current = false;
    }
  }

  return <SiteShell page={mode}><div className={styles.layout}>
    <section className={styles.story}>
      <p className="eyebrow">{register ? "A fresh place to begin" : "Back to your own space"}</p>
      <h1>{register ? <>Good ideas need<br /><span>a place to start.</span></> : <>Pick up where<br /><span>you left off.</span></>}</h1>
      <p className={styles.description}>{register ? "Make a little room for your next big idea. Your DevPilot account is the first step." : "Your next step doesn’t have to be a big one. A little focus goes a long way."}</p>
      <div className={styles.storyArt} aria-hidden="true"><span>⌘</span><span>↗</span><span>✓</span></div>
      <p className={styles.storyNote}>A little more focus. A little less friction.</p>
    </section>
    <section className={styles.card} aria-labelledby="form-heading">
      <h2 id="form-heading">{register ? "Create your account" : "Welcome back"}</h2>
      <p className={styles.subtitle}>{register ? "A few details, and you’re on your way." : "Log in to your DevPilot account."}</p>
      {created && <div className={`${styles.message} ${styles.success}`} role="status">Account created. Log in to make yourself at home.</div>}
      {error && <div ref={errorRef} tabIndex={-1} role="alert" className={styles.message}>{error}</div>}
      <form onSubmit={submit} className={styles.form} noValidate aria-busy={pending}>
        {register && <FormField id="display_name" name="display_name" label="Display name" placeholder="What should we call you?" autoComplete="nickname" maxLength={100} required error={fields.display_name} disabled={pending} />}
        <FormField id="email" name="email" label="Email address" type="email" placeholder="you@example.com" autoComplete="email" maxLength={254} required error={fields.email} disabled={pending} />
        <FormField id="password" name="password" label="Password" type={showPassword ? "text" : "password"} placeholder={register ? "Create a strong password" : "Enter your password"} autoComplete={register ? "new-password" : "current-password"} minLength={register ? 12 : 1} maxLength={128} required hint={register ? "12–128 characters. A memorable passphrase works well." : undefined} error={fields.password} disabled={pending} />
        <label className={styles.passwordTools}><input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} disabled={pending} />Show password</label>
        <Button full type="submit" disabled={pending}>{pending ? (register ? "Creating your account…" : "Logging in…") : (register ? "Create account" : "Log in")} {!pending && <span aria-hidden="true">↗</span>}</Button>
        {pending && <p role="status" className={styles.loading}>Just a moment. We’re getting things ready.</p>}
      </form>
      <p className={styles.switch}>{register ? "Already have an account? " : "New to DevPilot? "}<Link href={register ? "/login" : "/register"}>{register ? "Log in" : "Create an account"}</Link></p>
      <p className={styles.footnote}>{register ? "Start small. Build something that matters." : "Your space. Your pace."}</p>
    </section>
  </div></SiteShell>;
}
