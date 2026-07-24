// Pure validation for POST /api/msi/accounts/[id]/review. Extracted from the
// route so the action + change parsing is unit-tested. No db/Env.

export type ReviewChange = { field: string; note: string };

export type ParsedReviewRequest =
  | { action: 'approve' }
  | { action: 'request_changes'; changes: ReviewChange[] };

export type ReviewParseResult =
  | { ok: true; value: ParsedReviewRequest }
  | { ok: false; error: string };

/** Normalize requested changes into a clean [{ field, note }] shape. */
export function parseChanges(raw: unknown): ReviewChange[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (c): c is Record<string, unknown> => c !== null && typeof c === 'object',
    )
    .map(c => ({
      field:
        typeof c.field === 'string' && c.field.trim() ? c.field.trim() : 'general',
      note: typeof c.note === 'string' ? c.note : '',
    }));
}

export function parseReviewRequest(input: unknown): ReviewParseResult {
  const action
    = input && typeof input === 'object'
      ? (input as Record<string, unknown>).action
      : undefined;

  if (action !== 'approve' && action !== 'request_changes') {
    return {
      ok: false,
      error: 'action must be "approve" or "request_changes"',
    };
  }

  if (action === 'approve') {
    return { ok: true, value: { action: 'approve' } };
  }

  return {
    ok: true,
    value: {
      action: 'request_changes',
      changes: parseChanges((input as Record<string, unknown>).changes),
    },
  };
}
