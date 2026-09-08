function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function logError(context: string, error: unknown) {
  console.error(`[RecycleBuddy] ${context}: ${errorMessage(error)}`);
}

export function logWarning(context: string, details?: string) {
  console.warn(`[RecycleBuddy] ${context}${details ? `: ${details}` : ''}`);
}
