import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { addAudit, getStaffState, hasPermission, saveStaffState } from "@/lib/staff-store";
import {
  getServiceStatusState,
  incidentStageLabel,
  makeServiceId,
  overallServiceStatus,
  saveServiceStatusState,
  serviceStateLabel,
  type IncidentStage,
  type MaintenanceStage,
  type ServiceState,
} from "@/lib/service-status-store";

const serviceStates: ServiceState[] = ["operational", "degraded", "partial_outage", "major_outage", "maintenance"];
const incidentStages: IncidentStage[] = ["investigating", "identified", "monitoring", "resolved"];
const maintenanceStages: MaintenanceStage[] = ["scheduled", "completed", "cancelled"];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

async function authorize(permission: "status.view" | "status.edit") {
  const session = await getStaffSession();
  if (!session) return { denied: NextResponse.json({ error: "Staff authentication required." }, { status: 401 }) };
  const staff = await getStaffState();
  const actor = staff.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !hasPermission(staff, actor, permission)) {
    return { denied: NextResponse.json({ error: `Permission required: ${permission}.` }, { status: 403 }) };
  }
  return { session, staff, actor };
}

export async function GET() {
  const auth = await authorize("status.view");
  if ("denied" in auth) return auth.denied;
  const state = await getServiceStatusState();
  return NextResponse.json({ state, overall: overallServiceStatus(state) });
}

export async function POST(request: NextRequest) {
  const auth = await authorize("status.edit");
  if ("denied" in auth) return auth.denied;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const action = text(body?.action);
    const state = await getServiceStatusState();
    const now = new Date().toISOString();
    let auditDetails = "Updated Service Status.";

    if (action === "component-status") {
      const id = text(body?.id);
      const status = text(body?.status) as ServiceState;
      if (!serviceStates.includes(status)) throw new Error("Invalid component status.");
      const component = state.components.find((item) => item.id === id);
      if (!component) throw new Error("Service component not found.");
      component.status = status;
      component.lastUpdated = now;
      auditDetails = `${component.name}: ${serviceStateLabel(status)}.`;
    } else if (action === "component-uptime") {
      const id = text(body?.id);
      const uptime = Number(body?.uptime);
      if (!Number.isFinite(uptime) || uptime < 0 || uptime > 100) throw new Error("30-day uptime must be between 0 and 100.");
      const component = state.components.find((item) => item.id === id);
      if (!component) throw new Error("Service component not found.");
      component.uptime30d = Math.round(uptime * 100) / 100;
      component.lastUpdated = now;
      auditDetails = `${component.name}: 30-day uptime set to ${component.uptime30d.toFixed(2)}%.`;
    } else if (action === "incident-create") {
      const title = text(body?.title);
      const message = text(body?.message);
      const componentIds = stringList(body?.componentIds);
      if (!title || !message || !componentIds.length) throw new Error("Incident title, message and at least one affected component are required.");
      if (componentIds.some((id) => !state.components.some((component) => component.id === id))) throw new Error("One or more selected components do not exist.");
      const incident = {
        id: makeServiceId("incident"),
        title,
        componentIds,
        stage: "investigating" as IncidentStage,
        createdAt: now,
        updatedAt: now,
        updates: [{ id: makeServiceId("update"), stage: "investigating" as IncidentStage, message, createdAt: now, staffName: auth.actor.name }],
      };
      state.incidents.unshift(incident);
      auditDetails = `Published incident “${title}”.`;
    } else if (action === "incident-update") {
      const id = text(body?.id);
      const stage = text(body?.stage) as IncidentStage;
      const message = text(body?.message);
      if (!incidentStages.includes(stage) || !message) throw new Error("Incident stage and update message are required.");
      const incident = state.incidents.find((item) => item.id === id);
      if (!incident) throw new Error("Incident not found.");
      incident.stage = stage;
      incident.updatedAt = now;
      if (stage === "resolved") incident.resolvedAt = now;
      else delete incident.resolvedAt;
      incident.updates.unshift({ id: makeServiceId("update"), stage, message, createdAt: now, staffName: auth.actor.name });
      auditDetails = `${incident.title}: ${incidentStageLabel(stage)} update published.`;
    } else if (action === "incident-delete") {
      const id = text(body?.id);
      const incident = state.incidents.find((item) => item.id === id);
      if (!incident) throw new Error("Incident not found.");
      state.incidents = state.incidents.filter((item) => item.id !== id);
      auditDetails = `Deleted incident “${incident.title}”.`;
    } else if (action === "maintenance-create") {
      const title = text(body?.title);
      const message = text(body?.message);
      const startAt = text(body?.startAt);
      const endAt = text(body?.endAt);
      const componentIds = stringList(body?.componentIds);
      if (!title || !message || !startAt || !endAt || !componentIds.length) throw new Error("Maintenance title, timing, message and affected components are required.");
      const start = new Date(startAt);
      const end = new Date(endAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error("Maintenance end time must be after the start time.");
      if (componentIds.some((id) => !state.components.some((component) => component.id === id))) throw new Error("One or more selected components do not exist.");
      state.maintenance.unshift({ id: makeServiceId("maintenance"), title, componentIds, startAt: start.toISOString(), endAt: end.toISOString(), message, status: "scheduled", createdAt: now, updatedAt: now });
      auditDetails = `Scheduled maintenance “${title}”.`;
    } else if (action === "maintenance-update") {
      const id = text(body?.id);
      const status = text(body?.status) as MaintenanceStage;
      if (!maintenanceStages.includes(status)) throw new Error("Invalid maintenance status.");
      const item = state.maintenance.find((entry) => entry.id === id);
      if (!item) throw new Error("Maintenance notice not found.");
      item.status = status;
      item.updatedAt = now;
      auditDetails = `${item.title}: maintenance marked ${status}.`;
    } else if (action === "maintenance-delete") {
      const id = text(body?.id);
      const item = state.maintenance.find((entry) => entry.id === id);
      if (!item) throw new Error("Maintenance notice not found.");
      state.maintenance = state.maintenance.filter((entry) => entry.id !== id);
      auditDetails = `Deleted maintenance notice “${item.title}”.`;
    } else {
      throw new Error("Unknown Service Status action.");
    }

    await saveServiceStatusState(state);
    addAudit(auth.staff, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: `service-status.${action || "updated"}`,
      details: auditDetails,
    });
    await saveStaffState(auth.staff);

    return NextResponse.json({ state, overall: overallServiceStatus(state), ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Service Status." }, { status: 400 });
  }
}
