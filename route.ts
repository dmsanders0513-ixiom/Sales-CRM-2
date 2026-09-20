import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ prospects: [], discoveries: [] });

  const supabase = getServiceClient();
  const like = `%${q}%`;

  const [{ data: prospects }, { data: discoveries }] = await Promise.all([
    supabase
      .from("prospects")
      .select("*")
      .or(
        `company_name.ilike.${like},decision_maker_name.ilike.${like},website.ilike.${like},telephone.ilike.${like},general_email.ilike.${like},industry.ilike.${like},region.ilike.${like},notes.ilike.${like}`
      )
      .limit(25),
    supabase
      .from("discoveries")
      .select("*")
      .or(`company_name.ilike.${like},website.ilike.${like},industry.ilike.${like},region.ilike.${like}`)
      .limit(25),
  ]);

  return NextResponse.json({ prospects: prospects || [], discoveries: discoveries || [] });
}
