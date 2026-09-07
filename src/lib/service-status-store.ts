import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export type ServiceState = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance";
export type IncidentStage = "investigating" | "identified" | "monitoring" | "resolved";
export type MaintenanceStage = "scheduled" | "completed" | "cancelled";

export type ServiceComponent = {
  id: string;
  name: string;
  description: string;
  group: string;
  icon: string;
  core: boolean;
  critical: boolean;
  status: ServiceState;
  uptime30d: number;
  lastUpdated: string;
};

export type IncidentUpdate = {
  id: string;
  stage: IncidentStage;
  message: string;
  createdAt: string;
  staffName: string;
};

export type ServiceIncident = {
  id: string;
  title: string;
  componentIds: string[];
  stage: IncidentStage;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  updates: IncidentUpdate[];
};

export type ScheduledMaintenance = {
  id: string;
  title: string;
  componentIds: string[];
  startAt: string;
  endAt: string;
  message: string;
  status: MaintenanceStage;
  createdAt: string;
  updatedAt: string;
};

export type ServiceStatusState = {
  components: ServiceComponent[];
  incidents: ServiceIncident[];
  maintenance: ScheduledMaintenance[];
};

export type OverallServiceStatus = {
  state: ServiceState;
  title: string;
  message: string;
  updatedAt: string;
};

const dataDir = path.join(process.cwd(), ".bav-data");
const statusFile = path.join(dataDir, "service-status.json");
const seededAt = "2026-09-07T20:00:00.000Z";

const defaultComponents: ServiceComponent[] = [
  { id: "website", name: "Website", description: "The main British Airways Virtual website", group: "Core", icon: "▣", core: true, critical: true, status: "operational", uptime30d: 99.98, lastUpdated: seededAt },
  { id: "pilot-accounts", name: "Pilot accounts", description: "Login, vAMSYS and account services", group: "Core", icon: "●", core: true, critical: true, status: "operational", uptime30d: 99.95, lastUpdated: seededAt },
  { id: "flight-search", name: "Flight search", description: "Route search and flight assignments", group: "Core", icon: "⌕", core: true, critical: true, status: "operational", uptime30d: 99.82, lastUpdated: seededAt },
  { id: "events-community", name: "Events & community", description: "Event registration and community tools", group: "Core", icon: "◎", core: true, critical: false, status: "operational", uptime30d: 99.97, lastUpdated: seededAt },
  { id: "vamsys-login", name: "vAMSYS login", description: "Virtual-airline authentication handoff", group: "Accounts", icon: "↗", core: false, critical: true, status: "operational", uptime30d: 99.96, lastUpdated: seededAt },
  { id: "flight-assignments", name: "Flight assignments", description: "Pilot flight assignment workflow", group: "Operations", icon: "✈", core: false, critical: true, status: "operational", uptime30d: 99.94, lastUpdated: seededAt },
  { id: "route-database", name: "Route database", description: "Routes, schedules and aircraft assignment data", group: "Operations", icon: "▤", core: false, critical: true, status: "operational", uptime30d: 99.99, lastUpdated: seededAt },
  { id: "phoenix-sync", name: "Phoenix synchronization", description: "Shared pilot statistics and progression synchronization", group: "Operations", icon: "↻", core: false, critical: false, status: "operational", uptime30d: 99.9, lastUpdated: seededAt },
  { id: "va-points", name: "VA Points", description: "Virtual-airline points and rewards", group: "Progression", icon: "◫", core: false, critical: false, status: "operational", uptime30d: 99.98, lastUpdated: seededAt },
  { id: "tier-points", name: "Tier Points", description: "Virtual status progression", group: "Progression", icon: "☆", core: false, critical: false, status: "operational", uptime30d: 99.98, lastUpdated: seededAt },
  { id: "events", name: "Events", description: "Published events and registrations", group: "Community", icon: "□", core: false, critical: false, status: "operational", uptime30d: 99.97, lastUpdated: seededAt },
  { id: "staff-centre", name: "Staff / Admin centre", description: "Staff tools and operational management", group: "Administration", icon: "⚙", core: false, critical: false, status: "operational", uptime30d: 99.99, lastUpdated: seededAt },
  { id: "support-system", name: "Support system", description: "Pilot help and support tools", group: "Support", icon: "?", core: false, critical: false, status: "operational", uptime30d: 99.97, lastUpdated: seededAt },
  { id: "discord-integration", name: "Discord integration", description: "Community notifications and Discord tools", group: "Community", icon: "◉", core: false, critical: false, status: "operational", uptime30d: 99.99, lastUpdated: seededAt },
  { id: "email-notifications", name: "Email notifications", description: "Operational and service email delivery", group: "Notifications", icon: "✉", core: false, critical: false, status: "operational", uptime30d: 99.95, lastUpdated: seededAt },
];

