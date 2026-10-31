import { chatCompletion } from "./nvidia";

/**
 * Assegna una categoria a prodotti nuovi scritti senza sceglierla (es. "origano" →
 * "Pasta e dispensa"). Solo categorie della lista; in caso di dubbio o errore "Altro".
 */
export async function categorizeProducts(names: string[], categories: string[]): Promise<Record<string, string>> {
  const fallback = Object.fromEntries(names.map((n) => [n, "Altro"]));
  if (names.length === 0 || categories.length === 0) return fallback;
  const raw = await chatCompletion(
    [
      {
        role: "system",
        content: `Classifica prodotti della spesa al supermercato. Categorie ammesse: ${categories.join(", ")}.
Rispondi SOLO con un oggetto JSON che associa ogni nome (scritto identico) a una categoria ammessa. Se nessuna va bene usa "Altro".`,
      },
      { role: "user", content: JSON.stringify(names) },
    ],
    // margine ampio: il modello di riserva (gpt-oss) consuma token anche per "ragionare"
    1500
  );
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};
    const out: Record<string, string> = { ...fallback };
    for (const n of names) {
      const c = parsed[n];
      if (typeof c === "string" && categories.includes(c)) out[n] = c;
    }
    return out;
  } catch {
    return fallback;
  }
}
