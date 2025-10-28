import express from "express";
import cors from "cors";
import { initDb } from "./db.js";
import authRoutes from "./routes/auth.js";
import robloxRoutes from "./routes/roblox.js";
import statsRoutes from "./routes/stats.js";
import ingestRoutes from "./routes/ingest.js";
import cookieParser from "cookie-parser";
import session from "express-session"; // or your auth/session lib
import discordOAuthRoutes from './routes/discordOAuth.js';
import sessionsRoutes, { ensureSessionIndexes } from "./routes/sessions.js";

const app = express();

await initDb(); // ✅ connect before mounting routes

const ALLOW_ORIGINS = ["https://surfari.io", "http://localhost:5173"];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOW_ORIGINS.includes(origin)),
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/roblox", robloxRoutes);
app.use("/stats", statsRoutes);
app.use("/ingest", ingestRoutes);  
await ensureSessionIndexes();
app.use("/sessions", sessionsRoutes);
app.use("/", require("./routes/robloxAuth"));
app.use('/api', discordOAuth);

app.get("/", (_req, res) => res.send("Surfari Website Backend · OK"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on :${PORT}`));
