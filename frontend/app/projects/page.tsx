"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Workspace from "@/components/Workspace";
import ProjectList from "@/components/ProjectList";
import ProjectForm from "@/components/ProjectForm";
import { Button } from "@/components/Button";
import styles from "@/components/Workspace.module.css";

function Projects() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [creating, setCreating] = useState(params.get("create") === "1");
  useEffect(() => { setCreating(params.get("create") === "1"); }, [params]);
  function closeForm() { setCreating(false); router.replace(pathname, { scroll: false }); }
  return <div className={styles.page}>
    <header className={styles.heading}><div><p className="eyebrow">A place for your ideas</p><h1>Your projects.</h1>
      <p>The work you’ve started, ready when you are.</p></div>
      {!creating && <Button onClick={() => { setCreating(true); router.replace("/projects?create=1#new-project", { scroll: false }); }}>Create project <span aria-hidden="true">↗</span></Button>}</header>
    {creating && <ProjectForm onCancel={closeForm} />}
    <section aria-label="Your saved projects"><ProjectList /></section>
  </div>;
}

export default function ProjectsPage() {
  return <Workspace page="projects"><Suspense fallback={<p role="status">Opening projects…</p>}><Projects /></Suspense></Workspace>;
}
