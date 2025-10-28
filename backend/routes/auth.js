import express from "express";
import axios from "axios";
import crypto from "crypto";
import { getDb } from "../db.js";

const router = express.Router();

const SURFARI_GROUP_ID = parseInt(process.env.SURFARI_GROUP_ID, 10);
const BOT_URL = process.env.BOT_URL; // e.g. https://surfari-assistant.onrender.com
const WEBHOOK_SECRET = process.env.SURFARI_WEBHOOK_SECRET;
const STATE_SECRET = process.env.STATE_SECRET;
const CLIENT_ID = process.env.CLIENT_ID;

// Sign payload for bot verification
function sign(body) {
  return crypto.createHmac("sha256", WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest("base64");
}

// ✅ Parse & check `state` from Discord
function parseState(state) {
  const [payload, sig] = String(state).split(".");
  const calc = crypto.createHmac("sha256", STATE_SECRET)
    .update(payload)
    .digest("base64url");
  if (sig !== calc) return null;
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

// ============ Roblox Login Start ============
router.get("/roblox", (req, res) => {
  const { state } = req.query;
  if (!state) return res.status(400).send("Missing state");

  // store state in secure cookie to validate later
  res.cookie("rs", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 10 * 60 * 1000,
  });

  const scope = "openid profile";
  const url = `https://apis.roblox.com/oauth/v1/authorize`
    + `?client_id=${CLIENT_ID}`
    + `&response_type=code`
    + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
    + `&scope=${encodeURIComponent(scope)}`
    + `&state=${encodeURIComponent(state)}`; // ✅ send it to Roblox too

  res.redirect(url);
});

// ============ OAuth Callback ============
router.get("/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const rawState = req.cookies?.rs;
    const st = parseState(rawState);
    if (!st?.d || !st?.g) return res.status(400).send("Invalid or missing state");

    // Exchange code → token
    const basic = Buffer.from(
      `${process.env.ROBLOX_CLIENT_ID}:${process.env.ROBLOX_CLIENT_SECRET}`
    ).toString("base64");

    const tokenResp = await axios.post(
      "https://apis.roblox.com/oauth/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.ROBLOX_REDIRECT_URI,
      }),
      { headers: { "Authorization": `Basic ${basic}` } }
    );
    const { access_token } = tokenResp.data;

    // Roblox user profile
    const me = (await axios.get("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    })).data;

    const robloxUserId = Number(me.sub);
    const robloxUsername = me.name;

    // Fetch Surfari group role
    const rolesResp = await axios.get(
      `https://groups.roblox.com/v2/users/${robloxUserId}/groups/roles`
    );
    const entries = rolesResp.data?.data || [];
    const surfariGroup = entries.find((g) => g.group?.id === SURFARI_GROUP_ID);
    const roleRank = surfariGroup?.role?.rank ?? 0;
    const roleName = surfariGroup?.role?.name ?? "Guest";

    // Persist link
    const db = getDb();
    await db.collection("links").updateOne(
      { discordId: st.d },
      {
        $set: {
          discordId: st.d,
          robloxUserId,
          robloxUsername,
          roleRank,
          roleName,
          verifiedAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Notify bot
    const body = {
      state: rawState,
      robloxId: robloxUserId,
      username: robloxUsername,
      displayName: robloxUsername,
      roles: [{ groupId: SURFARI_GROUP_ID, roleId: roleRank, roleName }],
    };
    const sig = Webhook_SECRET ? sign(body) : "";

    await axios.post(`${BOT_URL}/api/discord/verify`, body, {
      headers: sig ? { "x-surfari-signature": sig } : {},
    }).catch(() => {});

    res.clearCookie("rs");

    // ✅ Friendly success page
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
