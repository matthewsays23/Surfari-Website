// backend/routes/ingest.js
import express from "express";
import { getDb } from "../db.js";

const router = express.Router();

// simple shared secret so only your game can post
const GAME_KEY = process.env.GAME_INGEST_KEY;
if (!GAME_KEY) console.warn("[ingest] WARNING: missing GAME_INGEST_KEY env");

// Helpers — always get db lazily
const live  = () => getDb().collection("sessions_live");
const arch  = () => getDb().collection("sessions_archive");

// Validate header + payload
function validate(req, fields = []) {
  const key = req.get("X-Game-Key");
  if (!key || key !== GAME_KEY) return { status: 401, msg: "Unauthorized" };

  for (const f of fields) {
    if (req.body?.[f] === undefined || req.body?.[f] === null) {
      return { status: 400, msg: `Missing ${f}` };
    }
  }
  return null;
}

// POST /ingest/session/start
router.post("/session/start", async (req, res) => {
  const err = validate(req, ["userId", "serverId", "placeId"]);
  if (err) return res.status(err.status).json({ error: err.msg });

  const { userId, serverId, placeId } = req.body;
  const now = new Date();

  await live().updateOne(
    { userId, serverId },
    { $set: { userId, serverId, placeId, startedAt: now, lastHeartbeat: now } },
    { upsert: true }
  );

  res.json({ ok: true });
});

// POST /ingest/session/heartbeat
router.post("/session/heartbeat", async (req, res) => {
  const err = validate(req, ["userId", "serverId"]);
  if (err) return res.status(err.status).json({ error: err.msg });

  const { userId, serverId } = req.body;
  await live().updateOne(
    { userId, serverId },
    { $set: { lastHeartbeat: new Date() } }
  );
  res.json({ ok: true });
});

// POST /ingest/session/end
router.post("/session/end", async (req, res) => {
  const err = validate(req, ["userId", "serverId"]);
  if (err) return res.status(err.status).json({ error: err.msg });

  const { userId, serverId } = req.body;

  const doc = await live().findOne({ userId, serverId });
  if (!doc) {
    // nothing live — just succeed so your game isn’t noisy
    return res.json({ ok: true, archived: false });
  }

  const now = new Date();
  const ms = (now - (doc.startedAt ?? now)) || 0;
  const minutes = Math.max(0, Math.round(ms / 60000));

  await arch().insertOne({
    userId,
    serverId,
    placeId: doc.placeId,
    startedAt: doc.startedAt,
    lastHeartbeat: doc.lastHeartbeat,
    endedAt: now,
    minutes,
  });

  await live().deleteOne({ _id: doc._id });

  res.json({ ok: true, archived: true, minutes });
});

export default router;
