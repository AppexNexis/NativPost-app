/**
 * Shared Apify actor helpers for NativPost template providers.
 */

export const APIFY_BASE = 'https://api.apify.com/v2';

export async function startApifyRun(
  actorId: string,
  token: string,
  input: unknown,
): Promise<{ id: string; defaultDatasetId: string }> {
  const res = await fetch(`${APIFY_BASE}/acts/${actorId}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify actor start failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data: { id: string; defaultDatasetId: string } };
  return json.data;
}

export async function waitForApifyRun(
  runId: string,
  token: string,
  { pollMs = 6_000, maxMs = 300_000 } = {},
): Promise<void> {
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollMs));

    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    if (!res.ok) {
      continue;
    }

    const { data } = (await res.json()) as { data: { status: string } };

    if (data.status === 'SUCCEEDED') {
      return;
    }
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(data.status)) {
      throw new Error(`Apify run ${runId} ended with status: ${data.status}`);
    }
  }

  throw new Error(`Apify run ${runId} timed out after ${maxMs / 1000}s`);
}

export async function fetchApifyDataset<T>(
  datasetId: string,
  token: string,
  limit: number,
): Promise<T[]> {
  const url = `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&limit=${limit}&clean=true`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch Apify dataset ${datasetId}: ${res.status}`);
  }

  return res.json() as Promise<T[]>;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
