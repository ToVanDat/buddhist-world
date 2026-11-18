/** PostgreSQL codes that mean the additive world-content schema is not installed. */
export function isWorldContentSchemaNotReady(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "42P01" || code === "42703" || code === "3F000";
}
