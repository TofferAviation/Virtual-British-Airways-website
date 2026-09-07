import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type StaffPreferences = {
  staffPageBackground?: string;
};

type StaffPreferencesState = {
  users: Record<string, StaffPreferences>;
};

const dataDir = path.join(process.cwd(), ".bav-data");
const preferencesFile = path.join(dataDir, "staff-preferences.json");

function emptyState(): StaffPreferencesState {
  return { users: {} };
}

async function readState(): Promise<StaffPreferencesState> {
  try {
    const raw = await readFile(preferencesFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<StaffPreferencesState>;
    return {
      users: parsed.users && typeof parsed.users === "object" ? parsed.users : {},
    };
  } catch {
    return emptyState();
  }
}

async function saveState(state: StaffPreferencesState) {
  await mkdir(dataDir, { recursive: true });
  const tempFile = `${preferencesFile}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempFile, preferencesFile);
}

export async function getStaffPreferences(userId: string): Promise<StaffPreferences> {
  const state = await readState();
  return state.users[userId] ?? {};
}

export async function setStaffPageBackground(userId: string, background: string | null) {
  const state = await readState();
  const current = state.users[userId] ?? {};

  if (background) {
    state.users[userId] = { ...current, staffPageBackground: background };
  } else {
    const { staffPageBackground: _background, ...remaining } = current;
    void _background;
    if (Object.keys(remaining).length) state.users[userId] = remaining;
    else delete state.users[userId];
  }

  await saveState(state);
  return state.users[userId] ?? {};
}
