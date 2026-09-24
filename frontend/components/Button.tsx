import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: "primary" | "secondary"; full?: boolean };
export function Button({ children, variant = "primary", full, className = "", ...props }: Props) {
  return <button className={`${styles.button} ${variant === "secondary" ? styles.secondary : ""} ${full ? styles.full : ""} ${className}`} {...props}>{children}</button>;
}
export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  return <Link href={href} className={`${styles.button} ${variant === "secondary" ? styles.secondary : ""}`}>{children}</Link>;
}
