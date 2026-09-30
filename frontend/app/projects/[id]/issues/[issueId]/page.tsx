"use client";

import { useParams } from "next/navigation";
import Workspace from "@/components/Workspace";
import IssueDetail from "@/components/IssueDetail";

export default function IssuePage() {
  const { id, issueId } = useParams<{ id: string; issueId: string }>();
  return <Workspace page="project"><IssueDetail key={`${id}/${issueId}`} projectId={id} issueId={issueId} /></Workspace>;
}
