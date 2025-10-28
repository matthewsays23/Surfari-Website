// backend/routes/auth.js
import express from "express";
import axios from "axios";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import { getDb } from "../db.js";

const router = express.Router();
router.use(cookieParser());

// ENV (consistent names)
const SURFARI_GROUP_ID     = parseInt(process.env.SURFARI_GROUP_ID || "0", 10);
const BOT_URL              = process.env.BOT_URL;
const WEBHOOK_SECRET       = process.env.SURFARI_WEBHOOK_SECRET || "";
const STATE_SECRET         = process.env.STATE_SECRET;
const ROBLOX_CLIENT_ID     = process.env.ROBLOX_CLIENT_ID;
const ROBLOX_CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const ROBLOX_REDIRECT_URI  = process.env.ROBLOX_REDIRECT_URI; // EXACT: https://surfari.onrender.com/auth/callback
const FALLBACK_GUILD_ID    = process.env.GUILD_ID;            // used if old state has no guild

// --- accept both state formats ---
function parseStateFlexible(state) {
  if (!state || !STATE_SECRET) return null;
  const parts = String(state).split(".");

  // NEW: "<payloadB64url>.<sigB64url>", payload = { d, g, t, v }
  if (parts.length === 2) {
    const [payloadB64, sigB64] = parts;
    const calc = crypto.createHmac("sha256", STATE_SECRET).update(payloadB64).digest("base64url");
    if (calc !== sigB64) return null;
    try {
      const obj = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      if (!obj?.d) return null;
      if (obj?.t && Date.now() > obj.t) return null;
      return { d: obj.d, g: obj.g, t: obj.t, v: obj.v ?? 2 };
    } catch { return null; }
  }

  // OLD: "hashHex.discordId.ts"
  if (parts.length === 3) {
    const [hashHex, discordId, tsStr] = parts;
    const body  = `${discordId}.${tsStr}`;
    const calcH = crypto.createHmac("sha256", STATE_SECRET).update(body).digest("hex");
    if (calcH !== hashHex) return null;
    const ts = Number(tsStr);
    if (Number.isFinite(ts) && Date.now() - ts > 10 * 60 * 1000) return null;
    return { d: discordId, t: ts, v: 1 }; // no guild → use fallback
  }
  return null;
}

// HMAC header for bot webhook (optional but recommended)
function signForBot(body) {
  if (!WEBHOOK_SECRET) return "";
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(body)).digest("base64");
}

// --- /roblox: set cookie + forward state to Roblox ---
router.get("/roblox", (req, res) => {
  const { state } = req.query;
  if (!state) return res.status(400).send("Missing state");

  if (!ROBLOX_CLIENT_ID || !ROBLOX_REDIRECT_URI) {
    console.error("Missing ROBLOX_CLIENT_ID or ROBLOX_REDIRECT_URI");
    return res.status(500).send("Server misconfigured");
  }

  res.cookie("rs", state, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 10 * 60 * 1000 });

  const scope = "openid profile";
  const url =
    `https://apis.roblox.com/oauth/v1/authorize` +
    `?client_id=${encodeURIComponent(ROBLOX_CLIENT_ID)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(ROBLOX_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  console.log("Authorize URL ->", {
    clientIdPrefix: ROBLOX_CLIENT_ID.slice(0, 6),
    redirectUri: ROBLOX_REDIRECT_URI,
    statePreview: String(state).slice(0, 12) + "...",
  });

  res.redirect(url);
});

// --- /callback: exchange token, read user, save link, notify bot ---
router.get("/callback", async (req, res) => {
  try {
    const { code }   = req.query;
    const rawState   = req.cookies?.rs;
    if (!code) return res.status(400).send("Missing code");

    const st = parseStateFlexible(rawState);
    const guildId = st?.g || FALLBACK_GUILD_ID; // fallback for old state
    if (!st?.d)       return res.status(400).send("Invalid or missing state");
    if (!guildId)     return res.status(400).send("Missing guild context");

    // Token exchange (HTTP Basic)
    const basic = Buffer.from(`${ROBLOX_CLIENT_ID}:${ROBLOX_CLIENT_SECRET}`).toString("base64");
    const tokenResp = await axios.post(
      "https://apis.roblox.com/oauth/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: ROBLOX_REDIRECT_URI, // consistent name
      }),
      {
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        validateStatus: () => true,
      }
    );
    if (tokenResp.status !== 200) {
      console.error("TOKEN ERROR:", tokenResp.status, tokenResp.data);
      return res.status(500).send("Token exchange failed");
    }
    const { access_token } = tokenResp.data;

    // Userinfo
    const meResp = await axios.get("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
      validateStatus: () => true,
    });
    if (meResp.status !== 200) {
      console.error("USERINFO ERROR:", meResp.status, meResp.data);
      return res.status(500).send("User info failed");
    }
    const me = meResp.data;
    const robloxUserId  = Number(me.sub);
    const robloxUsername= me.name || me.preferred_username || `Roblox_${me.sub}`;

    // Group role
    let roleRank = 0, roleName = "Guest";
    if (SURFARI_GROUP_ID > 0) {
      const rolesResp = await axios.get(
        `https://groups.roblox.com/v2/users/${robloxUserId}/groups/roles`,
        { validateStatus: () => true }
      );
      const entries = rolesResp.status === 200 ? (rolesResp.data?.data || []) : [];
      const sg = entries.find(g => g.group?.id === SURFARI_GROUP_ID);
      roleRank = sg?.role?.rank ?? 0;
      roleName = sg?.role?.name ?? "Guest";
    }

    // Persist link
    const db = getDb();
    await db.collection("links").updateOne(
      { discordId: st.d, guildId },
      {
        $set: {
          discordId: st.d,
          guildId,
          robloxUserId,
          robloxUsername,
          roleRank,
          roleName,
          verifiedAt: new Date(),
          lastSyncAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Notify bot
    if (BOT_URL) {
      const payload = {
        state: rawState, // bot parses/validates too
        robloxId: robloxUserId,
        username: robloxUsername,
        displayName: robloxUsername,
        roles: [{ groupId: SURFARI_GROUP_ID, roleId: roleRank, roleName }],
      };
      const sig = signForBot(payload);
      try {
        await axios.post(`${BOT_URL}/api/discord/verify`, payload, {
          headers: sig ? { "x-surfari-signature": sig } : {},
          timeout: 8000,
        });
      } catch (e) {
        console.warn("Bot sync warning:", e.response?.status, e.response?.data || e.message);
      }
    }

    res.clearCookie("rs");
    res.send(`<html><body style="text-align:center;padding-top:20vh;font-family:sans-serif;">
      <h1>✅ Verified!</h1><p>You may now close this tab and return to Discord.</p></body></html>`);
  } catch (err) {
    console.error("Auth callback error:", err.response?.data || err);
    res.status(500).send("OAuth callback failed");
  }
});

export default router;
