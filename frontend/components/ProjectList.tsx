"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { PROJECT_PAGE_SIZE, projectDate, type ProjectPage } from "@/lib/projects";
import { Button, ButtonLink } from "./Button";
import { WorkspaceState } from "./Workspace";
import styles from "./Workspace.module.css";

export default function ProjectList({ recent = false }: { recent?: boolean }) {
  const [offset, setOffset] = useState(0);
  const limit = recent ? 4 : PROJECT_PAGE_SIZE;
  const { data, error, retry } = useApi<ProjectPage>(`/api/projects?limit=${limit}&offset=${offset}`);
  if (error) return <WorkspaceState title="Projects couldn’t load." error retry={retry}>
    <p>Your saved projects are still yours. Try loading them again.</p></WorkspaceState>;
  if (!data) return <p className={styles.loading} role="status">Loading your projects…</p>;
  if (!data.items.length && offset === 0) return <section className={styles.empty}>
    <span className={styles.mark} aria-hidden="true">↗</span><p className="eyebrow">Room for your next idea</p>
    <h2>Your first project starts here.</h2><p>Give it a name and a little context. You can come back to it whenever you’re ready.</p>
    <ButtonLink href="/projects?create=1#new-project">Create project</ButtonLink>
  </section>;
  return <>
    <ul className={styles.projectGrid}>{data.items.map(project => <li key={project.id}>
      <Link href={`/projects/${project.id}`} className={styles.projectCard}>
        <div className={styles.cardTop}><span className={styles.projectIcon} aria-hidden="true">⌘</span><span aria-hidden="true">↗</span></div>
        <h2>{project.name}</h2><p className={styles.preview}>{project.description || "No description added."}</p>
        <p className={styles.date}>Created <time dateTime={project.created_at}>{projectDate(project.created_at)}</time></p>
      </Link>
    </li>)}</ul>
    {recent ? <div className={styles.listFooter}><ButtonLink href="/projects" variant="secondary">View all projects</ButtonLink></div>
      : <nav className={styles.pagination} aria-label="Project pages">
        <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - limit))}>Previous</Button>
        <span aria-live="polite">Page {Math.floor(offset / limit) + 1}</span>
        <Button variant="secondary" disabled={!data.has_more} onClick={() => setOffset(value => value + limit)}>Next</Button>
      </nav>}
  </>;
}
