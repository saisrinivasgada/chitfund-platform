export function legalDocumentUrl(
  document: { version?: string; documentUrl?: string } | undefined,
  kind: 'terms' | 'privacy',
  options: { baseUrl: string; allowedOrigins: string[]; relativeSameOrigin?: boolean },
): string | null;
