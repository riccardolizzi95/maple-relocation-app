/**
 * Ricerca web via Tavily (tavily.com — piano gratuito con chiave).
 * Se TAVILY_API_KEY manca, la ricerca è disabilitata e la chat funziona senza.
 */

export interface WebResult {
  title: string;
  url: string;
  content: string;
}

export function webSearchAvailable(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

export async function searchWeb(query: string): Promise<WebResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: 4,
      search_depth: "basic",
      include_answer: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.error("[websearch] Tavily error:", res.status, (await res.text()).slice(0, 300));
    return [];
  }
  const data = await res.json();
  return (data.results ?? []).map((r: { title: string; url: string; content: string }) => ({
    title: r.title,
    url: r.url,
    content: (r.content ?? "").slice(0, 800),
  }));
}
