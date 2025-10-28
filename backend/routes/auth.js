// backend/routes/auth.js
import express from "express";
import axios from "axios";
import crypto from "crypto";
import cookieParser from "cookie-parser"; // <-- needed to read req.cookies
import { getDb } from "../db.js";

const router = express.Router();
router.use(cookieParser()); // enable cookies for this router

// ----- ENV -----
const SURFARI_GROUP_ID = parseInt(process.env.SURFARI_GROUP_ID || "0", 10);
const BOT_URL          = process.env.BOT_URL; // e.g. https://surfari-assistant.onrender.com
const WEBHOOK_SECRET   = process.env.SURFARI_WEBHOOK_SECRET || ""; // optional
const STATE_SECRET     = process.env.STATE_SECRET;

const ROBLOX_CLIENT_ID     = process.env.ROBLOX_CLIENT_ID;
const ROBLOX_CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const ROBLOX_REDIRECT_URI  = process.env.ROBLOX_REDIRECT_URI; // EXACTLY: https://surfari.onrender.com/auth/callback

// ----- sanity checks (print once) -----
console.log("AUTH ENV:", {
  haveState: !!STATE_SECRET,
  haveWebhookSecret: !!WEBHOOK_SECRET,
  haveBotUrl: !!BOT_URL,
  groupId: SURFARI_GROUP_ID,
  clientIdPrefix: (ROBLOX_CLIENT_ID || "").slice(0, 6),
  redirectUri: ROBLOX_REDIRECT_URI,
});

// ----- helpers -----
function hmacBase64(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64");
}

// Sign payload for bot verification header
function signForBot(body) {
  if (!WEBHOOK_SECRET) return "";
  return hmacBase64(WEBHOOK_SECRET, JSON.stringify(body));
}

// Parse & validate `state` produced by your Discord bot button
function parseState(state) {
  if (!state || !STATE_SECRET) return null;
  const [payload, sig] = String(state).split(".");
  const calc = crypto.createHmac("sha256", STATE_SECRET).update(payload).digest("base64url");
  if (sig !== calc) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // Expected shape: { d: "<discordId>", g: "<guildId>", t: <expiryMs>, v: 1 }
    if (!obj?.d || !obj?.g) return null;
    if (obj?.t && Date.now() > obj.t) return null;
    return obj;
  } catch {
    return null;
  }
}

// ================== Roblox Login Start ==================
router.get("/roblox", (req, res) => {
  try {
    const { state } = req.query;
    if (!state) return res.status(400).send("Missing state");
    if (!ROBLOX_CLIENT_ID || !ROBLOX_REDIRECT_URI) {
      console.error("Missing ROBLOX_CLIENT_ID or ROBLOX_REDIRECT_URI");
      return res.status(500).send("Server misconfigured");
    }

    // Save state for callback validation
    res.cookie("rs", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 10 * 60 * 1000,
    });

    const scope = "openid profile";
    const url = `https://apis.roblox.com/oauth/v1/authorize`
      + `?client_id=${encodeURIComponent(ROBLOX_CLIENT_ID)}`
      + `&response_type=code`
      + `&redirect_uri=${encodeURIComponent(ROBLOX_REDIRECT_URI)}`
      + `&scope=${encodeURIComponent(scope)}`
      + `&state=${encodeURIComponent(state)}`;

    // debug
    console.log("Authorize URL ->", {
      clientIdPrefix: ROBLOX_CLIENT_ID.slice(0, 6),
      redirectUri: ROBLOX_REDIRECT_URI,
      statePreview: String(state).slice(0, 12) + "...",
    });

    return res.redirect(url);
  } catch (e) {
    console.error("Authorize redirect error:", e);
    return res.status(500).send("Authorize failed");
  }
});

// ================== OAuth Callback ==================
router.get("/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const rawState = req.cookies?.rs;
    if (!code) return res.status(400).send("Missing code");

    const st = parseState(rawState);
    if (!st?.d || !st?.g) return res.status(400).send("Invalid or missing state");

    if (!ROBLOX_CLIENT_ID || !ROBLOX_CLIENT_SECRET || !ROBLOX_REDIRECT_URI) {
      console.error("Missing Roblox OAuth env");
      return res.status(500).send("Server misconfigured");
    }

    // Exchange code -> token (HTTP Basic)
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
          "Authorization": `Basic ${basic}`,
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

    const me = meResp.data; // { sub, name, preferred_username, picture? }
    const robloxUserId = Number(me.sub);
    const robloxUsername = me.name || me.preferred_username || `Roblox_${me.sub}`;

    // Fetch Surfari group role/rank
    let roleRank = 0, roleName = "Guest";
    if (SURFARI_GROUP_ID > 0) {
      const rolesResp = await axios.get(
        `https://groups.roblox.com/v2/users/${robloxUserId}/groups/roles`,
        { validateStatus: () => true }
      );
      if (rolesResp.status === 200) {
        const entries = rolesResp.data?.data || [];
        const surfariGroup = entries.find((g) => g.group?.id === SURFARI_GROUP_ID);
        roleRank = surfariGroup?.role?.rank ?? 0;
        roleName = surfariGroup?.role?.name ?? "Guest";
      } else {
        console.warn("GROUP ROLES WARN:", rolesResp.status, rolesResp.data);
      }
    }

    // Persist link
    const db = getDb();
    await db.collection("links").updateOne(
      { discordId: st.d, guildId: st.g },
      {
        $set: {
          discordId: st.d,
          guildId: st.g,
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

    // Notify bot (optional HMAC)
    if (BOT_URL) {
      const body = {
        state: rawState, // bot will validate this with STATE_SECRET too
        robloxId: robloxUserId,
        username: robloxUsername,
        displayName: robloxUsername,
        roles: [{ groupId: SURFARI_GROUP_ID, roleId: roleRank, roleName }],
      };
      const sig = WEBHOOK_SECRET ? signForBot(body) : "";

      try {
        await axios.post(`${BOT_URL}/api/discord/verify`, body, {
          headers: sig ? { "x-surfari-signature": sig } : {},
          timeout: 8000,
        });
      } catch (e) {
        console.warn("Bot sync warning:", e.response?.status, e.response?.data || e.message);
        // non-fatal: user is still linked; bot can resync later
      }
    } else {
      console.warn("BOT_URL not set: skipping role sync call");
    }

    res.clearCookie("rs");

    // Friendly success page
    return res.send(`
      <html><body style="text-align:center;padding-top:20vh;font-family:sans-serif;">
      <h1>✅ Verified!</h1>
      <p>You may now close this tab and return to Discord.</p>
      </body></html>
    `);
  } catch (err) {
    console.error("Auth callback error:", err.response?.data || err);
    return res.status(500).send("OAuth callback failed");
  }
});

export default router;
