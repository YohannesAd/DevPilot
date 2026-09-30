import { forwardApi } from "@/lib/server/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = forwardApi;
export const HEAD = forwardApi;
export const POST = forwardApi;
export const PUT = forwardApi;
export const PATCH = forwardApi;
export const DELETE = forwardApi;
export const OPTIONS = forwardApi;
