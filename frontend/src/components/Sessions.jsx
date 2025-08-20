import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, X, Crown, ShieldCheck } from "lucide-react";

const API = "https://surfari.onrender.com";
const EST_SLOTS = [0,3,6,9,12,15,18,21];

export default function SessionsBoard() {
  const [weekStart, setWeekStart] = useState(mondayStart(new Date()));
  const [rows, setRows] = useState([]); // fetched sessions for week
  const [me, setMe] = useState(null);
  const [names, setNames] = useState({});
  const [thumbs, setThumbs] = useState({});
  const [open, setOpen] = useState(null); // session for drawer

  // me
  useEffect(() => {
    const token = localStorage.getItem("surfari_token");
    if (!token) return;
    fetch(`${API}/auth/verify`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(setMe).catch(() => {});
  }, []);

  // load week
  useEffect(() => { loadWeek(); }, [weekStart]);

  async function loadWeek() {
    const qs = new URLSearchParams({ weekStart: weekStart.toISOString() });
    const list = await fetch(`${API}/sessions?${qs}`).then(r => r.json());
    setRows(Array.isArray(list) ? list : []);

    // hydrate identities
    const ids = new Set();
    list.forEach(s => {
      if (s.hostId) ids.add(s.hostId);
      if (s.cohostId) ids.add(s.cohostId);
      (s.trainerIds || []).forEach(id => ids.add(id));
    });
    const arr = [...ids];
    if (arr.length) {
      const [u,t] = await Promise.all([
        fetch(`${API}/roblox/users?ids=${arr.join(",")}`).then(r=>r.json()),
        fetch(`${API}/roblox/thumbs?ids=${arr.join(",")}`).then(r=>r.json()),
      ]);
      const nm = {}; (u||[]).forEach(x => nm[x.id] = { username: x.name, displayName: x.displayName || x.name });
      setNames(nm);
      const tm = {}; (t?.data||[]).forEach(d => { if (d?.targetId) tm[d.targetId] = d.imageUrl || ""; });
      setThumbs(tm);
    } else { setNames({}); setThumbs({}); }
  }

  // columns model
  const days = useMemo(() => Array.from({length:7}, (_,i)=>addDays(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const map = new Map(days.map(d => [keyDay(d), []]));
    rows.forEach(s => {
      const k = keyDay(new Date(s.start));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    });
    // ensure a slot stub exists for display order
    for (const d of days) {
      const list = map.get(keyDay(d));
      EST_SLOTS.forEach(h => {
        const slot = list.find(x => getESTHour(new Date(x.start)) === h);
        if (!slot) list.push({ id: null, start: estToUtcForDay(d, h).startUTC, estHour: h, trainerIds: [] });
      });
      list.sort((a,b)=>new Date(a.start)-new Date(b.start));
    }
    return map;
  }, [days, rows]);

  async function claim(sessionId, role) {
    const token = localStorage.getItem("surfari_token");
    if (!token) return alert("Sign in first");
    await fetch(`${API}/sessions/claim`, {
      method: "POST",
      headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
      body: JSON.stringify({ sessionId, role }),
    }).then(r=>r.json());
    await loadWeek();
  }
  async function unclaim(sessionId, role) {
    const token = localStorage.getItem("surfari_token");
    await fetch(`${API}/sessions/unclaim`, {
      method: "POST",
      headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
      body: JSON.stringify({ sessionId, role }),
    }).then(r=>r.json());
    await loadWeek();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-orange-600" />
          <div>
            <div className="text-xs text-gray-500">Week of {weekStart.toLocaleDateString(undefined,{month:"short",day:"numeric"})}</div>
            <div className="text-lg font-semibold text-gray-900">Sessions</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setWeekStart(addDays(weekStart,-7))} className="p-2 rounded-lg border border-orange-200 hover:bg-orange-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={()=>setWeekStart(mondayStart(new Date()))} className="px-3 py-2 rounded-lg border border-orange-200 hover:bg-orange-50 text-sm">
            This Week
          </button>
          <button onClick={()=>setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-lg border border-orange-200 hover:bg-orange-50">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="grid grid-cols-7 gap-3">
        {days.map(d => {
          const list = byDay.get(keyDay(d)) || [];
          const isToday = sameDay(d, new Date());
          return (
            <div key={d.toISOString()} className="flex flex-col rounded-2xl border border-orange-100 bg-white/90">
              <div className={`px-3 py-2 text-sm font-semibold ${isToday ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-800"} rounded-t-2xl`}>
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </div>
              <div className="p-2 space-y-2">
                {list.map(s => (
                  <SlotChip key={s.id || new Date(s.start).toISOString()}
                            s={s} me={me} names={names} thumbs={thumbs}
                            onOpen={()=>s.id && setOpen(s)}
                            onClaim={claim} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drawer */}
      {open && (
        <Drawer onClose={()=>setOpen(null)} title={open.title || "Training Session"} subtitle={fmtEST(getESTHour(new Date(open.start)))+" EST"}>
          <Detail s={open} me={me} names={names} thumbs={thumbs} onClaim={claim} onUnclaim={unclaim}/>
        </Drawer>
      )}
    </div>
  );
}

/* UI bits */
function SlotChip({ s, me, names, thumbs, onOpen, onClaim }) {
  const estHour = getESTHour(new Date(s.start));
  const host = s.hostId && names[s.hostId];
  const co   = s.cohostId && names[s.cohostId];
  const trainers = (s.trainerIds||[]).slice(0,3);
  const free = !s.id;

  return (
    <div className={`group rounded-xl border ${free ? "border-dashed text-gray-400" : "border-orange-100"} bg-white px-2 py-1.5`}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-gray-600">{fmtEST(estHour)}</span>
        <div className="ml-auto flex items-center gap-1">
          {s.hostId ? <BadgeIcon Icon={Crown} title="Host" /> : null}
          {s.cohostId ? <BadgeIcon Icon={ShieldCheck} title="Co-host" /> : null}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1">
        {s.hostId && <Avatar img={thumbs[s.hostId]} />}
        {s.cohostId && <Avatar img={thumbs[s.cohostId]} />}
        {(s.trainerIds||[]).map((id,i)=> i<3 && <Avatar key={id} img={thumbs[id]} />)}
        {s.trainerIds && s.trainerIds.length>3 && (
          <span className="text-[10px] text-gray-500">+{s.trainerIds.length-3}</span>
        )}
        <div className="ml-auto">
          {free ? (
            <span className="text-[11px]">No session</span>
          ) : (
            <button
              onClick={onOpen}
              className="text-[11px] px-2 py-1 rounded-md border border-orange-200 hover:bg-orange-50"
            >
              Details
            </button>
          )}
        </div>
      </div>

      {!free && !s.hostId && (
        <button
          onClick={()=>onClaim(s.id,"host")}
          className="mt-1 w-full text-[11px] px-2 py-1 rounded-md border border-amber-200 hover:bg-amber-50"
        >
          <Plus className="inline w-3 h-3 mr-1" /> Claim Host
        </button>
      )}
    </div>
  );
}

function Detail({ s, me, names, thumbs, onClaim, onUnclaim }) {
  const cap = s.maxTrainers ?? 4;
  const trainers = s.trainerIds || [];
  const mineTrainer = me?.userId && trainers.includes(me.userId);

  const Row = ({label, userId, claimRole}) => {
    const n = userId && names[userId];
    return (
      <div className="rounded-xl border border-orange-100 bg-white/90 p-3 flex items-center gap-3">
        {label === "Host" ? <Crown className="w-4 h-4 text-yellow-600" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
        {userId ? (
          <>
            <img src={thumbs[userId] || ""} className="h-8 w-8 rounded-md border border-orange-100 object-cover" alt="" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{n?.displayName || `User ${userId}`}</div>
              <div className="text-[11px] text-gray-500">@{n?.username || userId}</div>
            </div>
            {me?.userId === userId && (
              <button onClick={()=>onUnclaim(s.id, claimRole.toLowerCase())}
                className="ml-auto text-[12px] px-2.5 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50">
                Unclaim
              </button>
            )}
          </>
        ) : (
          <>
            <div className="text-sm text-gray-700">{label}</div>
            <button onClick={()=>onClaim(s.id, claimRole.toLowerCase())}
              className="ml-auto text-sm px-3 py-2 rounded-md border border-orange-200 hover:bg-orange-50">
              Claim {label}
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <Row label="Host" claimRole="Host" userId={s.hostId} />
      <Row label="Co-Host" claimRole="Cohost" userId={s.cohostId} />
      <div>
        <div className="text-xs font-semibold text-gray-700 mb-2">Trainers ({trainers.length}/{cap})</div>
        <div className="space-y-2">
          {trainers.length === 0 && <div className="text-xs text-gray-500">No trainers yet.</div>}
          {trainers.map(uid => {
            const n = names[uid];
            return (
              <div key={uid} className="flex items-center gap-2">
                <img src={thumbs[uid] || ""} className="h-7 w-7 rounded-md border border-orange-100 object-cover" alt="" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{n?.displayName || `User ${uid}`}</div>
                  <div className="text-[11px] text-gray-500">@{n?.username || uid}</div>
                </div>
                {me?.userId === uid && (
                  <button onClick={()=>onUnclaim(s.id,"trainer")}
                    className="ml-auto text-[11px] px-2 py-1 rounded-md border border-red-200 text-red-700 hover:bg-red-50">
                    Remove me
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {(!mineTrainer && trainers.length < cap) && (
          <button onClick={()=>onClaim(s.id,"trainer")}
            className="mt-3 inline-flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-orange-200 hover:bg-orange-50">
            <Plus className="w-4 h-4" /> Claim as Trainer
          </button>
        )}
      </div>
    </div>
  );
}

function Drawer({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md h-full bg-white border-l border-orange-100 shadow-xl p-5 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-gray-500">{subtitle}</div>
            <div className="text-lg font-semibold text-gray-900">{title}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg border border-orange-200 hover:bg-orange-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Avatar({ img }) {
  return <img src={img || ""} className="h-6 w-6 rounded-md border border-orange-100 object-cover" alt="" />;
}
function BadgeIcon({ Icon, title }) {
  return <Icon className="w-3.5 h-3.5 text-orange-500" title={title} />;
}

/* time helpers */
function mondayStart(d){ const x=new Date(d); const g=x.getDay(); const diff=g===0?-6:1-g; x.setDate(x.getDate()+diff); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function keyDay(d){ return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function getESTHour(utc){ return new Date(utc).toLocaleString("en-US",{ timeZone:"America/New_York", hour:"numeric", hour12:false })*1; }
function fmtEST(h){ const hh=((h+11)%12)+1; return `${String(hh).padStart(2,"0")}:00 ${h<12?"AM":"PM"}`; }
function estToUtcForDay(day, estHour){
  const y=day.getFullYear(), m=day.getMonth(), d=day.getDate();
  const estLocal = new Date(`${y}-${m+1}-${d}T${String(estHour).padStart(2,"0")}:00:00`);
  return { startUTC: new Date(estLocal.toLocaleString("en-US",{timeZone:"UTC"})) };
}
