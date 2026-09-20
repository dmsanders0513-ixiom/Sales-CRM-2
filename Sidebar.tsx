"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/queue", label: "Call Queue", icon: "📞" },
  { href: "/agent", label: "Live AI Agent", icon: "🤖" },
  { href: "/inbox", label: "Inbox / Discovered", icon: "📥" },
];

const categories = [
  { filter: "SME", label: "SME Leads", icon: "🏪" },
  { filter: "Corporate", label: "Corporate Leads", icon: "🏢" },
  { filter: "Education", label: "Education Leads", icon: "🏫" },
  { filter: "Close Network", label: "Close Network", icon: "🤝" },
  { filter: "Business Partners", label: "Business Partners", icon: "🧩" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col flex-shrink-0 z-20 shadow-xl">
      <div className="p-4 bg-slate-950 border-b border-slate-800">
        <h1 className="text-lg font-extrabold text-blue-400">Intel CRM</h1>
        <p className="text-xs text-slate-400">Sales Command Centre</p>
      </div>

      <nav className="flex md:flex-col overflow-x-auto md:overflow-visible p-2 gap-1 md:gap-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold whitespace-nowrap transition ${
              pathname === item.href ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <span>{item.icon}</span> {item.label}
          </Link>
        ))}

        <div className="px-3 pt-3 pb-1 text-[10px] font-black text-slate-500 uppercase tracking-wider hidden md:block">
          Lead Categories
        </div>
        {categories.map((c) => (
          <Link
            key={c.filter}
            href={`/prospects?category=${encodeURIComponent(c.filter)}`}
            className="px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold text-slate-400 hover:bg-slate-800 whitespace-nowrap"
          >
            <span>{c.icon}</span> {c.label}
          </Link>
        ))}
      </nav>

      <div className="p-3 bg-slate-950 border-t border-slate-800 text-xs space-y-2">
        <Link href="/import" className="block w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-3 rounded-lg font-bold text-center">
          Import CSV
        </Link>
      </div>
    </aside>
  );
}
