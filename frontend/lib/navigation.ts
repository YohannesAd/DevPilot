// Only internal workspace destinations may be restored after authentication.
export function workspaceDestination(value: string | null): string {
  return value && /^\/(?:dashboard|account|projects(?:\/[0-9a-f-]+(?:\/issues\/[0-9a-f-]+)?)?)(?:\?[^#]*)?$/i.test(value)
    ? value : "/dashboard";
}

export function loginDestination(): string {
  const destination = workspaceDestination(window.location.pathname + window.location.search);
  return `/login?next=${encodeURIComponent(destination)}`;
}
