"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import Workspace, { WorkspaceState } from "@/components/Workspace";
import { ButtonLink } from "@/components/Button";
import { useApi } from "@/lib/useApi";
import { projectDate, type Project } from "@/lib/projects";
import styles from "@/components/Workspace.module.css";

function ProjectDetail({ id }: { id: string }) {
  const { data: project, error, retry } = useApi<Project>(`/api/projects/${encodeURIComponent(id)}`);
  if (error) {
    const missing = error.status === 404 || error.status === 422;
    return <WorkspaceState title={missing ? "Project not found." : "This project couldn’t load."}
      error retry={missing ? undefined : retry}>
      <p>{missing ? "It may not exist, or it may belong to another account." : "Check your connection and try again."}</p>
      <ButtonLink href="/projects" variant="secondary">Back to projects</ButtonLink>
    </WorkspaceState>;
  }
  if (!project) return <WorkspaceState title="Opening your project…"><p>Loading the details you saved.</p></WorkspaceState>;
  return <div className={styles.page}>
    <Link href="/projects" className={styles.back}>← All projects</Link>
    <header className={styles.heading}><div><p className="eyebrow">Project overview</p><h1>{project.name}</h1>
      <p>One idea. A little room to build.</p></div></header>
    <section className={styles.detail} aria-labelledby="about-title"><h2 id="about-title">About this project</h2>
      <p className={styles.description}>{project.description || "No description added."}</p>
      <dl className={styles.metadata}><div><dt>Created</dt><dd><time dateTime={project.created_at}>{projectDate(project.created_at)}</time></dd></div>
        <div><dt>Last updated</dt><dd><time dateTime={project.updated_at}>{projectDate(project.updated_at)}</time></dd></div>
        <div><dt>Visibility</dt><dd>Only you</dd></div></dl>
    </section>
  </div>;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  return <Workspace page="project"><ProjectDetail key={id} id={id} /></Workspace>;
}
