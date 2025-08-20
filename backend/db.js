import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");

let client;
let db;

// Initialize the connection once (called from server.js)
export async function initDb() {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db("surfari");

  // Create indexes
  await db.collection("sessions_live").createIndex({ userId: 1, serverId: 1 }, { unique: true });
  await db.collection("sessions_live").createIndex({ lastHeartbeat: 1 });
  await db.collection("sessions_archive").createIndex({ userId: 1, endedAt: -1 });
  await db.collection("calendar_sessions").createIndex({ start: 1 }, { unique: true, sparse: false });

  return db;
}

// Retrieve the already-connected DB anywhere else
export function getDb() {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  return db;
}
