/** Only same-site paths are followed after sign-in (no "//evil.com" or absolute URLs). */
export function safeRedirect(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}
