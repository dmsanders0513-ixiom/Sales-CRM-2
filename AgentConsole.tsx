"use client";

export default function AgentConsole({ log }: { log: { ts: string; message: string }[] }) {
  if (log.length === 0) return null;
  return (
    <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 h-48 overflow-y-auto shadow-inner border border-slate-700">
      {log.map((entry, i) => (
        <div key={i} className="mb-1">
          <span className="text-slate-500">[{new Date(entry.ts).toLocaleTimeString()}]</span> &gt; {entry.message}
        </div>
      ))}
    </div>
  );
}
