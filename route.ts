import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { findPotentialDuplicates, DedupeRecord } from "@/lib/dedupe";

/** GET /api/dedupe — scan the whole prospects table for potential duplicate pairs. */
export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("prospects").select("id, company_name, website, telephone, general_email, decision_maker_email");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const records: DedupeRecord[] = data || [];
  const pairsSeen = new Set<string>();
  const results: any[] = [];

  for (const record of records) {
    const matches = findPotentialDuplicates(record, records);
    for (const m of matches) {
      const key = [m.recordA, m.recordB].sort().join("::");
      if (pairsSeen.has(key)) continue;
      pairsSeen.add(key);
      results.push(m);
    }
  }

  return NextResponse.json({ potentialDuplicates: results, recordsScanned: records.length });
}

/**
 * POST /api/dedupe  { action: "merge" | "dismiss", recordA, recordB, keepId? }
 * MERGE: keeps `keepId` (or recordA by default), copies over any fields
 *   that are blank on the kept record but present on the other, then
 *   deletes the other record. Never a silent delete — this is always an
 *   explicit user action from the UI.
 * DISMISS: no-op marker, left to the client to remember (not persisted
 *   server-side since it's just a UI hide-this-pair state).
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  const body = await req.json();

  if (body.action === "dismiss") {
    return NextResponse.json({ dismissed: true });
  }

  if (body.action === "merge") {
    const keepId = body.keepId || body.recordA;
    const removeId = keepId === body.recordA ? body.recordB : body.recordA;

    const { data: keep, error: e1 } = await supabase.from("prospects").select("*").eq("id", keepId).single();
    const { data: remove, error: e2 } = await supabase.from("prospects").select("*").eq("id", removeId).single();
    if (e1 || e2 || !keep || !remove) return NextResponse.json({ error: "Could not load both records." }, { status: 404 });

    const merged: Record<string, any> = {};
    for (const key of Object.keys(remove)) {
      if (["id", "created_at", "updated_at"].includes(key)) continue;
      if ((keep as any)[key] === null || (keep as any)[key] === "" || (keep as any)[key] === undefined) {
        if (remove[key] !== null && remove[key] !== "") merged[key] = remove[key];
      }
    }

    if (Object.keys(merged).length > 0) {
      await supabase.from("prospects").update(merged).eq("id", keepId);
    }
    // Move activity history over before deleting the losing record
    await supabase.from("activities").update({ prospect_id: keepId }).eq("prospect_id", removeId);
    await supabase.from("prospects").delete().eq("id", removeId);
    await supabase.from("activities").insert({
      prospect_id: keepId,
      activity_type: "note",
      notes: `Merged with duplicate record "${remove.company_name}" (${removeId}).`,
    });

    return NextResponse.json({ merged: true, keptId: keepId, removedId: removeId });
  }

  return NextResponse.json({ error: "action must be 'merge' or 'dismiss'." }, { status: 400 });
}
