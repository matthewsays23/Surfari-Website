import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock, Users, Target, Trophy, RefreshCcw, AlertTriangle,
  Search, ChevronLeft, ChevronRight, Info
} from "lucide-react";

const API = "https://surfari.onrender.com";
const REFRESH_MS = 30_000;
const QUOTA_MIN = 30;

export default function Activity() {
  // ✅ this must be inside the component
  const [showDirectory, setShowDirectory] = useState(false);

  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [names, setNames] = useState({});
  const [thumbs, setThumbs] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const timer = useRef(null);

  // Full quota directory (search + paging)
  const [qRows, setQRows] = useState([]);
  const [qPage, setQPage] = useState(1);
  const [qPages, setQPages] = useState(1);
  const [qLimit] = useState(25);
  const [qSearch, setQSearch] = useState("");

  // Collect all userIds we need to hydrate
  const allIds = useMemo(() => {
    const ids = new Set();
    leaders.forEach(l => ids.add(l.userId));
    recent.forEach(r => ids.add(r.userId));
    qRows.forEach(r => ids.add(r.userId));
    return Array.from(ids).filter(Boolean);
  }, [leaders, recent, qRows]);

  const safeJson = async (res) => {
    const ct = res.headers.get("content-type") || "";
    if (!res.ok) {
      const body = ct.includes("application/json") ? await res.json() : await res.text();
      throw new Error(body?.error || body || `HTTP ${res.status}`);
    }
    return ct.includes("application/json") ? res.json() : {};
  };

  const fetchWithTimeout = (url, opts = {}, ms = 10_000) => {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
  };

  const nextWeeklyReset = () => {
    const now = new Date();
    const next = new Date(now);
    const daysAhead = (8 - now.getDay()) % 7 || 7; // next Monday 00:00
    next.setDate(now.getDate() + daysAhead);
    next.setHours(0, 0, 0, 0);
    return next;
  };

  const formatCountdown = (toDate) => {
    const diff = Math.max(0, toDate.getTime() - Date.now());
    const s = Math.floor(diff / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const loadSummaryCore = async () => {
    const [s, r, l] = await Promise.all([
      fetchWithTimeout(`${API}/stats/summary`).then(safeJson),
      fetchWithTimeout(`${API}/stats/recent`).then(safeJson),
      fetchWithTimeout(`${API}/stats/leaderboard`).then(safeJson),
    ]);
    setSummary(s);
    setRecent(Array.isArray(r) ? r : []);
    setLeaders(Array.isArray(l) ? l : []);
  };

  const loadQuotaPage = async (page = 1, limit = qLimit, search = "") => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...(search ? { search } : {}) });
    const data = await fetchWithTimeout(`${API}/stats/progress?${qs}`).then(safeJson);
    setQRows(Array.isArray(data.rows) ? data.rows : []);
    setQPage(data.page ?? 1);
    setQPages(data.pages ?? 1);
    return data;
  };

  const hydrateProfiles = async (ids) => {
    if (!ids.length) { setNames({}); setThumbs({}); return; }
    const [u, t] = await Promise.all([
      fetchWithTimeout(`${API}/roblox/users?ids=${ids.join(",")}`).then(safeJson),
      fetchWithTimeout(`${API}/roblox/thumbs?ids=${ids.join(",")}`).then(safeJson),
    ]);
    const nameMap = {};
    (u || []).forEach(x => { nameMap[x.id] = { username: x.name, displayName: x.displayName || x.name }; });
    setNames(prev => ({ ...prev, ...nameMap }));
    const thumbMap = {};
    (t?.data || []).forEach(d => { if (d?.targetId) thumbMap[d.targetId] = d.imageUrl || ""; });
    setThumbs(prev => ({ ...prev, ...thumbMap }));
  };

  const loadAll = async (page = qPage, limit = qLimit, search = qSearch) => {
    try {
      setErr("");
      setLoading(true);
      await loadSummaryCore();
      const data = await loadQuotaPage(page, limit, search);
      const ids = new Set();
      leaders.forEach(x => x?.userId && ids.add(x.userId));
      recent.forEach(x => x?.userId && ids.add(x.userId));
      (data.rows || []).forEach(x => x?.userId && ids.add(x.userId));
      await hydrateProfiles(Array.from(ids));
    } catch (e) {
      console.error("[Activity] load error:", e);
      setErr(e.message || "Failed to load activity");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(1, qLimit, "");
    timer.current = setInterval(() => loadAll(qPage, qLimit, qSearch), REFRESH_MS);
    return () => clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quotaTarget = summary?.quotaTarget ?? QUOTA_MIN;
  const resetAt = nextWeeklyReset();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl border border-orange-100 bg-white/70 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-2xl border border-orange-100 bg-white/70 animate-pulse" />
          <div className="h-72 rounded-2xl border border-orange-100 bg-white/70 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Activity</h2>
          <p className="text-sm text-gray-500">Live usage, quotas, and recent sessions</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Quota pill toggles the full directory */}
          <button
            onClick={() => setShowDirectory(v => !v)}
            className={`inline-flex items-center gap-2 text-sm px-3 py-2 rounded-full border border-orange-200 bg-white hover:bg-orange-50 transition ${showDirectory ? "ring-1 ring-orange-300" : ""}`}
            title="Weekly quota target & member progress"
          >
            <Target className="w-4 h-4 text-orange-600" />
            <span className="font-medium text-gray-800">Quota: {quotaTarget}m</span>
          </button>

          <button
            onClick={() => loadAll(qPage, qLimit, qSearch)}
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-full border border-orange-200 bg-white hover:bg-orange-50 transition"
          >
            <RefreshCcw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Collapsible quota directory */}
      {showDirectory && (
        <section className="rounded-2xl border border-orange-100 bg-white/95 p-5 animate-[fadeIn_.15s_ease-out]">
          <QuotaDirectory
            rows={qRows}
            page={qPage}
            pages={qPages}
            quotaTarget={quotaTarget}
            names={names}
            thumbs={thumbs}
            search={qSearch}
            onSearch={(val) => { setQSearch(val); loadAll(1, qLimit, val); }}
            onPage={(p) => loadAll(p, qLimit, qSearch)}
          />
        </section>
      )}

      {err && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div>
            <div className="font-medium">Couldn’t load activity</div>
            <div className="text-red-600/80">{err}</div>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Users Online" value={summary?.liveCount ?? 0} />
        <Kpi icon={Clock} label="Minutes Today" value={summary?.todayMinutes ?? 0} />
        <Kpi icon={Trophy} label="Minutes This Week" value={summary?.weekMinutes ?? 0} />
        <QuotaGauge pct={summary?.quotaPct ?? 0} label={`Quota Met (${quotaTarget}m)`} />
      </div>

      {/* Quota Progress (top list + countdown) */}
      <QuotaPanel
        leaders={leaders.slice(0, 8)}
        names={names}
        thumbs={thumbs}
        quotaTarget={quotaTarget}
        nextResetText={formatCountdown(resetAt)}
      />

      {/* Time Logs + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TimeLogs recent={recent} names={names} thumbs={thumbs} />
        <Leaderboard leaders={leaders} names={names} thumbs={thumbs} />
      </div>
    </div>
  );
}

/* ===== UI Pieces ===== */

function Kpi({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-white/95 p-5 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-2xl font-semibold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

function QuotaGauge({ pct = 0, label }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const ringStyle = { background: `conic-gradient(#10b981 ${clamped * 3.6}deg, #fee3d6 0deg)` };
  return (
    <div className="rounded-2xl border border-orange-100 bg-white/95 p-5 flex items-center gap-4">
      <div className="relative h-16 w-16 shrink-0">
        <div className="absolute inset-0 rounded-full" style={ringStyle} />
        <div className="absolute inset-1.5 rounded-full bg-white" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-base font-semibold text-gray-900">{clamped}%</div>
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm text-gray-600 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-gray-400" /> Percentage of members who met weekly quota
        </div>
      </div>
    </div>
  );
}

function QuotaPanel({ leaders, names, thumbs, quotaTarget, nextResetText }) {
  return (
    <section className="rounded-2xl border border-orange-100 bg-white/95 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Quota Progress</h3>
          <p className="text-sm text-gray-500">
            Target <span className="font-medium text-gray-800">{quotaTarget} minutes</span> · Resets in{" "}
            <span className="font-medium text-gray-800">{nextResetText}</span>
          </p>
        </div>
      </div>

      {leaders.length === 0 ? (
        <Empty msg="No quota progress yet this week." />
      ) : (
        <ul className="space-y-3">
          {leaders.map((u) => {
            const n = names[u.userId] || {};
            const img = thumbs[u.userId];
            const mins = Math.round(u.minutes || 0);
            const pct = Math.min(100, Math.round((mins / quotaTarget) * 100));
            const hit = pct >= 100;

            return (
              <li key={u.userId} className="flex items-center gap-3">
                {img ? (
                  <img src={img} alt={n.username || u.userId} className="h-8 w-8 rounded-lg border border-orange-100 object-cover" />
                ) : (
                  <AvatarFallback name={n.displayName || n.username || String(u.userId)} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate">
                      <div className="text-sm font-medium text-gray-900 truncate">{n.displayName || n.username || `User ${u.userId}`}</div>
                      <div className="text-xs text-gray-500 truncate">@{n.username || u.userId}</div>
                    </div>
                    <div className="text-xs text-gray-600 w-20 text-right">{mins}m</div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-orange-100 overflow-hidden">
                    <div className={`h-full ${hit ? "bg-emerald-500" : "bg-orange-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${hit ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-800"}`}>
                  {hit ? "Met" : `${pct}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function QuotaDirectory({ rows, page, pages, quotaTarget, names, thumbs, search, onSearch, onPage }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">All Members — Weekly Progress</h3>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by username or ID…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-orange-200 focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty msg="No data for this week yet." />
      ) : (
        <ul className="divide-y divide-orange-100">
          {rows.map((u) => {
            const n = names[u.userId] || {};
            const img = thumbs[u.userId];
            const mins = Math.round(u.minutes || 0);
            const pct = Math.min(100, Math.round((mins / quotaTarget) * 100));
            const hit = pct >= 100;

            return (
              <li key={u.userId} className="py-3 flex items-center gap-3">
                {img ? (
                  <img
                    src={img}
                    alt={n.username || u.userId}
                    className="h-8 w-8 rounded-lg border border-orange-100 object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <AvatarFallback name={n.displayName || n.username || String(u.userId)} />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {n.displayName || n.username || `User ${u.userId}`}
                      </div>
                      <div className="text-xs text-gray-500 truncate">@{n.username || u.userId}</div>
                    </div>
                    <div className="text-xs text-gray-600 w-20 text-right">{mins}m</div>
                  </div>

                  <div className="mt-2 h-2 rounded-full bg-orange-100 overflow-hidden">
                    <div className={`h-full ${hit ? "bg-emerald-500" : "bg-orange-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <span className={`text-xs px-2 py-0.5 rounded-full ${hit ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-800"}`}>
                  {hit ? "Met" : `${pct}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="inline-flex items-center gap-1 text-sm px-2 py-1.5 rounded-md border border-orange-200 disabled:opacity-50"
        >
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        <span className="text-sm text-gray-600">
          Page <strong>{page}</strong> of <strong>{pages}</strong>
        </span>
        <button
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="inline-flex items-center gap-1 text-sm px-2 py-1.5 rounded-md border border-orange-200 disabled:opacity-50"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function TimeLogs({ recent, names, thumbs }) {
  return (
    <section className="rounded-2xl border border-orange-100 bg-white/95 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><Clock className="w-4 h-4" /></div>
        <h3 className="text-lg font-semibold text-gray-900">Time Logs (Recent)</h3>
      </div>
      {recent.length === 0 ? (
        <Empty msg="No recent sessions yet." />
      ) : (
        <ul className="divide-y divide-orange-100">
          {recent.map((s, i) => {
            const n = names[s.userId] || {};
            const img = thumbs[s.userId];
            return (
              <li key={i} className="py-3 flex items-center gap-3">
                {img ? (
                  <img src={img} alt={n.username || s.userId} className="h-9 w-9 rounded-lg border border-orange-100 object-cover" />
                ) : (
                  <AvatarFallback name={n.displayName || n.username || String(s.userId)} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 truncate">
                    <span className="font-medium text-gray-900">{n.displayName || n.username || `User ${s.userId}`}</span>
                    <span className="text-gray-500"> · {Math.round(s.minutes)}m</span>
                  </div>
                  <div className="text-xs text-gray-500">{timeAgo(s.endedAt || s.lastHeartbeat || s.startedAt)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Leaderboard({ leaders, names, thumbs }) {
  return (
    <section className="rounded-2xl border border-orange-100 bg-white/95 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-lg bg-orange-50 text-orange-600"><Trophy className="w-4 h-4" /></div>
        <h3 className="text-lg font-semibold text-gray-900">Top This Week</h3>
      </div>
      {leaders.length === 0 ? (
        <Empty msg="No leaderboard data yet." />
      ) : (
        <ul className="divide-y divide-orange-100">
          {leaders.map((u, i) => {
            const n = names[u.userId] || {};
            const img = thumbs[u.userId];
            return (
              <li key={u.userId} className="py-3 flex items-center gap-3">
                <RankBadge n={i + 1} />
                {img ? (
                  <img src={img} alt={n.username || u.userId} className="h-9 w-9 rounded-lg border border-orange-100 object-cover" />
                ) : (
                  <AvatarFallback name={n.displayName || n.username || String(u.userId)} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{n.displayName || n.username}</div>
                  <div className="text-xs text-gray-500 truncate">@{n.username || u.userId}</div>
                </div>
                <div className="text-sm font-semibold text-gray-900">{Math.round(u.minutes)}m</div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* tiny helpers */
function RankBadge({ n }) {
  const styles = n === 1
    ? "bg-yellow-100 text-yellow-800"
    : n === 2
    ? "bg-gray-100 text-gray-700"
    : n === 3
    ? "bg-orange-100 text-orange-800"
    : "bg-slate-100 text-slate-700";
  return <span className={`w-7 h-7 grid place-items-center rounded-lg text-xs font-semibold ${styles}`}>{n}</span>;
}

function AvatarFallback({ name = "?" }) {
  return (
    <div className="h-9 w-9 rounded-lg grid place-items-center border border-orange-100 bg-gradient-to-br from-orange-100 to-emerald-100 text-orange-900 text-xs font-semibold">
      {String(name).slice(0, 1).toUpperCase()}
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div className="rounded-xl border border-orange-100 bg-white/70 p-5 text-center text-sm text-gray-600">
      {msg}
    </div>
  );
}

function timeAgo(dateLike) {
  try {
    const d = new Date(dateLike);
    const s = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}
