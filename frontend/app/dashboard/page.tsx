"use client";

import Workspace, { useWorkspaceUser } from "@/components/Workspace";
import ProjectList from "@/components/ProjectList";
import { ButtonLink } from "@/components/Button";
import styles from "@/components/Workspace.module.css";

function Dashboard() {
  const user = useWorkspaceUser();
  return <div className={styles.page}>
    <header className={styles.heading}><div><p className="eyebrow">Your workspace</p>
      <h1>A little focus, {user.display_name.split(" ")[0]}.</h1><p>Pick up a project. Make room for your next idea.</p></div>
      <ButtonLink href="/projects?create=1#new-project">Create project <span aria-hidden="true">↗</span></ButtonLink></header>
    <section aria-labelledby="projects-title"><div className={styles.sectionHeading}><h2 id="projects-title">Your latest projects</h2><span>Newest first</span></div>
      <ProjectList recent /></section>
  </div>;
}

export default function DashboardPage() { return <Workspace page="dashboard"><Dashboard /></Workspace>; }
