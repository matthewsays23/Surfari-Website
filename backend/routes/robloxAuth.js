const router = require("express").Router();
const crypto = require("crypto");

// Node 18+ global fetch
function checkState(state) {
  const [hash, discordId] = String(state || "").split(".");
  if (!discordId) return null;
  const calc = crypto.createHash("sha256").update(discordId + process.env.STATE_SECRET).digest("hex");
  return hash === calc ? discordId : null;
}
function sign(body) {
  return crypto.createHmac("sha256", process.env.BOT_WEBHOOK_SECRET)
    .update(JSON.stringify(body)).digest("hex");
}

router.get("/auth/roblox", (req, res) => {
  const { state } = req.query;
  if (!state) return res.status(400).send("Missing state");

  res.cookie("r_state", state, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 10*60*1000 });

  const url = new URL("https://apis.roblox.com/oauth/v1/authorize"); // <-- fix domain + path
  url.searchParams.set("client_id", process.env.ROBLOX_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", process.env.ROBLOX_REDIRECT_URI); // EXACT match
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("state", state);
  // remove nonstandard params like "step"
  res.redirect(url.toString());
});


router.get("/auth/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const rawState = state || req.cookies?.r_state;
    const discordId = checkState(rawState);
    if (!code || !discordId) return res.status(400).send("Bad/missing code/state");

    const basic = Buffer.from(
      `${process.env.ROBLOX_CLIENT_ID}:${process.env.ROBLOX_CLIENT_SECRET}`
    ).toString("base64");

    const tokenRes = await fetch("https://apis.roblox.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.ROBLOX_REDIRECT_URI, // EXACT same string as above and in Creator Hub
      }),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Roblox token exchange failed:", tokenRes.status, tokenJson);
      return res.status(500).send("Token exchange failed");
    }

    const meRes = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const me = await meRes.json(); // includes OIDC claims: sub, name, picture (with `profile` scope)
    const robloxUserId = Number(me.sub || me.id);
    const robloxUsername = me.name || me.preferred_username || "RobloxUser";
    if (!robloxUserId) return res.status(500).send("Could not read Roblox profile");

    // Call the bot to sync
    const payload = {
      guildId: process.env.YOUR_DISCORD_GUILD_ID,
      discordId,
      robloxUserId,
      robloxUsername,
    };
    const sig = sign(payload);

    await fetch(`${process.env.BOT_URL}/syncMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Surfari-Signature": sig },
      body: JSON.stringify(payload),
    }).catch(() => {});

    res.clearCookie("r_state");
    res.send("✅ Verified! You can close this tab and check Discord for your roles.");
  } catch (e) {
    console.error(e);
    res.status(500).send("Verification failed");
  }
});

module.exports = router;
