import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/user";
import { createClient } from "@/lib/supabase/server";
import { categorizeProducts } from "@/lib/ai/categorize";

export const maxDuration = 20;

/** { names: string[] } → { categories: { nome: categoria } } per i prodotti nuovi senza categoria. */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const names: string[] = Array.isArray(body?.names)
    ? body.names.filter((n: unknown): n is string => typeof n === "string" && n.trim().length > 0).map((n: string) => n.trim().slice(0, 80)).slice(0, 40)
    : [];
  if (names.length === 0) return NextResponse.json({ categories: {} });

  const supabase = await createClient();
  const { data } = await supabase.from("lookup_values").select("value").eq("list_key", "product_category").order("position");
  const categories = (data ?? []).map((r) => r.value as string);
  try {
    return NextResponse.json({ categories: await categorizeProducts(names, categories) });
  } catch (err) {
    console.error("[products/categorize]", err);
    return NextResponse.json({ categories: Object.fromEntries(names.map((n) => [n, "Altro"])) });
  }
}