function defaultState(): ServiceStatusState {
  return { components: defaultComponents.map((component) => ({ ...component })), incidents: [], maintenance: [] };
}

function normalizeState(input?: Partial<ServiceStatusState>): ServiceStatusState {
  const stored = Array.isArray(input?.components) ? input!.components! : [];
  const components = defaultComponents.map((seed) => ({ ...seed, ...(stored.find((item) => item.id === seed.id) ?? {}) }));
  for (const component of stored) {
    if (!components.some((item) => item.id === component.id)) components.push(component);
  }
  return {
    components,
    incidents: Array.isArray(input?.incidents) ? input!.incidents! : [],
    maintenance: Array.isArray(input?.maintenance) ? input!.maintenance! : [],
  };
}

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

export async function getServiceStatusState(): Promise<ServiceStatusState> {
  try {
    const raw = await readFile(statusFile, "utf8");
    return normalizeState(JSON.parse(raw) as ServiceStatusState);
  } catch {
    return defaultState();
  }
}

export async function saveServiceStatusState(state: ServiceStatusState) {
  await ensureDataDir();
  const tmp = `${statusFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
  await rename(tmp, statusFile);
}

export function makeServiceId(prefix: string) {
  return `${prefix}-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

export function isActiveMaintenance(item: ScheduledMaintenance, now = new Date()) {
  if (item.status !== "scheduled") return false;
  const start = new Date(item.startAt).getTime();
  const end = new Date(item.endAt).getTime();
  const time = now.getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= time && time <= end;
}

export function effectiveComponentStatus(state: ServiceStatusState, component: ServiceComponent, now = new Date()): ServiceState {
  const maintenanceActive = state.maintenance.some((item) => item.componentIds.includes(component.id) && isActiveMaintenance(item, now));
  if (maintenanceActive && component.status === "operational") return "maintenance";
  return component.status;
}

const severity: Record<ServiceState, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

export function overallServiceStatus(state: ServiceStatusState, now = new Date()): OverallServiceStatus {
  const effective = state.components.map((component) => ({ component, status: effectiveComponentStatus(state, component, now) }));
  const worst = effective.reduce<ServiceState>((current, item) => severity[item.status] > severity[current] ? item.status : current, "operational");
  const latest = [
    ...state.components.map((item) => item.lastUpdated),
    ...state.incidents.map((item) => item.updatedAt),
    ...state.maintenance.map((item) => item.updatedAt),
  ].filter(Boolean).sort().at(-1) ?? seededAt;

  if (worst === "major_outage") return { state: worst, title: "Major service disruption", message: "One or more critical British Airways Virtual services are currently unavailable. Follow the incident updates below.", updatedAt: latest };
  if (worst === "partial_outage") return { state: worst, title: "Partial service disruption", message: "Some British Airways Virtual features are currently unavailable. The team is working to restore normal service.", updatedAt: latest };
  if (worst === "degraded") return { state: worst, title: "Some services are experiencing issues", message: "British Airways Virtual remains available, but one or more services may be slower or unreliable than normal.", updatedAt: latest };
  if (worst === "maintenance") return { state: worst, title: "Scheduled maintenance in progress", message: "Planned maintenance is currently affecting one or more services. Check the maintenance notice for timing and impact.", updatedAt: latest };
  return { state: "operational", title: "All core services are operational", message: "British Airways Virtual systems are running normally. We’ll publish updates here if anything changes.", updatedAt: latest };
}

export function serviceStateLabel(state: ServiceState) {
  if (state === "degraded") return "Degraded performance";
  if (state === "partial_outage") return "Partial outage";
  if (state === "major_outage") return "Major outage";
  if (state === "maintenance") return "Maintenance";
  return "Operational";
}

export function incidentStageLabel(stage: IncidentStage) {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}
