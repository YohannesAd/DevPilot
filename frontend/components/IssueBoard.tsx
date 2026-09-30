"use client";

import { useEffect, useRef, useState } from "react";
import { ISSUE_STATUSES } from "@/lib/issues";
import { useIssueBoard, type IssueStatus } from "@/lib/useIssueBoard";
import BoardColumn from "./BoardColumn";
import { Button } from "./Button";
import styles from "./IssueBoard.module.css";

export default function IssueBoard({ projectId, archived }: { projectId: string; archived: boolean }) {
  const board = useIssueBoard(projectId, archived);
  const [column, setColumn] = useState<IssueStatus>("todo");
  const [dragging, setDragging] = useState<string | null>(null);
  const focusMove = useRef(false);
  useEffect(() => {
    if (board.moved) { focusMove.current = true; setColumn(board.moved.status); }
  }, [board.moved]);
  useEffect(() => {
    if (focusMove.current && board.moved && column === board.moved.status) {
      document.getElementById(`board-issue-${board.moved.id}`)?.focus(); focusMove.current = false;
    }
  }, [board.moved, column]);

  function drop(status: IssueStatus, id: string) {
    const issue = board.items.find(row => row.id === id);
    if (issue) void board.move(issue, status);
    setDragging(null);
  }

  return <section aria-labelledby="board-heading" className={styles.board}>
    <div className={styles.toolbar}><h2 id="board-heading">Issue board</h2>
      <Button variant="secondary" disabled={!!board.pending} onClick={() => void board.load(true)}>Refresh board</Button>
    </div>
    <p className={styles.help}>{archived ? "This project is archived. Its board is read-only. Restore the project to move issues."
      : "Choose Move to and confirm, or drag a card to another column on desktop. Changes appear after saving."}</p>
    <p role="status" aria-live="polite">{board.pending === "load" ? "Loading issues…" : board.pending ? "Saving status…" : board.message}</p>
    {board.error && <div role="alert" className={styles.error}><p>{board.error}</p>
      {board.retryMove ? <Button variant="secondary" disabled={board.disabled} onClick={() => {
        if (board.retryMove) void board.move(board.retryMove.issue, board.retryMove.status);
      }}>Retry move</Button> : <Button variant="secondary" disabled={!!board.pending} onClick={() => void board.load(!board.loaded)}>Try loading again</Button>}
    </div>}
    {board.loaded && <>
      <p className={styles.help}>{board.items.length} issues loaded. {board.hasMore ? "More issues are available; load older issues below. Column counts cover loaded cards only." : "All issues loaded."}</p>
      <div className={styles.mobileNav}><label htmlFor="board-column">Show column</label>
        <select id="board-column" value={column} onChange={event => setColumn(event.target.value as IssueStatus)}>
          {Object.entries(ISSUE_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className={styles.columns}>
        {(Object.keys(ISSUE_STATUSES) as IssueStatus[]).map(status => <BoardColumn key={status} status={status}
          issues={board.items.filter(issue => issue.status === status)} selected={column === status}
          hasMore={board.hasMore} disabled={board.disabled} pending={board.pending} dragging={dragging}
          onDrag={setDragging} onDrop={drop} onMove={(issue, target) => { void board.move(issue, target); }} />)}
      </div>
      {board.hasMore && <Button variant="secondary" disabled={!!board.pending} onClick={() => void board.load()}>Load older issues</Button>}
    </>}
  </section>;
}
