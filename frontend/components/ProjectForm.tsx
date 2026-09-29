"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { createProject, updateProject, type Project } from "@/lib/projects";
import { loginDestination } from "@/lib/navigation";
import FormField from "./FormField";
import { Button } from "./Button";
import styles from "./Workspace.module.css";

type Props = { onCancel: () => void } & (
  { project?: never; onSaved?: never } | { project: Project; onSaved: (project: Project) => void }
);

export default function ProjectForm({ onCancel, project, onSaved }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const submitting = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const invalid: Record<string, string> = {};
    if (!name || [...name].length > 100) invalid.name = "Enter a project name between 1 and 100 characters.";
    if ([...description].length > 2000) invalid.description = "Keep the description within 2,000 characters.";
    setFields(invalid); setError("");
    if (Object.keys(invalid).length) {
      (form.elements.namedItem(Object.keys(invalid)[0]) as HTMLElement)?.focus(); return;
    }
    submitting.current = true; setPending(true);
    try {
      if (project) {
        const changes: { name?: string; description?: string | null } = {};
        if (name !== project.name) changes.name = name;
        if ((description || null) !== project.description) changes.description = description || null;
        if (!Object.keys(changes).length) { onCancel(); return; }
        onSaved(await updateProject(project.id, changes));
      } else {
        const created = await createProject(name, description);
        router.push(`/projects/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { router.replace(loginDestination()); return; }
      setError(err instanceof ApiError && err.status === 422 ? "Check the name and description limits, then try again."
        : err instanceof ApiError && err.status === 404 ? "This project is no longer available to this account. Return to your projects."
        : err instanceof ApiError && err.code === "project_archived" ? "This project was archived. Cancel editing and reload its details to restore it first. Your edits are still here to copy."
        : err instanceof ApiError && err.code === "csrf_failed" ? "This request couldn’t be verified. Refresh the page and try again."
        : project ? "We couldn’t confirm that your changes were saved. Your edits are still here. Try saving again or check the project in another tab."
        : "We couldn’t confirm that your project was saved. Check your projects before trying again.");
      submitting.current = false; setPending(false);
    }
  }

  return <section id={project ? "edit-project" : "new-project"} className={styles.formPanel} aria-labelledby="project-form-title">
    <p className="eyebrow">{project ? "A little refinement" : "Make a little room"}</p>
    <h2 id="project-form-title">{project ? "Edit project" : "Create a project"}</h2>
    <p>{project ? "Update the name or description. Save when you’re ready." : "Start with a name. Add a description to remember what you’re building."}</p>
    <form onSubmit={submit} noValidate aria-busy={pending} className={styles.form}>
      <FormField autoFocus id="project-name" name="name" label="Project name" placeholder="What are you building?" required
        defaultValue={project?.name} maxLength={100} hint="1–100 characters" error={fields.name} disabled={pending} />
      <div className={styles.field}><label htmlFor="project-description">Description <span>(optional)</span></label>
        <textarea id="project-description" name="description" rows={4} maxLength={2000} disabled={pending} defaultValue={project?.description ?? ""}
          placeholder="The idea, the purpose, or the next step."
          aria-invalid={!!fields.description} aria-describedby="project-description-help" />
        <p id="project-description-help" className={fields.description ? styles.error : styles.hint}>{fields.description || "Up to 2,000 characters."}</p>
      </div>
      {error && <p ref={errorRef} tabIndex={-1} className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><Button type="submit" disabled={pending}>{pending ? "Saving…" : project ? "Save changes" : "Create project"}</Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>Cancel</Button></div>
      {pending && <p role="status">Saving your project…</p>}
    </form>
  </section>;
}
