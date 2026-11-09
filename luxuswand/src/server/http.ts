export type JsonReply = { ok: boolean; status: number | null; json: unknown; text: string };

/** POSTs JSON to an outside service. Never throws: a network failure comes back as ok=false. */
export async function postJson(
  url: string,
  options: { headers: Record<string, string>; body: unknown; timeoutMs: number },
): Promise<JsonReply> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...options.headers },
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs),
      cache: "no-store",
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON: the raw text is kept for the log.
    }
    return { ok: response.ok, status: response.status, json, text };
  } catch (error) {
    return { ok: false, status: null, json: null, text: error instanceof Error ? error.message : String(error) };
  }
}
