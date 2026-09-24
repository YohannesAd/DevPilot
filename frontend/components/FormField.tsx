import type { InputHTMLAttributes } from "react";
import styles from "./FormField.module.css";

type Props = InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string; error?: string };
export default function FormField({ id, label, hint, error, ...props }: Props) {
  return <div className={styles.field}>
    <label htmlFor={id} className={styles.label}>{label}</label>
    <input {...props} id={id} className={styles.input} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} />
    {error ? <p id={`${id}-error`} className={styles.error}>{error}</p> : hint ? <p id={`${id}-hint`} className={styles.hint}>{hint}</p> : null}
  </div>;
}
