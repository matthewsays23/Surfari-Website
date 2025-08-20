import React from "react";
import {
  Zap, Clock, ClipboardList,
  PlusCircle, ShoppingBag, Users, Shield, Activity, ArrowRight
} from "lucide-react";

export default function HomeScreen() {
  // Compact KPI set (Active Staff removed)
  const stats = [
    { icon: Zap, label: "Live Status", value: "Online", badge: "Healthy", badgeClass: "bg-green-100 text-green-700" },
    { icon: Clock, label: "Quota Completion", value: "87%", badge: "30m weekly", badgeClass: "bg-yellow-100 text-yellow-700" },
    { icon: ClipboardList, label: "Orders Today", value: "76", badge: "register", badgeClass: "bg-orange-100 text-orange-700" },
  ];

  const recent = [
    { id: 1, who: "WaveMaster", action: "completed session", when: "8m ago" },
    { id: 2, who: "CoachLuna", action: "issued warning", when: "22m ago" },
    { id: 3, who: "Jason", action: "closed order #1842", when: "43m ago" },
    { id: 4, who: "Kai", action: "met weekly quota", when: "1h ago" },
  ];

  const quick = [
    { icon: PlusCircle, label: "New Session", hint: "Plan training", intent: "primary" },
    { icon: ShoppingBag, label: "View Orders", hint: "Register logs" },
    { icon: Users, label: "Manage Staff", hint: "Roles & access" },
    { icon: Shield, label: "Moderation", hint: "Warnings & actions" },
  ];

  const quotaPct = 87; // wire real value later
  const ringStyle = { background: `conic-gradient(#fb923c ${quotaPct * 3.6}deg, #ffe4d6 0deg)` };

  return (
    <div className="space-y-8">
      {/* Hero (slightly smaller) */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-200 via-amber-100 to-emerald-100 p-5 sm:p-6">
        <div className="flex items-start gap-3 relative z-10">
          <img src="/surfari-initial.png" alt="Surfari" className="h-8 w-8 drop-shadow" />
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-orange-900 leading-snug">
              Welcome to Surfari’s Dashboard
            </h2>
            <p className="text-gray-800/90 mt-1.5 max-w-2xl text-sm sm:text-base">
              Track sessions, quotas, staff activity, and orders — all in one tropical panel.
            </p>
          </div>
        </div>
        <img
          src="/surfari-initial.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute -right-6 -bottom-6 w-36 h-36 sm:w-44 sm:h-44 opacity-15"
        />
      </section>

      {/* KPIs (compact) */}
      <section
        className="grid gap-4 sm:gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
        {stats.map((s, i) => (
          <div
            key={i}
            className="bg-white/95 backdrop-blur rounded-2xl border border-orange-100 shadow-sm hover:shadow-md transition p-4 sm:p-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-50 text-orange-600">
                <s.icon className="w-5 h-5" />
              </div>
              <div className="text-xs sm:text-sm text-gray-500">{s.label}</div>
              <span className={`ml-auto text-[10px] sm:text-xs px-2 py-0.5 rounded-full ${s.badgeClass}`}>{s.badge}</span>
            </div>
            <div className="mt-2.5 text-xl sm:text-2xl font-semibold text-gray-900">{s.value}</div>
          </div>
        ))}
      </section>

      {/* Quota + Quick Actions (balanced) */}
      <section className="grid gap-5 xl:grid-cols-3 items-start">
        {/* Quota ring (compact) */}
        <div className="bg-white/95 backdrop-blur rounded-2xl border border-orange-100 shadow-sm p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Weekly Quota</h3>
              <p className="text-xs sm:text-sm text-gray-500">30 minutes per member</p>
            </div>
            <Activity className="w-5 h-5 text-orange-500" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            <div className="relative h-24 w-24">
              <div className="absolute inset-0 rounded-full" style={ringStyle} />
              <div className="absolute inset-2 rounded-full bg-white" />
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-gray-900">{quotaPct}%</div>
                  <div className="text-[10px] sm:text-xs text-gray-500">met</div>
                </div>
              </div>
            </div>
            <ul className="text-sm text-gray-700 space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-orange-400" />
                Group average: <strong className="ml-1">26m</strong>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                Top performer: <strong className="ml-1">Kai — 1h 12m</strong>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
                Members meeting quota: <strong className="ml-1">68%</strong>
              </li>
            </ul>
          </div>

          <button className="group mt-5 inline-flex items-center gap-1.5 text-sm text-orange-700 hover:text-orange-800">
            View full activity
            <ArrowRight className="w-4 h-4 transition group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Quick actions (roomy but smaller than before) */}
        <div className="bg-white/95 backdrop-blur rounded-2xl border border-orange-100 shadow-sm p-5 xl:col-span-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Quick Actions</h3>
              <p className="text-xs sm:text-sm text-gray-500">Common admin tools at your fingertips</p>
            </div>
          </div>

          {/* Compact grid with comfortable min width */}
          <div
            className="mt-5 grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
          >
            {quick.map((q, i) => (
              <button
                key={i}
                className={`flex items-start gap-3 rounded-xl border border-orange-100 bg-white hover:shadow-md active:scale-[0.99] transition p-4 text-left ${
                  q.intent === "primary" ? "ring-1 ring-orange-200" : ""
                }`}
              >
                <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
                  <q.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">{q.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{q.hint}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Recent activity (compact) */}
      <section className="bg-white/95 backdrop-blur rounded-2xl border border-orange-100 shadow-sm">
        <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Recent Activity</h3>
            <p className="text-xs sm:text-sm text-gray-500">Latest sessions, orders, and moderation</p>
          </div>
          <button className="text-sm text-orange-700 hover:text-orange-800 inline-flex items-center gap-1.5">
            See all
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <ul className="divide-y divide-orange-100">
          {recent.map((r) => (
            <li key={r.id} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="text-sm text-gray-700">
                  <strong className="text-gray-900">{r.who}</strong> {r.action}
                </span>
              </div>
              <span className="text-xs text-gray-500">{r.when}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
