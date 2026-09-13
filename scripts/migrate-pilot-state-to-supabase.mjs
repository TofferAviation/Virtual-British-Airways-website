import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const databaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;

if (!databaseUrl || !serviceKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local before importing pilot state.");
}

const sourcePath = path.join(process.cwd(), ".bav-data", "pilots.json");
const raw = await readFile(sourcePath, "utf8").catch(() => null);
if (!raw) throw new Error(`No local pilot state was found at ${sourcePath}. Nothing was imported.`);

const parsed = JSON.parse(raw);
if (!Array.isArray(parsed?.pilots)) throw new Error("The local pilot-state file is not valid.");

const client = createClient(databaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const { error } = await client
  .from("pilot_state")
  .upsert({
    singleton: true,
    state: {
      version: 3,
      nextPilotNumber: Math.max(1, Number(parsed.nextPilotNumber) || 1),
      pilots: parsed.pilots,
      passwordResetTokens: [],
    },
  });

if (error) throw error;
console.log(`Imported ${parsed.pilots.length} pilot record(s) into Supabase pilot_state.`);
