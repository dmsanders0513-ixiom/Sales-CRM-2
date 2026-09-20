"use client";
import { Prospect } from "@/types";

function isOverdue(date?: string | null) {
  if (!date) return false;
  return date < new Date().toISOString().slice(0, 10);
}

export function queueReason(p: Prospect): string | null {
  const today = new Date().toISOString().slice(0, 10);
  if (p.next_followup_date && p.next_followup_date < today) {
    const days = Math.round((new Date(today).getTime() - new Date(p.next_followup_date).getTime()) / 86400000);
    return `Follow-up overdue by ${days} day${days === 1 ? "" : "s"}`;
  }
  if (p.next_followup_date === today) return "Follow-up due today";
  if (p.manually_prioritised) return "Manually prioritised";
  if (p.contract_renewal_date) {
    const days = Math.round((new Date(p.contract_renewal_date).getTime() - new Date(today).getTime()) / 86400000);
    if (days > 0 && days <= 60) return `Contract renewal window approaching (${days}d)`;
  }
  return null;
}

export default function LeadCard({ p, index }: { p: Prospect; index?: number }) {
  const reason = queueReason(p);
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 transition space-y-3">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {index !== undefined && <span className="text-xs bg-slate-900 text-white font-extrabold px-2 py-0.5 rounded-md">#{index + 1}</span>}
            <span className="font-extrabold text-lg text-slate-900">{p.company_name}</span>
            {isOverdue(p.next_followup_date) && (
              <span className="text-[10px] bg-red-100 text-red-700 font-black px-2 py-0.5 rounded-full">OVERDUE</span>
            )}
            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">{p.category}</span>
            <span className="text-[10px] bg-slate-800 text-white font-bold px-2 py-0.5 rounded-full">{p.sales_stage}</span>
          </div>
          {reason && <p className="text-xs font-bold text-amber-700">⚡ {reason}</p>}
          {p.decision_maker_name && (
            <p className="text-sm text-slate-600">{p.decision_maker_name} — {p.decision_maker_title}</p>
          )}
          {p.lead_reason && <p className="text-xs text-slate-500 line-clamp-2">{p.lead_reason}</p>}
        </div>

        <div className="flex gap-2 flex-wrap">
          {p.telephone && (
            <a href={`tel:${p.telephone}`} className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-sm font-bold">📞 Call</a>
          )}
          {(p.decision_maker_email || p.general_email) && (
            <a href={`mailto:${p.decision_maker_email || p.general_email}`} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-bold">✉️ Email</a>
          )}
          {p.website && (
            <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer" className="bg-slate-800 text-white px-3 py-2 rounded-xl text-sm font-bold">🌐</a>
          )}
        </div>
      </div>
    </div>
  );
}
