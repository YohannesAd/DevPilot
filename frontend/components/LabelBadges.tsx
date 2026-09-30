import type { Label } from "@/lib/organization";
import styles from "./Organization.module.css";

export default function LabelBadges({ labels = [] }: { labels?: Label[] }) {
  return labels.length ? <span className={styles.badges} aria-label="Labels">{labels.map(label =>
    <span key={label.id} className={styles.badge} data-color={label.color}>{label.name}</span>)}</span> : null;
}
