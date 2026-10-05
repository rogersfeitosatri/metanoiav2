export function loginDestination(search: string): string {
  const next = new URLSearchParams(search).get("next");
  return next && /^\/app\/hoje\?invitation=[a-f0-9-]{36}$/.test(next)
    ? next
    : "/app/hoje";
}
