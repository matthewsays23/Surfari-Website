import express from "express";
import axios from "axios";
import { getDb } from "../db.js";

const router = express.Router();

const GROUP_ID = parseInt(process.env.SURFARI_GROUP_ID, 10);
const ADMIN_ROLE_IDS = (process.env.SURFARI_ADMIN_ROLES || "")
  .split(",").map(v => parseInt(v.trim(), 10)).filter(Boolean);

const CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const REDIRECT_URI = process.env.ROBLOX_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// --- Login redirect ---
router.get("/roblox", (_req, res) => {
  const scope = "openid profile";
  const url = `https://apis.roblox.com/oauth/v1/authorize?client_id=${CLIENT_ID}`
    + `&response_type=code`
    + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
    + `&scope=${encodeURIComponent(scope)}`;
  res.redirect(url);
});

// --- OAuth callback ---
router.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: "Missing code" });

  try {
    const tokenResp = await axios.post(
      "https://apis.roblox.com/oauth/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const { access_token } = tokenResp.data;

    const userInfo = await axios.get("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const robloxUser = userInfo.data; // { sub: <userId> }
    const token = `token-${robloxUser.sub}-${Date.now()}`;

    // 👉 get DB *now*, inside the handler
    const db = getDb();
await db.collection("sessions").insertOne({ token, userId: robloxUser.sub, createdAt: new Date() });

    res.redirect(`${FRONTEND_URL}/auth/success?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error("OAuth callback error:", err.response?.data || err.message);
    res.status(500).json({ error: "OAuth callback failed" });
  }
});

// --- Verify (used by AccessGate) ---
router.get("/verify", async (req, res) => {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.split(" ")[1] : null;
    if (!token) return res.status(401).json({ error: "Missing token" });

    const db = getDb();
    const session = await db.collection("sessions").findOne({ token });
    const userId = session?.userId;
    if (!userId) return res.status(403).json({ error: "Invalid token" });

    const groupResp = await axios.get(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    const entries = groupResp.data?.data || [];
    const surfariGroup = entries.find(g => g.group?.id === GROUP_ID);
    const rank = surfariGroup?.role?.rank || 0;

    if (!surfariGroup || (ADMIN_ROLE_IDS.length && !ADMIN_ROLE_IDS.includes(rank))) {
      return res.status(403).json({ error: "User not an admin" });
    }

    const profile = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
    res.json({
      status: "Access granted",
      userId,
      username: profile.data?.name,
      displayName: profile.data?.displayName,
      roleName: surfariGroup?.role?.name || "Member",
      roleRank: rank,
    });
  } catch (err) {
    console.error("Verify error:", err.response?.data || err.message);
    res.status(500).json({ error: "Verification failed" });
  }
});

// --- Team list ---
async function getGroupRole(userId) {
  try {
    const { data } = await axios.get(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    const match = (data.data || []).find(g => g.group?.id === GROUP_ID);
    if (!match) return { roleName: "Not in group", roleRank: 0 };
    return { roleName: match.role?.name ?? "Member", roleRank: match.role?.rank ?? 0 };
  } catch (err) {
    console.error(`getGroupRole error for ${userId}:`, err.response?.data || err.message);
    return { roleName: "Unknown", roleRank: -1 };
  }
}

router.get("/team", async (_req, res) => {
  try {
    const ADMIN_USER_IDS = (process.env.SURFARI_ADMIN_USER_IDS || "")
      .split(",").map(v => parseInt(v.trim(), 10)).filter(Boolean);
    if (!ADMIN_USER_IDS.length) return res.json([]);

    const rows = await Promise.all(
      ADMIN_USER_IDS.map(async (id) => {
        const { data } = await axios.get(`https://users.roblox.com/v1/users/${id}`);
        const role = await getGroupRole(id);
        return {
          userId: id,
          username: data?.name || `User_${id}`,
          displayName: data?.displayName || data?.name || `User_${id}`,
          roleName: role.roleName,
          roleRank: role.roleRank,
        };
      })
    );

    rows.sort((a, b) => (b.roleRank ?? 0) - (a.roleRank ?? 0));
    res.json(rows);
  } catch (err) {
    console.error("Team list error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to load team" });
  }
});

export default router;
