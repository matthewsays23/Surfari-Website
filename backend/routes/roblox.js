import express from "express";
import axios from "axios";
const router = express.Router();

router.get("/thumbs", async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map(v => v.trim())
      .filter(Boolean);
    if (!ids.length) return res.json({ data: [] });

    const { data } = await axios.get("https://thumbnails.roblox.com/v1/users/avatar-headshot", {
      params: { userIds: ids.join(","), size: "150x150", format: "Png", isCircular: "false" },
    });
    res.json(data);
  } catch (e) {
    console.error("thumbs proxy error:", e.response?.data || e.message);
    res.status(500).json({ error: "Thumbs fetch failed" });
  }
});

// Batch users: /roblox/users?ids=1,2,3 -> [{id, name, displayName}]
router.get("/users", async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",").map(v => v.trim()).filter(Boolean);
    if (!ids.length) return res.json([]);

    const out = await Promise.all(ids.map(async (id) => {
      try {
        const { data } = await axios.get(`https://users.roblox.com/v1/users/${id}`);
        return { id: Number(id), name: data?.name, displayName: data?.displayName || data?.name };
      } catch {
        return { id: Number(id), name: `User_${id}`, displayName: `User_${id}` };
      }
    }));
    res.json(out);
  } catch (e) {
    console.error("users proxy error:", e.response?.data || e.message);
    res.status(500).json({ error: "Users fetch failed" });
  }
});


export default router;