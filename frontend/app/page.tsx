async function apiStatus(): Promise<string> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/health`, { cache: "no-store" });
    if (!response.ok) return "API unavailable";
    const data: { status: string } = await response.json();
    return data.status === "ok" ? "API connected" : "Unexpected API response";
  } catch {
    return "API unavailable — start the backend on port 8000";
  }
}

export default async function Home() {
  const status = await apiStatus();
  return <main><p className="eyebrow">DEV PILOT</p><h1>Your development work, in one place.</h1><p>Organize projects, issues, and your next steps.</p><section><h2>Local connection</h2><p>{status}</p><small>First coding milestone: frontend → backend health check.</small></section></main>;
}
