"use client";

import { useParams } from "next/navigation";
import Workspace, { WorkspaceState } from "@/components/Workspace";
import { ButtonLink } from "@/components/Button";
import { useApi } from "@/lib/useApi";
import type { Project } from "@/lib/projects";
import ProjectDetail from "@/components/ProjectDetail";

function ProjectContent({ id }: { id: string }) {
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
  return <ProjectDetail key={project.id} initialProject={project} />;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  return <Workspace page="project"><ProjectContent key={id} id={id} /></Workspace>;
}
