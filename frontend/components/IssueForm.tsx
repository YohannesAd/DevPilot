"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { loginDestination } from "@/lib/navigation";
import { createIssue, updateIssue, ISSUE_TYPES, ISSUE_STATUSES, ISSUE_PRIORITIES, type Issue, type IssueFields } from "@/lib/issues";
import { Button } from "./Button";
import FormField from "./FormField";
import workspace from "./Workspace.module.css";
import styles from "./Issues.module.css";

export default function IssueForm({ projectId, issue, onSaved, onCancel }: {
  projectId: string; issue?: Issue; onSaved: (issue: Issue) => void; onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const submitting = useRef(false);
  const active = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const type = String(data.get("type") ?? "");
    const status = String(data.get("status") ?? "");
    const priority = String(data.get("priority") ?? "");
    const invalid: Record<string, string> = {};
    if (!title || [...title].length > 200) invalid.title = "Enter a title between 1 and 200 characters.";
    if ([...description].length > 10000) invalid.description = "Keep the description within 10,000 characters.";
    if (!Object.keys(ISSUE_TYPES).includes(type)) invalid.type = "Choose a listed issue type.";
    if (!Object.keys(ISSUE_STATUSES).includes(status)) invalid.status = "Choose a listed status.";
    if (!Object.keys(ISSUE_PRIORITIES).includes(priority)) invalid.priority = "Choose a listed priority.";
    setFields(invalid); setError("");
    if (Object.keys(invalid).length) {
      (form.elements.namedItem(Object.keys(invalid)[0]) as HTMLElement)?.focus(); return;
    }
    const values: IssueFields = { title, description: description || null,
      type: type as IssueFields["type"], status: status as IssueFields["status"], priority: priority as IssueFields["priority"] };
    submitting.current = true; setPending(true);
    try {
      let saved: Issue;
      if (issue) {
        const changes: Partial<IssueFields> = {};
        for (const field of Object.keys(values) as (keyof IssueFields)[]) {
          if (values[field] !== issue[field]) Object.assign(changes, { [field]: values[field] });
        }
        if (!Object.keys(changes).length) { onCancel(); return; }
        saved = await updateIssue(projectId, issue.id, changes);
      } else saved = await createIssue(projectId, values);
      if (active.current) onSaved(saved);
    } catch (err) {
      if (!active.current) return;
      if (err instanceof ApiError && err.status === 401) { router.replace(loginDestination()); return; }
      setError(err instanceof ApiError && err.code === "project_archived"
        ? "This project is archived. Your input is still here to copy. Open the project and restore it before saving issues."
        : err instanceof ApiError && err.status === 404 ? "This issue or project is no longer available to this account. Your input is still here to copy."
        : err instanceof ApiError && err.status === 422 ? "Check the title, description, type, status and priority, then try again."
        : err instanceof ApiError && err.code === "csrf_failed" ? "This request couldn’t be verified. Copy your input before refreshing and trying again."
        : issue ? "We couldn’t confirm that your changes were saved. Your edits are still here. Try again or reload to check the saved issue."
        : "We couldn’t confirm that your issue was saved. Your input is still here. Check the project’s issues before retrying to avoid a duplicate.");
      submitting.current = false;
      setPending(false);
    }
  }

  return <section className={workspace.formPanel} aria-labelledby="issue-form-heading">
    <p className="eyebrow">One step at a time</p><h2 id="issue-form-heading">{issue ? "Edit issue" : "Create an issue"}</h2>
    <p>Capture the work, choose its priority, and keep its status up to date.</p>
    <form noValidate onSubmit={submit} aria-busy={pending} className={workspace.form}>
      <FormField autoFocus id="issue-title" name="title" label="Title" defaultValue={issue?.title}
        required hint="1–200 characters" error={fields.title} disabled={pending} />
      <div className={workspace.field}><label htmlFor="issue-description">Description <span>(optional)</span></label>
        <textarea id="issue-description" name="description" rows={6} defaultValue={issue?.description ?? ""}
          disabled={pending} aria-invalid={!!fields.description} aria-describedby="issue-description-help" />
        <p id="issue-description-help" className={fields.description ? workspace.error : workspace.hint}>
          {fields.description || "Plain text, up to 10,000 characters."}</p>
      </div>
      <div className={styles.controls}>
        {([{ name: "type", label: "Type", values: ISSUE_TYPES, initial: issue?.type ?? "task" },
          { name: "status", label: "Status", values: ISSUE_STATUSES, initial: issue?.status ?? "todo" },
          { name: "priority", label: "Priority", values: ISSUE_PRIORITIES, initial: issue?.priority ?? "medium" }]
        ).map(control => <div key={control.name} className={workspace.field}>
          <label htmlFor={`issue-${control.name}`}>{control.label}</label>
          <select id={`issue-${control.name}`} name={control.name} defaultValue={control.initial} required
            disabled={pending} aria-invalid={!!fields[control.name]} aria-describedby={fields[control.name] ? `issue-${control.name}-error` : undefined}>
            {Object.entries(control.values).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {fields[control.name] && <p id={`issue-${control.name}-error`} className={workspace.error}>{fields[control.name]}</p>}
        </div>)}
      </div>
      {error && <p ref={errorRef} tabIndex={-1} className={workspace.error} role="alert">{error}</p>}
      <div className={workspace.actions}><Button type="submit" disabled={pending}>{pending ? "Saving…" : issue ? "Save changes" : "Create issue"}</Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>Cancel</Button></div>
      {pending && <p role="status">Saving your issue…</p>}
    </form>
  </section>;
}
