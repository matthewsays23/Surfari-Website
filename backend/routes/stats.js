// backend/routes/stats.js
import express from "express";
import axios from "axios";
import { getDb } from "../db.js";

const router = express.Router();

// ======= Config =======
const QUOTA_MIN = Number(process.env.QUOTA_MIN ?? 30);        // minutes target
const WEEK_START = Number(process.env.WEEK_START ?? 1);       // 0=Sunday, 1=Monday
// If you want the week to respect a local timezone, set a fixed offset (minutes).
// e.g., -300 (UTC-5), -240 (UTC-4). Leave 0 to treat week in UTC.
const WEEK_TZ_OFFSET_MIN = Number(process.env.WEEK_TZ_OFFSET_MIN ?? 0);

// ======= DB helpers (lazy) =======
const db = () => getDb();
const live = () => db().collection("sessions_live");
const arc  = () => db().collection("sessions_archive");

// ======= Week window helper (consistent everywhere) =======
/**
 * Returns [weekStartUTC, nextWeekStartUTC] as Date objects.
 * Applies a fixed minute offset to emulate a "local" week if desired.
 */
function getWeekWindow(now = new Date()) {
  // shift "now" into local view
  const shifted = new Date(now.getTime() + WEEK_TZ_OFFSET_MIN * 60_000);

  // local midnight today
  const localMid = new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(), 0, 0, 0, 0
  ));
  const localDow = localMid.getUTCDay(); // 0..6
  const diff = (localDow - WEEK_START + 7) % 7;

  const localWeekStart = new Date(localMid);
  localWeekStart.setUTCDate(localWeekStart.getUTCDate() - diff);

  const localNextWeekStart = new Date(localWeekStart);
  localNextWeekStart.setUTCDate(localNextWeekStart.getUTCDate() + 7);

  // shift back to UTC
  const weekStartUTC = new Date(localWeekStart.getTime() - WEEK_TZ_OFFSET_MIN * 60_000);
  const nextWeekStartUTC = new Date(localNextWeekStart.getTime() - WEEK_TZ_OFFSET_MIN * 60_000);
  return [weekStartUTC, nextWeekStartUTC];
}

// ======= Optional: add live minutes on top of archived minutes =======
async function liveMinutesMap() {
  const rows = await live()
    .find({}, { projection: { userId: 1, startedAt: 1, lastHeartbeat: 1 } })
    .toArray();

  const now = Date.now();
  const m = new Map();
  for (const r of rows) {
    const startedAt = new Date(r.startedAt).getTime();
    const lastBeat = new Date(r.lastHeartbeat || r.startedAt).getTime();
    const elapsedMs = Math.max(0, Math.min(now - startedAt, now - lastBeat));
    const mins = Math.floor(elapsedMs / 60000);
    m.set(r.userId, (m.get(r.userId) || 0) + mins);
  }
  return m; // Map<userId, minutes>
}

// ======= SUMMARY =======
// GET /stats/summary -> { liveCount, todayMinutes, weekMinutes, quotaPct, quotaTarget, weekStart, nextWeekStart }
router.get("/summary", async (_req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight
  const [weekStart, nextWeekStart] = getWeekWindow(now);

  const [liveCount, todayAgg, weekAgg] = await Promise.all([
    live().estimatedDocumentCount(),
    arc().aggregate([
      { $match: { endedAt: { $gte: todayStart } } },
      { $group: { _id: null, minutes: { $sum: "$minutes" } } }
    ]).toArray(),
    arc().aggregate([
      { $match: { endedAt: { $gte: weekStart, $lt: nextWeekStart } } },
      { $group: { _id: null, minutes: { $sum: "$minutes" } } }
    ]).toArray(),
  ]);

  // Quota percentage this week (per unique user)
  const perUser = await arc().aggregate([
    { $match: { endedAt: { $gte: weekStart, $lt: nextWeekStart } } },
    { $group: { _id: "$userId", minutes: { $sum: "$minutes" } } },
    { $group: { _id: null,
      hit:   { $sum: { $cond: [{ $gte: ["$minutes", QUOTA_MIN] }, 1, 0] } },
      total: { $sum: 1 }
    } }
  ]).toArray();

  const todayMinutes = Math.round(todayAgg[0]?.minutes ?? 0);
  const weekMinutes  = Math.round(weekAgg[0]?.minutes ?? 0);
  const hit   = perUser[0]?.hit ?? 0;
  const total = perUser[0]?.total ?? 0;
  const quotaPct = total ? Math.round((hit / total) * 100) : 0;

  res.json({
    liveCount,
    todayMinutes,
    weekMinutes,
    quotaPct,
    quotaTarget: QUOTA_MIN,
    weekStart,
    nextWeekStart
  });
});

// ======= RECENT SESSIONS =======
// GET /stats/recent -> last 20 archived
router.get("/recent", async (_req, res) => {
  const rows = await arc()
    .find({}, { projection: { _id: 0, userId: 1, minutes: 1, startedAt: 1, endedAt: 1, lastHeartbeat: 1 } })
    .sort({ endedAt: -1 })
    .limit(20)
    .toArray();
  res.json(rows);
});

// ======= LEADERBOARD (THIS WEEK) =======
// GET /stats/leaderboard -> [{ userId, minutes }]
router.get("/leaderboard", async (_req, res) => {
  const [weekStart, nextWeekStart] = getWeekWindow();

  const rows = await arc().aggregate([
    { $match: { endedAt: { $gte: weekStart, $lt: nextWeekStart } } },
    { $group: { _id: "$userId", minutes: { $sum: "$minutes" } } },
    { $sort: { minutes: -1 } },
    { $limit: 10 }
  ]).toArray();

  res.json(rows.map(r => ({ userId: r._id, minutes: Math.round(r.minutes) })));
});

