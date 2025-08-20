import React, { useEffect, useState } from "react";
import { Users, ShieldCheck, RefreshCcw, AlertTriangle } from "lucide-react";

export default function Team() {
  const [admins, setAdmins] = useState([]);
  const [thumbs, setThumbs] = useState({}); // { userId: imageUrl }
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const fetchThumbs = async (ids) => {
    if (!ids.length) return {};
    const res = await fetch(`https://surfari.onrender.com/roblox/thumbs?ids=${ids.join(",")}`);
    // guard against non-JSON responses
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : { data: [] };
    const map = {};
    (data.data || []).forEach((d) => {
      if (d?.targetId) map[d.targetId] = d.imageUrl || "";
    });
    return map;
  };

  const load = async () => {
    try {
      setErr("");
      setLoading(true);

      const res = await fetch("https://surfari.onrender.com/auth/team");
      const list = await res.json();
      const clean = Array.isArray(list) ? list : [];

      // sort by rank desc so higher ranks show first
      clean.sort((a, b) => (b.roleRank ?? 0) - (a.roleRank ?? 0));
      setAdmins(clean);

      const ids = clean.map((a) => a.userId).filter(Boolean);
      const map = await fetchThumbs(ids);
      setThumbs(map);
    } catch (e) {
      console.error("[Team] load error:", e);
      setErr(e.message || "Failed to load team");
      setAdmins([]);
      setThumbs({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const FallbackAvatar = ({ name = "?" }) => (
    <div className="h-12 w-12 rounded-xl grid place-items-center border border-orange-100 bg-gradient-to-br from-orange-100 to-emerald-100 text-orange-900 font-semibold">
      {String(name).slice(0, 1).toUpperCase()}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-orange-50 text-orange-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Team</h2>
            <p className="text-sm text-gray-500">
              Admins with access to Surfari • <span className="font-medium text-gray-800">{admins.length}</span>
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-orange-200 hover:bg-orange-50 transition"
        >
          <RefreshCcw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Error */}
      {err && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div>
            <div className="font-medium">Couldn’t load the team</div>
            <div className="text-red-600/80">{err}</div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl border border-orange-100 bg-white/60 animate-pulse" />
          ))}
        </div>
      ) : admins.length === 0 ? (
        <div className="rounded-2xl border border-orange-100 bg-white/80 p-6 text-center text-sm text-gray-600">
          No admins returned.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {admins.map((a) => {
            const img = thumbs[a.userId];
            const roleName = a.roleName || a.role || "Admin";
            const rank = typeof a.roleRank === "number" ? a.roleRank : null;
            return (
              <div key={a.userId} className="rounded-2xl border border-orange-100 bg-white/90 p-5 hover:shadow-md transition">
                <div className="flex items-center gap-4">
                  {img ? (
                    <img
                      className="h-12 w-12 rounded-xl object-cover border border-orange-100"
                      src={img}
                      alt={a.username}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <FallbackAvatar name={a.displayName || a.username} />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 truncate">{a.displayName}</span>
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <ShieldCheck className="w-3 h-3" /> {roleName}
                        {rank !== null && <span className="ml-1 text-[10px] text-gray-600">({rank})</span>}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">@{a.username} · ID {a.userId}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
