"use client";
import { useId, useState } from "react";
import { api } from "@/lib/api";
import { LABEL_COLORS, labelsPath, type Label } from "@/lib/organization";
import { useOrganizationAction } from "@/lib/useOrganizationAction";
import { Button } from "./Button";
import styles from "./Organization.module.css";

export default function LabelForm({ projectId, label, onSaved, onCancel }: {
  projectId: string; label?: Label; onSaved: (label: Label) => void; onCancel?: () => void;
}) {
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState(label?.color ?? "blue");
  const action = useOrganizationAction();
  const id = useId();
  return <form className={styles.form} noValidate aria-busy={action.pending} onSubmit={event => {
    event.preventDefault();
    if (!name.trim() || [...name.trim()].length > 30 || !Object.keys(LABEL_COLORS).includes(color)) {
      action.setError("Enter a label name between 1 and 30 characters and choose a listed color."); return;
    }
    void action.run(() => api<Label>(`${labelsPath(projectId)}${label ? `/${label.id}` : ""}`, {
      method: label ? "PATCH" : "POST", body: JSON.stringify({ name: name.trim(), color }),
    }), saved => { onSaved(saved); if (!label) setName(""); });
  }}>
    <label htmlFor={`${id}-name`}>{label ? "Rename label" : "New label name"}</label>
    <input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} disabled={action.pending} required autoFocus={!!label} aria-describedby={`${id}-help`} />
    <p id={`${id}-help`} className={styles.hint}>1–30 characters. Names must be unique in this project, ignoring case.</p>
    <label htmlFor={`${id}-color`}>Label color</label>
    <select id={`${id}-color`} value={color} onChange={event => setColor(event.target.value as Label["color"])} disabled={action.pending}>
      {Object.entries(LABEL_COLORS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
    {action.error && <p role="alert" className={styles.error}>{action.error}</p>}
    <div className={styles.actions}><Button disabled={action.pending}>{action.pending ? "Saving…" : label ? "Save label" : "Create label"}</Button>
      {onCancel && <Button type="button" variant="secondary" disabled={action.pending} onClick={onCancel}>Cancel</Button>}</div>
  </form>;
}
