import express from "express";
import axios from "axios";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import { getDb } from "../db.js";

const router = express.Router();
router.use(cookieParser());

// ===== ENV =====
const SURFARI_GROUP_ID     = parseInt(process.env.SURFARI_GROUP_ID || "0", 10);
const BOT_URL              = process.env.BOT_URL; // e.g. https://surfari-assistant.onrender.com
const WEBHOOK_SECRET       = process.env.SURFARI_WEBHOOK_SECRET || "";
const STATE_SECRET         = process.env.STATE_SECRET;

const ROBLOX_CLIENT_ID     = process.env.ROBLOX_CLIENT_ID;
const ROBLOX_CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const ROBLOX_REDIRECT_URI  = process.env.ROBLOX_REDIRECT_URI; // EXACT: https://surfari.onrender.com/auth/callback

const FRONTEND_URL         = process.env.FRONTEND_URL || "http://localhost:5173";
const FALLBACK_GUILD_ID    = process.env.GUILD_ID; // used when old state format has no guild

// ===== helpers =====
function signForBot(body) {
  if (!WEBHOOK_SECRET) return "";
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(body)).digest("base64");
}

// Accept BOTH state formats
function parseStateFlexible(state) {
  if (!state || !STATE_SECRET) return null;
  const parts = String(state).split(".");

  // NEW: "<payloadB64>.<sigB64>", payload = { d, g, t, v }
  if (parts.length === 2) {
    const [payloadB64, sigB64] = parts;
    const calc = crypto.createHmac("sha256", STATE_SECRET).update(payloadB64).digest("base64url");
    if (calc !== sigB64) return null;
    try {
      const obj = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      if (!obj?.d) return null;
      if (obj?.t && Date.now() > obj.t) return null; // TTL
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
    return { d: discordId, t: ts, v: 1 }; // no guild → fallback later
  }

  return null;
}

// ===== /roblox: supports both flows =====
// - With ?state=...  => Discord verification (store cookie + forward state)
// - Without state    => Plain website login (no cookie)
router.get("/roblox", (req, res) => {
  const { state } = req.query;

  if (!ROBLOX_CLIENT_ID || !ROBLOX_REDIRECT_URI) {
    console.error("Missing ROBLOX_CLIENT_ID or ROBLOX_REDIRECT_URI");
    return res.status(500).send("Server misconfigured");
  }

  if (state) {
    // Discord verification mode
    res.cookie("rs", state, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 10 * 60 * 1000 });
  } else {
    // Site login mode: ensure no stale cookie gets used accidentally
    res.clearCookie("rs");
  }

  const scope = "openid profile";
  const url =
    `https://apis.roblox.com/oauth/v1/authorize` +
    `?client_id=${encodeURIComponent(ROBLOX_CLIENT_ID)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(ROBLOX_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scope)}` +
    (state ? `&state=${encodeURIComponent(state)}` : "");

  console.log("Authorize URL ->", {
    clientIdPrefix: ROBLOX_CLIENT_ID.slice(0, 6),
    redirectUri: ROBLOX_REDIRECT_URI,
    mode: state ? "discord-verify" : "site-login",
    statePreview: state ? String(state).slice(0, 12) + "..." : null,
  });

  res.redirect(url);
});

// ===== /callback: branches by whether a state cookie exists =====
router.get("/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing code");

    // Exchange code -> tokens (HTTP Basic)
    const basic = Buffer.from(`${ROBLOX_CLIENT_ID}:${ROBLOX_CLIENT_SECRET}`).toString("base64");
    const tokenResp = await axios.post(
      "https://apis.roblox.com/oauth/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: ROBLOX_REDIRECT_URI,
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

    // Roblox user profile (OIDC)
    const meResp = await axios.get("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
      validateStatus: () => true,
    });
    if (meResp.status !== 200) {
      console.error("USERINFO ERROR:", meResp.status, meResp.data);
      return res.status(500).send("User info failed");
    }
    const me = meResp.data;
    const robloxUserId   = Number(me.sub);
    const robloxUsername = me.name || me.preferred_username || `Roblox_${me.sub}`;

    // Decide mode by cookie presence
    const rawState = req.cookies?.rs;

    if (!rawState) {
      // ===== Site login branch (no Discord state) =====
      const db = getDb();
      const token = `token-${robloxUserId}-${Date.now()}`;
      await db.collection("sessions").insertOne({
        token,
        userId: robloxUserId,
        username: robloxUsername,
        createdAt: new Date(),
      });

      // Normal app flow: go back to your frontend
      res.redirect(`${FRONTEND_URL}/auth/success?token=${encodeURIComponent(token)}`);
      return;
    }

    // ===== Discord verification branch (state present) =====
    const st = parseStateFlexible(rawState);
    const guildId = st?.g || FALLBACK_GUILD_ID;
    if (!st?.d) return res.status(400).send("Invalid or missing state");
    if (!guildId) return res.status(400).send("Missing guild context");

    // Get group role for mapping/nickname
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

    // Notify bot to sync roles (optional signature)
    if (BOT_URL) {
      const payload = {
        state: rawState, // bot verifies too
        robloxId: robloxUserId,
        username: robloxUsername,
        displayName: robloxUsername,
        roles: [{ groupId: SURFARI_GROUP_ID, roleId: roleRank, roleName }],
      };
      const sig = signForBot(payload);

      try {
        await axios.post(`${BOT_URL.replace(/\/+$/,'')}/api/discord/verify`, payload, {
          headers: sig ? { "x-surfari-signature": sig } : {},
          timeout: 8000,
        });
      } catch (e) {
        console.warn("Bot sync warning:", e.response?.status, e.response?.data || e.message);
      }
    }

    res.clearCookie("rs");
