"use client";
import { useState } from "react";

export default function ImportPage() {
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [category, setCategory] = useState("SME");
  const [result, setResult] = useState<any>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(reader.result as string);
    reader.readAsText(file);
  }

  async function doPreview() {
    const res = await fetch("/api/csv-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "preview", csvText }) });
    const data = await res.json();
    setPreview(data);
    setMapping(data.suggestedMapping || {});
  }

  async function confirmImport() {
    const Papa = (await import("papaparse")).default;
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const res = await fetch("/api/csv-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "confirm", rows: parsed.data, mapping, category }),
    });
    setResult(await res.json());
  }

  const fields = ["company_name", "website", "telephone", "general_email", "decision_maker_name", "decision_maker_title", "decision_maker_email", "address", "region", "industry"];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-black text-slate-900">Import CSV</h1>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
        <input type="file" accept=".csv" onChange={onFile} className="text-sm" />
        <button onClick={doPreview} disabled={!csvText} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40">Preview</button>
      </div>

      {preview && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <p className="text-sm text-slate-600">{preview.totalRows} rows detected. Map columns below (auto-suggested where possible):</p>
          <div className="grid md:grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <label className="w-40 font-bold text-slate-600">{f}</label>
                <select value={mapping[f] || ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })} className="flex-1 border border-slate-300 rounded-lg px-2 py-1">
                  <option value="">— skip —</option>
                  {preview.columns.map((c: string) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="font-bold text-slate-600">Import into category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1">
              {["SME", "Corporate", "Education", "Close Network", "Business Partners"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={confirmImport} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold">Confirm Import</button>
        </div>
      )}

      {result && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-2">
          <p className="font-bold text-emerald-700">Imported {result.importedCount} new prospect(s).</p>
          {result.skippedAsDuplicate > 0 && (
            <p className="text-amber-700 text-sm">{result.skippedAsDuplicate} row(s) skipped as likely duplicates — existing CRM data was never overwritten. Review them on the Dedup screen.</p>
          )}
        </div>
      )}
    </div>
  );
}
