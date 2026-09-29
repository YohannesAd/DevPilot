"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Workspace from "@/components/Workspace";
import ProjectList from "@/components/ProjectList";
import ProjectForm from "@/components/ProjectForm";
import { Button } from "@/components/Button";
import styles from "@/components/Workspace.module.css";

function Projects() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = params.get("status") === "archived" ? "archived" : "active";
  const [creating, setCreating] = useState(status === "active" && params.get("create") === "1");
  useEffect(() => { setCreating(status === "active" && params.get("create") === "1"); }, [params, status]);
  function closeForm() { setCreating(false); router.replace(pathname, { scroll: false }); }
  return <div className={styles.page}>
    <header className={styles.heading}><div><p className="eyebrow">A place for your ideas</p><h1>Your projects.</h1>
      <p>The work you’ve started, ready when you are.</p></div>
      {status === "active" && !creating && <Button onClick={() => { setCreating(true); router.replace("/projects?create=1#new-project", { scroll: false }); }}>Create project <span aria-hidden="true">↗</span></Button>}</header>
    <nav className={styles.projectViews} aria-label="Project views">
      <Link href="/projects" aria-current={status === "active" ? "page" : undefined}>Active</Link>
      <Link href="/projects?status=archived" aria-current={status === "archived" ? "page" : undefined}>Archived</Link>
    </nav>
    {status === "active" && creating && <ProjectForm onCancel={closeForm} />}
    <section aria-label={`${status === "active" ? "Active" : "Archived"} projects`}><ProjectList key={status} status={status} /></section>
  </div>;
}

export default function ProjectsPage() {
  return <Workspace page="projects"><Suspense fallback={<p role="status">Opening projects…</p>}><Projects /></Suspense></Workspace>;
}
