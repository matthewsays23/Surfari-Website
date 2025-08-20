import React, { useEffect, useMemo, useState } from "react";
import { Clock, CheckCircle2, AlertTriangle, RefreshCcw } from "lucide-react";

const API = "https://surfari.onrender.com";

export default function QuotaPanel() {
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const fetchAll = async () => {
    try {
      setErr("");
      setLoading(true);
      const [s, l] = await Promise.all([
        fetch(`${API}/stats/quota/summary`).then(r => r.json()),
        fetch(`${API}/stats/quota/list`).then(r => r.json()),
      ]);
      setSummary(s);
      setList(Array.isArray(l) ? l : []);
    } catch (e) {
      setErr(e.message || "Failed to load quota data");
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // countdown to reset
  const resetsIn = useMemo(() => {
    if (!summary?.weekEnd) return "";
    const end = new Date(summary.weekEnd).getTime();
    const now = Date.now();
    const diff = Math.max(0, end - now);
    const d = Math.floor(diff / (24*3600e3));
    const h = Math.floor((diff % (24*3600e3)) / 3600e3);
    const m = Math.floor((diff % 3600e3) / 60000);
    return `${d}d ${h}h ${m}m`;
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Weekly Quota</h3>
          <p className="text-sm text-gray-500">
            Target: <strong>{summary?.requiredMinutes ?? 30} minutes</strong> • Resets in {resetsIn || "--"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAll}
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-orange-200 hover:bg-orange-50 transition"
          >
            <RefreshCcw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi
          label="Users Met"
          value={`${summary?.metCount ?? 0} / ${summary?.totalUsers ?? 0}`}
          tone="ok"
        />
        <Kpi
          label="Quota Met %"
          value={`${summary?.quotaPct ?? 0}%`}
          tone={(summary?.quotaPct ?? 0) >= 70 ? "ok" : "warn"}
        />
        <Kpi
          label="Week Window"
          value={summary ? fmtDate(summary.weekStart) + " → " + fmtDate(summary.weekEnd) : "--"}
        />
      </div>

      {/* Error */}
      {err && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div>
            <div className="font-medium">Couldn’t load quota</div>
            <div className="text-red-600/80">{err}</div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <SkeletonList />
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-orange-100 bg-white/80 p-6 text-center text-sm text-gray-600">
          No activity yet this week.
        </div>
      ) : (
        <div className="rounded-2xl border border-orange-100 bg-white/90 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-orange-50/60 text-gray-600">
              <tr>
                <Th className="pl-6">User</Th>
                <Th>Progress</Th>
                <Th className="pr-6 text-right">Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {list.map((u) => (
                <tr key={u.userId} className="hover:bg-orange-50/30">
                  <td className="pl-6 py-3">
                    <div className="flex items-center gap-3">
                      {u.thumb ? (
                        <img
                          src={u.thumb}
                          alt={u.username}
                          className="h-9 w-9 rounded-lg border border-orange-100 object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <FallbackAvatar name={u.displayName || u.username} />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {u.displayName || u.username}
                        </div>
                        <div className="text-xs text-gray-500 truncate">@{u.username} · {u.userId}</div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3">
                    <ProgressBar
                      value={u.minutes}
                      max={summary?.requiredMinutes ?? 30}
                      label={`${u.minutes}m / ${summary?.requiredMinutes ?? 30}m`}
                    />
                  </td>

                  <td className="pr-6 py-3 text-right">
                    {u.met ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Met
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                        <Clock className="w-3.5 h-3.5" /> {u.remaining}m left
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ——— Small bits ——— */

function Kpi({ label, value, tone }) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "warn"
      ? "bg-yellow-50 text-yellow-800 border-yellow-100"
      : "bg-orange-50 text-orange-800 border-orange-100";
  return (
    <div className={`rounded-2xl border ${toneClass} p-4`}>
      <div className="text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function ProgressBar({ value = 0, max = 30, label }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="space-y-1">
      <div className="h-2 w-full bg-orange-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-orange-400 to-emerald-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-gray-500">{label} · {pct}%</div>
    </div>
  );
}

function Th({ children, className = "" }) {
  return <th className={`px-3 py-2 text-left font-medium ${className}`}>{children}</th>;
}

function FallbackAvatar({ name = "?" }) {
  return (
    <div className="h-9 w-9 rounded-lg grid place-items-center border border-orange-100 bg-gradient-to-br from-orange-100 to-emerald-100 text-orange-900 text-sm font-semibold">
      {String(name).slice(0, 1).toUpperCase()}
    </div>
  );
}

function fmtDate(d) {
  const x = new Date(d);
  return x.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