const returnTo = encodeURIComponent("https://discord.com/app"); // or a specific channel jump link
res.redirect(`${FRONTEND_URL}/verify/complete?mode=discord&autoCloseMs=0&returnTo=${returnTo}`);
  } catch (err) {
    console.error("Auth callback error:", err.response?.data || err);
    res.status(500).send("OAuth callback failed");
  }
});

router.get("/verify", async (req, res) => {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.split(" ")[1] : null;
    if (!token) return res.status(401).json({ error: "missing_token" });

    const db = getDb();
    const session = await db.collection("sessions").findOne({ token });
    const userId = session?.userId;
    if (!userId) return res.status(403).json({ error: "invalid_token" });

    // ENV
    const GROUP_ID = parseInt(process.env.SURFARI_GROUP_ID || "0", 10);
    const ADMIN_RANKS = (process.env.SURFARI_ADMIN_ROLES || "")
      .split(",")
      .map(v => parseInt(v.trim(), 10))
      .filter(n => Number.isFinite(n));
    const ADMIN_USER_IDS = (process.env.SURFARI_ADMIN_USER_IDS || "")
      .split(",")
      .map(v => parseInt(v.trim(), 10))
      .filter(n => Number.isFinite(n));

    if (!GROUP_ID) {
      console.error("VERIFY MISCONFIG: SURFARI_GROUP_ID not set");
      return res.status(500).json({ error: "server_misconfigured" });
    }

    // Fetch profile + group roles
    const [profileRes, groupsRes] = await Promise.all([
      axios.get(`https://users.roblox.com/v1/users/${userId}`, { validateStatus: () => true }),
      axios.get(`https://groups.roblox.com/v2/users/${userId}/groups/roles`, { validateStatus: () => true }),
    ]);

    if (profileRes.status !== 200) {
      console.error("VERIFY PROFILE ERROR:", profileRes.status, profileRes.data);
      return res.status(502).json({ error: "roblox_profile_failed" });
    }
    if (groupsRes.status !== 200) {
      console.error("VERIFY GROUPS ERROR:", groupsRes.status, groupsRes.data);
      return res.status(502).json({ error: "roblox_groups_failed" });
    }

    const entries = Array.isArray(groupsRes.data?.data) ? groupsRes.data.data : [];
    const surfari = entries.find(g => g.group?.id === GROUP_ID);
    const roleRank = surfari?.role?.rank ?? 0;
    const roleName = surfari?.role?.name ?? "Guest";
    const isInGroup = Boolean(surfari);

    // Admin checks
    const isAdminByRank = ADMIN_RANKS.length ? ADMIN_RANKS.includes(roleRank) : false;
    const isAdminByUser = ADMIN_USER_IDS.length ? ADMIN_USER_IDS.includes(userId) : false;
    const isAdmin = (isInGroup && isAdminByRank) || isAdminByUser;

    // Helpful server-side log
    console.log("VERIFY DEBUG", {
      userId,
      username: profileRes.data?.name,
      displayName: profileRes.data?.displayName || profileRes.data?.name,
      groupId: GROUP_ID,
      isInGroup,
      roleRank,
      roleName,
      ADMIN_RANKS,
      isAdminByRank,
      isAdminByUser,
      isAdmin,
    });

    if (!isInGroup) {
      return res.status(403).json({ error: "not_in_group", roleRank, roleName });
    }
    if (!isAdmin) {
      return res.status(403).json({ error: "not_admin", roleRank, roleName });
    }

    // Success payload (you can add more fields if your UI wants them)
    return res.json({
      status: "ok",
      userId,
      username: profileRes.data?.name,
      displayName: profileRes.data?.displayName || profileRes.data?.name,
      roleName,
      roleRank,
      isAdmin: true,
    });
  } catch (err) {
    console.error("Verify error:", err.response?.data || err.message);
    res.status(500).json({ error: "verification_failed" });
  }
});

export default router;
