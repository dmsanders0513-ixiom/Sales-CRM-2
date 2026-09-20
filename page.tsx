"use client";
import { useState } from "react";
import AgentConsole from "@/components/AgentConsole";

const CATEGORIES = ["SME", "Corporate", "Education", "Close Network", "Business Partners"];
const REGIONS = ["Pretoria", "Johannesburg", "Centurion", "East Rand", "Alberton / Germiston"];
const INDUSTRIES = ["Any", "Manufacturing", "Logistics", "Transport", "Healthcare", "Professional services", "Legal", "Accounting", "Construction", "Property", "Education", "Retail", "Hospitality", "Engineering", "Automotive", "Financial services", "Other"];
const SIZES = ["10-50", "50-200", "200-500", "500+"];
const COUNTS = [5, 10, 20, 50];

export default function AgentPage() {
  const [category, setCategory] = useState("SME");
  const [region, setRegion] = useState("Pretoria");
  const [industry, setIndustry] = useState("Any");
  const [size, setSize] = useState("50-200");
  const [leadCount, setLeadCount] = useState(10);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ ts: string; message: string }[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runAgent() {
    setRunning(true);
    setError(null);
    setLog([{ ts: new Date().toISOString(), message: "Deploying agent — this call blocks until the full pipeline finishes; the console below fills in once it completes." }]);
    setLeads([]);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, region, industry, companySizeBand: size, leadCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent run failed.");
      setLog(data.log || []);
      setLeads(data.leads || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="bg-indigo-900 p-6 rounded-3xl shadow-lg border border-indigo-700 text-white space-y-4">
        <h1 className="text-2xl font-black">🤖 Live Autonomous Prospecting Agent</h1>
        <p className="text-indigo-200 text-sm">
          Runs a staged Gemini research pipeline with real Google Search grounding. Results are never invented —
          every claim ties to a live source, and nothing here writes to your CRM automatically; qualified leads go
          to the Inbox for your review.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-indigo-950 border border-indigo-600 px-3 py-2 rounded-xl text-sm font-bold">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="bg-indigo-950 border border-indigo-600 px-3 py-2 rounded-xl text-sm font-bold">
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="bg-indigo-950 border border-indigo-600 px-3 py-2 rounded-xl text-sm font-bold">
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select value={size} onChange={(e) => setSize(e.target.value)} className="bg-indigo-950 border border-indigo-600 px-3 py-2 rounded-xl text-sm font-bold">
            {SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
          </select>
          <select value={leadCount} onChange={(e) => setLeadCount(Number(e.target.value))} className="bg-indigo-950 border border-indigo-600 px-3 py-2 rounded-xl text-sm font-bold">
            {COUNTS.map((c) => <option key={c} value={c}>{c} leads</option>)}
          </select>
        </div>

        <button onClick={runAgent} disabled={running} className="bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-800 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg">
          {running ? "Deploying agent…" : "⚡ Deploy Live Agent"}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm font-bold">{error}</div>}

      <AgentConsole log={log} />

      {leads.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-black text-xl">Agent Output: {leads.length} lead(s) saved to Inbox</h2>
          {leads.map((lead) => (
            <div key={lead.id} className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-l-indigo-500 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black">{lead.company_name}</h3>
                <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded font-bold">{lead.category} · {lead.industry || "—"}</span>
                <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded font-bold">Confidence: {lead.research_completeness}</span>
              </div>
              <p className="text-sm text-slate-600">{lead.address} ({lead.region})</p>
              {lead.decision_maker_name && (
                <p className="text-sm"><span className="font-bold">{lead.decision_maker_name}</span> — {lead.decision_maker_title} <span className="text-xs text-slate-400">[{lead.decision_maker_verification}]</span></p>
              )}
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-xs text-amber-900">
                <span className="font-bold">Trigger:</span> {lead.trigger_signal}
              </div>
              <p className="text-sm text-slate-700">{lead.lead_reason}</p>
              {lead.sources?.length > 0 && (
                <div className="text-xs space-x-2">
                  <span className="font-bold text-slate-500">Sources:</span>
                  {lead.sources.map((s: any, i: number) => (
                    <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">{s.title}</a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
