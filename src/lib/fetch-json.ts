/** Shared fetcher: throws on non-2xx so useQuery surfaces real error states. */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }
  return res.json() as Promise<T>;
}
