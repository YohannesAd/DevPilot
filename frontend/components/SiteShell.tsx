import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./SiteShell.module.css";

export default function SiteShell({ children, page }: { children: ReactNode; page: "home" | "login" | "register" | "account" }) {
  return <div className={styles.shell}>
    <a href="#main" className="skip-link">Skip to content</a>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="DevPilot home">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M4 5h10c6 0 10 4 10 9s-4 9-10 9H4V5Z" stroke="currentColor" strokeWidth="2"/><path d="m10 10 5 4-5 4M17 18h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        DevPilot
      </Link>
      <nav className={styles.nav} aria-label="Main navigation">
        <Link href="/" className={styles.homeLink} aria-current={page === "home" ? "page" : undefined}>Home</Link>
        {page === "account" ? <Link href="/account" aria-current="page">My account</Link> : <>
          <Link href="/login" aria-current={page === "login" ? "page" : undefined}>Log in</Link>
          <Link href="/register" className={styles.navAction} aria-current={page === "register" ? "page" : undefined}>Sign up <span aria-hidden="true">↗</span></Link>
        </>}
      </nav>
    </header>
    <main id="main" tabIndex={-1} className={styles.content}>{children}</main>
    <footer className={styles.footer}><span>DevPilot · A little more focus. A little less friction.</span><span>Built for the work ahead</span></footer>
  </div>;
}
