// Server configuration only. Never import this module from a client component.
export function proxyConfig(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.API_PROXY_MODE ?? (env.NODE_ENV === "production" ? "" : "local");
  if (!["local", "vercel"].includes(mode)) throw new Error("Set API_PROXY_MODE to local or vercel.");
  if (env.VERCEL === "1" && mode !== "vercel") throw new Error("Vercel requires API_PROXY_MODE=vercel.");
  let destination: URL;
  try { destination = new URL(env.API_BACKEND_ORIGIN ?? (mode === "local" ? "http://localhost:8000" : "")); }
  catch { throw new Error("API_BACKEND_ORIGIN must be an explicit backend origin."); }
  if (destination.username || destination.password || destination.pathname !== "/" || destination.search || destination.hash)
    throw new Error("API_BACKEND_ORIGIN must contain only an origin, without credentials or a path.");
  if (mode === "local" && (!['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname) || destination.protocol !== "http:"))
    throw new Error("Local proxy mode requires an HTTP loopback backend.");
  if (mode === "vercel" && destination.protocol !== "https:") throw new Error("Vercel backend origin must use HTTPS.");
  const secret = env.API_PROXY_SECRET ?? "";
  if (mode === "vercel" && !/^[a-fA-F0-9]{64}$/.test(secret))
    throw new Error("API_PROXY_SECRET must be a 32-byte random secret encoded as 64 hex characters.");
  return { mode, destination: destination.origin, secret };
}