// ======= QUOTA SUMMARY (includes live minutes) =======
// GET /stats/quota/summary -> { weekStart, weekEnd, requiredMinutes, metCount, totalUsers, quotaPct }
router.get("/quota/summary", async (_req, res) => {
  const [weekStart, weekEnd] = getWeekWindow();

  const agg = await arc().aggregate([
    { $match: { endedAt: { $gte: weekStart, $lt: weekEnd } } },
    { $group: { _id: "$userId", minutes: { $sum: "$minutes" } } },
  ]).toArray();

  const liveMap = await liveMinutesMap();
  const perUser = agg.map(r => ({ userId: r._id, minutes: r.minutes + (liveMap.get(r._id) || 0) }));
  for (const [uid, mins] of liveMap) {
    if (!perUser.find(p => p.userId === uid)) perUser.push({ userId: uid, minutes: mins });
  }

  const totalUsers = perUser.length;
  const metCount = perUser.filter(p => p.minutes >= QUOTA_MIN).length;
  const quotaPct = totalUsers ? Math.round((metCount / totalUsers) * 100) : 0;

  res.json({
    weekStart, weekEnd,
    requiredMinutes: QUOTA_MIN,
    metCount, totalUsers, quotaPct
  });
});

// ======= QUOTA LIST (includes live minutes) =======
// GET /stats/quota/list -> [{ userId, minutes, remaining, met, username, displayName, thumb }]
router.get("/quota/list", async (_req, res) => {
  const [weekStart, weekEnd] = getWeekWindow();

  const agg = await arc().aggregate([
    { $match: { endedAt: { $gte: weekStart, $lt: weekEnd } } },
    { $group: { _id: "$userId", minutes: { $sum: "$minutes" } } },
  ]).toArray();

  const liveMap = await liveMinutesMap();
  const perUser = new Map();
  for (const r of agg) perUser.set(r._id, r.minutes);
  for (const [uid, mins] of liveMap) perUser.set(uid, (perUser.get(uid) || 0) + mins);

  const list = Array.from(perUser.entries()).map(([userId, minutes]) => ({
    userId,
    minutes: Math.round(minutes),
    remaining: Math.max(0, QUOTA_MIN - Math.round(minutes)),
    met: minutes >= QUOTA_MIN
  }));

  // Enrich via Roblox APIs
  const enriched = await Promise.all(list.map(async (row) => {
    try {
      const user = await axios.get(`https://users.roblox.com/v1/users/${row.userId}`);
      const t = await axios.get("https://thumbnails.roblox.com/v1/users/avatar-headshot", {
        params: { userIds: row.userId, size: "100x100", format: "Png", isCircular: "true" },
      });
      const img = t.data?.data?.[0]?.imageUrl || "";
      return {
        ...row,
        username: user.data?.name || `User_${row.userId}`,
        displayName: user.data?.displayName || user.data?.name || `User_${row.userId}`,
        thumb: img
      };
    } catch {
      return { ...row, username: `User_${row.userId}`, displayName: `User_${row.userId}`, thumb: "" };
    }
  }));

  enriched.sort((a, b) => {
    if (a.met !== b.met) return a.met ? 1 : -1;              // unmet first
    return a.met ? b.minutes - a.minutes : b.remaining - a.remaining;
  });

  res.json(enriched);
});

// ======= QUOTA USER (includes live minutes) =======
// GET /stats/quota/user/:userId
router.get("/quota/user/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!userId) return res.status(400).json({ error: "Invalid userId" });

  const [weekStart, weekEnd] = getWeekWindow();

  const agg = await arc().aggregate([
    { $match: { userId, endedAt: { $gte: weekStart, $lt: weekEnd } } },
    { $group: { _id: null, minutes: { $sum: "$minutes" } } },
  ]).toArray();

  const archived = Math.round(agg[0]?.minutes ?? 0);
  const liveMap = await liveMinutesMap();
  const total = archived + (liveMap.get(userId) || 0);

  res.json({
    userId,
    weekStart, weekEnd,
    minutes: total,
    remaining: Math.max(0, QUOTA_MIN - total),
    met: total >= QUOTA_MIN,
  });
});

// ======= PROGRESS DIRECTORY (THIS WEEK) =======
// GET /stats/progress?limit=25&page=1&search=yo
router.get("/progress", async (req, res) => {
  try {
    const [weekStart, nextWeekStart] = getWeekWindow();

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? "25", 10)));
    const page  = Math.max(1, parseInt(req.query.page ?? "1", 10));
    const search = String(req.query.search || "").trim().toLowerCase();

    const base = [
      { $match: { endedAt: { $gte: weekStart, $lt: nextWeekStart } } },
      { $group: { _id: "$userId", minutes: { $sum: "$minutes" } } },
    ];

    const [{ count: total } = { count: 0 }] = await arc().aggregate([
      ...base,
      { $count: "count" },
    ]).toArray();

    const rows = await arc().aggregate([
      ...base,
      { $sort: { minutes: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { _id: 0, userId: "$_id", minutes: 1 } },
    ]).toArray();

    const filtered = search
      ? rows.filter(r => String(r.userId).includes(search))
      : rows;

    res.json({
      rows: filtered.map(r => ({ userId: r.userId, minutes: Math.round(r.minutes || 0) })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      quotaTarget: QUOTA_MIN,
    });
  } catch (err) {
    console.error("/stats/progress error:", err);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
