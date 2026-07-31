/**
 * Bounded-concurrency helpers.
 *
 * Generation fans out per post — brand-voice rewrites, slide captions,
 * voice-over synthesis. Unbounded, that scales with campaign size: a 400-post
 * campaign registered ~800 simultaneous background promises inside a single
 * serverless invocation, each holding a socket and an LLM/TTS request. These
 * keep the fan-out flat regardless of how big the campaign is.
 */

/** Run `task` over every item, at most `limit` in flight at once. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) {
    return [];
  }

  const results: PromiseSettledResult<R>[] = Array.from({ length: items.length });
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index]!;
      try {
        results[index] = { status: 'fulfilled', value: await task(item, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker()),
  );

  return results;
}

/**
 * Run a list of already-bound thunks, at most `limit` at once, and never
 * reject. For fire-and-forget background work where one failure must not take
 * the batch — or the invocation — down.
 */
export async function runWithConcurrency(
  tasks: readonly (() => Promise<unknown>)[],
  limit: number,
  onError?: (err: unknown, index: number) => void,
): Promise<void> {
  const settled = await mapWithConcurrency(tasks, limit, task => task());
  settled.forEach((result, i) => {
    if (result.status === 'rejected') {
      onError?.(result.reason, i);
    }
  });
}
