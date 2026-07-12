export class SafeActionError extends Error {}

export function publicActionError(error: unknown, fallback: string): string {
  if (error instanceof SafeActionError) return error.message;
  console.error("Server action failed", error);
  return fallback;
}
