// backend/routes/sessions.js
import express from "express";
import { getDb } from "../db.js";

const router = express.Router();

// EST-anchored 2h blocks:
const EST_SLOTS = [0, 3, 6, 9, 12, 15, 18, 21];

// ---- helpers ----
function mondayStart(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay(); // 0 Sun..6 Sat
  const diff = dow === 0 ? -6 : 1 - dow; // Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function estToUtcForDay(dayLocal, estHour) {
  const y = dayLocal.getFullYear(), m = dayLocal.getMonth(), d = dayLocal.getDate();
  // construct EST wall time string
  const estLocal = new Date(`${y}-${m+1}-${d}T${String(estHour).padStart(2,"0")}:00:00`);
  // convert to UTC by formatting using UTC TZ
  const startUTC = new Date(estLocal.toLocaleString("en-US",{ timeZone:"UTC" }));
  const endUTC = new Date(startUTC.getTime() + 2*60*60*1000);
  return { startUTC, endUTC };
}
function idFor(start){ return `sess-${start.toISOString()}`; }

// simple auth (re-uses your /auth tokens collection)
async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || "").split(" ")[1];
    if (!token) return res.status(401).json({ error: "Missing token" });
    const db = getDb();
    const s = await db.collection("sessions").findOne({ token });
    if (!s?.userId) return res.status(403).json({ error: "Invalid token" });
    req.userId = s.userId;
    next();
  } catch (e) {
    console.error("sessions auth error:", e.message);
    res.status(500).json({ error: "Auth error" });
  }
}

// ---- indexes (call once at boot) ----
export async function ensureSessionIndexes() {
  const db = getDb();
  await db.collection("calendar_sessions").createIndex({ start: 1 }, { unique: true });
  await db.collection("calendar_sessions").createIndex({ weekStart: 1 });
}

// ---- list week ----
// GET /sessions?weekStart=ISO
router.get("/", async (req, res) => {
  const db = getDb();
  const ws = mondayStart(new Date(req.query.weekStart || Date.now()));
  const we = addDays(ws, 7);

  const rows = await db.collection("calendar_sessions")
    .find({ start: { $gte: ws, $lt: we } }, { projection: { _id: 0 } })
    .sort({ start: 1 })
    .toArray();

  res.json(rows);
});

// ---- publish weeks ahead (idempotent) ----
// POST /sessions/publish { startISO?, weeks: 1..12, title?, maxTrainers? }
router.post("/publish", async (req, res) => {
  const db = getDb();
  const ws = mondayStart(new Date(req.body.startISO || Date.now()));
  const weeks = Math.min(12, Math.max(1, Number(req.body.weeks || 1)));
  const title = req.body.title || "Training Session";
  const maxTrainers = Math.max(0, Number(req.body.maxTrainers ?? 4));

  const ops = [];
  for (let w = 0; w < weeks; w++) {
    const base = addDays(ws, w * 7);
    for (let d = 0; d < 7; d++) {
      const day = addDays(base, d);
      for (const h of EST_SLOTS) {
        const { startUTC, endUTC } = estToUtcForDay(day, h);
        ops.push({
          updateOne: {
            filter: { id: idFor(startUTC) },
            update: {
              $setOnInsert: {
                id: idFor(startUTC),
                weekStart: base,
                start: startUTC,
                end: endUTC,
                estHour: h,
                title,
                serverTag: null,
                hostId: null,
                cohostId: null,
                trainerIds: [],
                maxTrainers,
                notes: ""
              }
            },
            upsert: true
          }
        });
      }
    }
  }

  if (ops.length) await db.collection("calendar_sessions").bulkWrite(ops, { ordered: false });
  res.json({ ok: true, weeksPublished: weeks });
});

// ---- claim / unclaim ----
// POST /sessions/claim { sessionId, role: "host"|"cohost"|"trainer" }
router.post("/claim", auth, async (req, res) => {
  const db = getDb();
  const { sessionId, role } = req.body;
  const uid = req.userId;

  const s = await db.collection("calendar_sessions").findOne({ id: sessionId });
  if (!s) return res.status(404).json({ error: "Session not found" });
  if (new Date(s.end) < new Date()) return res.status(400).json({ error: "Session is in the past" });

  if (role === "host") {
    if (s.hostId && s.hostId !== uid) return res.status(409).json({ error: "Host already claimed" });
    await db.collection("calendar_sessions").updateOne({ id: sessionId }, { $set: { hostId: uid } });
  } else if (role === "cohost") {
    if (s.cohostId && s.cohostId !== uid) return res.status(409).json({ error: "Co-host already claimed" });
    await db.collection("calendar_sessions").updateOne({ id: sessionId }, { $set: { cohostId: uid } });
  } else if (role === "trainer") {
    const cap = Number(s.maxTrainers ?? 4);
    const curr = new Set(s.trainerIds || []);
    if (curr.has(uid)) return res.json({ ok: true }); // already in
    if (curr.size >= cap) return res.status(409).json({ error: "Trainer slots full" });
    await db.collection("calendar_sessions").updateOne({ id: sessionId }, { $addToSet: { trainerIds: uid } });
  } else {
    return res.status(400).json({ error: "Invalid role" });
  }
  res.json({ ok: true });
});

// POST /sessions/unclaim { sessionId, role }
router.post("/unclaim", auth, async (req, res) => {
  const db = getDb();
  const { sessionId, role } = req.body;
  const uid = req.userId;

  const s = await db.collection("calendar_sessions").findOne({ id: sessionId });
  if (!s) return res.status(404).json({ error: "Session not found" });

  if (role === "host" && s.hostId === uid) {
    await db.collection("calendar_sessions").updateOne({ id: sessionId }, { $set: { hostId: null } });
  } else if (role === "cohost" && s.cohostId === uid) {
    await db.collection("calendar_sessions").updateOne({ id: sessionId }, { $set: { cohostId: null } });
  } else if (role === "trainer") {
    await db.collection("calendar_sessions").updateOne({ id: sessionId }, { $pull: { trainerIds: uid } });
  } else {
    return res.status(400).json({ error: "Nothing to unclaim" });
  }
  res.json({ ok: true });
});

export default router;
