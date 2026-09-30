import { isIP } from "node:net";
import { proxyConfig } from "./proxy-config";

const MAX_BODY = 128 * 1024;
function failure(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: {
    "Cache-Control": "no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store",
  } });
}

export async function forwardApi(request: Request): Promise<Response> {
  const config = proxyConfig(); // Invalid configuration fails clearly; never echo values.
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return failure(404, "not_found", "Route not found.");
  const headers = new Headers();
  for (const name of ["cookie", "origin", "content-type", "accept"]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (config.mode === "vercel") {
    // Only supported behind Vercel's own edge, which overwrites this header.
    // Do not accept chains, alternate headers, or caller-provided proxy credentials.
    const ip = request.headers.get("x-forwarded-for")?.trim() ?? "";
    if (process.env.VERCEL !== "1" || !isIP(ip) || ip.includes("%"))
      return failure(503, "proxy_unavailable", "The service connection is unavailable. Please try again later.");
    headers.set("x-devpilot-proxy-secret", config.secret);
    headers.set("x-devpilot-client-ip", ip);
  }
  let body: Uint8Array | undefined;
  if (request.body && !["GET", "HEAD"].includes(request.method)) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > MAX_BODY) { await reader.cancel(); return failure(413, "request_too_large", "Request is too large."); }
        chunks.push(chunk.value);
      }
    } catch { return failure(400, "request_failed", "Request could not be read."); }
    body = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  }
  try {
    const upstream = await fetch(`${config.destination}${url.pathname}${url.search}`, {
      method: request.method, headers, body: body as BodyInit | undefined,
      redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    // Never follow a redirect with session/proxy credentials or expose a backend URL.
    if (upstream.status >= 300 && upstream.status < 400)
      return failure(502, "proxy_unavailable", "Unexpected service response. Please try again later.");
    const responseHeaders = new Headers({ "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" });
    for (const name of ["content-type", "retry-after", "allow"]) {
      const value = upstream.headers.get(name); if (value !== null) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("Set-Cookie", cookie);
    const data = request.method === "HEAD" || [204, 205, 304].includes(upstream.status) ? null : await upstream.arrayBuffer();
    return new Response(data, { status: upstream.status, headers: responseHeaders });
  } catch {
    // Mutations may have completed before a timeout: never retry automatically.
    return failure(503, "proxy_unavailable", "The service may be waking up. Wait a minute. Check whether your change saved before trying again.");
  }
}
