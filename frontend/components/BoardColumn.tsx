"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "./Button";
import { ISSUE_STATUSES, ISSUE_TYPES, ISSUE_PRIORITIES, issueHref, type Issue } from "@/lib/issues";
import type { IssueStatus } from "@/lib/useIssueBoard";
import styles from "./IssueBoard.module.css";

function BoardCard({ issue, disabled, pending, onMove, onDrag }: {
  issue: Issue; disabled: boolean; pending: boolean;
  onMove: (issue: Issue, status: IssueStatus) => void; onDrag: (id: string | null) => void;
}) {
  const [target, setTarget] = useState<IssueStatus>(issue.status);
  return <li className={styles.card} draggable={!disabled}
    onDragStart={event => {
      if (disabled) { event.preventDefault(); return; }
      event.dataTransfer.setData("text/plain", issue.id); event.dataTransfer.effectAllowed = "move"; onDrag(issue.id);
    }} onDragEnd={() => onDrag(null)}>
    <h4><Link id={`board-issue-${issue.id}`} href={issueHref(issue.project_id, issue.id)} draggable={false}>{issue.title}</Link></h4>
    <p>Type: {ISSUE_TYPES[issue.type]}</p><p>Priority: {ISSUE_PRIORITIES[issue.priority]}</p>
    <p>Status: {ISSUE_STATUSES[issue.status]}</p>
    <form onSubmit={event => { event.preventDefault(); onMove(issue, target); }} className={styles.move}>
      <label htmlFor={`move-${issue.id}`}>Move to <span className={styles.srOnly}>{issue.title}</span></label>
      <select id={`move-${issue.id}`} value={target} disabled={disabled} onChange={event => setTarget(event.target.value as IssueStatus)}>
        {Object.entries(ISSUE_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <Button variant="secondary" disabled={disabled || target === issue.status} aria-label={`Move ${issue.title}`}>
        {pending ? "Saving…" : "Move"}
      </Button>
    </form>
  </li>;
}

export default function BoardColumn({ status, issues, selected, hasMore, disabled, pending, dragging, onDrag, onDrop, onMove }: {
  status: IssueStatus; issues: Issue[]; selected: boolean; hasMore: boolean; disabled: boolean;
  pending: string | null; dragging: string | null; onDrag: (id: string | null) => void;
  onDrop: (status: IssueStatus, id: string) => void;
  onMove: (issue: Issue, status: IssueStatus) => void;
}) {
  const [over, setOver] = useState(false);
  return <section className={styles.column} data-selected={selected} data-over={over && !!dragging && !disabled}
    aria-labelledby={`column-${status}`}
    onDragOver={event => { if (!disabled && dragging) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(true); } }}
    onDragLeave={() => setOver(false)}
    onDrop={event => {
      event.preventDefault(); setOver(false);
      // Only accept a card originating from this board, never arbitrary external text.
      if (!disabled && dragging && event.dataTransfer.getData("text/plain") === dragging) onDrop(status, dragging);
    }}>
    <header><h3 id={`column-${status}`}>{ISSUE_STATUSES[status]}</h3><span>{issues.length} loaded</span></header>
    {!issues.length && <p className={styles.empty}>{hasMore ? "No loaded issues in this column. Load older issues to see more." : "No issues in this column yet."}</p>}
    <ul>{issues.map(issue => <BoardCard key={`${issue.id}:${issue.status}`} issue={issue} disabled={disabled}
      pending={pending === issue.id} onMove={onMove} onDrag={onDrag} />)}</ul>
  </section>;
}
