import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ORGANIZATION_CODE = "BAV";

export type FleetAircraftSummary = {
  id: string;
  registration: string;
  aircraftModel: string;
  variant: string | null;
  icaoType: string | null;
  subfleet: string | null;
  currentStation: string | null;
  operationalStatus: string;
  technicalStatus: string;
  dispatchStatus: string;
  airframeHoursMinutes: number;
  airframeCycles: number;
  lastFlightAt: string | null;
  nextAssignedFlightReference: string | null;
  statusVersion: number;
  image: FleetAircraftImage | null;
};

export type FleetAircraftImage = {
  url: string;
  source: string;
  credit: string | null;
  sourcePageUrl: string | null;
};

export type FleetAircraftImageInput = {
  imageUrl: string;
  sourceName: string;
  credit?: string;
  sourcePageUrl?: string;
};

export type FleetAircraftImageImportInput = FleetAircraftImageInput & {
  registration: string;
};

export type FleetAircraftImageImportResult = {
  imported: number;
};

export type PlaneSpottersPhotoSyncResult = {
  checked: number;
  imported: number;
  notFound: number;
  preserved: number;
  failed: number;
};

export type FleetAircraftDetail = FleetAircraftSummary & {
  fleetNumber: string | null;
  aircraftFamily: string | null;
  manufacturer: string | null;
  msn: string | null;
  homeBase: string | null;
  currentLivery: string | null;
  configurationId: string | null;
  entryIntoServiceDate: string | null;
  engineData: unknown;
  apuData: unknown;
};

export type FleetActor = {
  subject: string;
  displayName: string;
  fleetRole: string;
};

export type CreateFleetAircraftInput = {
  registration: string;
  aircraftModel: string;
  variant?: string;
  aircraftFamily?: string;
  manufacturer?: string;
  icaoType?: string;
  iataType?: string;
  fleetNumber?: string;
  msn?: string;
  subfleet?: string;
  homeBase?: string;
  currentStation?: string;
  currentLivery?: string;
  configurationId?: string;
  airframeHoursMinutes?: number;
  airframeCycles?: number;
};

export type FleetImportAircraftInput = {
  registration: string;
  aircraftModel: string;
  manufacturer?: string;
  aircraftFamily?: string;
  icaoType?: string;
  subfleet?: string;
  operatorName?: string;
  ownerName?: string;
  sourceStatus: "active" | "stored";
};

export type FleetImportResult = {
  imported: number;
  active: number;
  stored: number;
  sourceLabel: string;
};

export type FleetStatusTransitionInput = {
  expectedVersion: number;
  operationalStatus: string;
  technicalStatus: string;
  dispatchStatus: string;
  action: "status_change" | "declare_aog" | "clear_aog" | "release_to_service" | "ground_aircraft" | "start_repaint" | "complete_repaint";
  reason: string;
  remarks?: string;
  station?: string;
  effectiveAt?: string;
};

export type FleetDefectInput = {
  category: string;
  description: string;
  severity: "low" | "normal" | "high" | "critical";
  dispatchImpact: "none" | "restriction" | "blocking";
  station?: string;
  source?: "flight_crew" | "cabin_crew" | "ground" | "maintenance" | "simulator" | "administrator" | "system";
  ataChapter?: string;
  cabinZone?: string;
  seatNumber?: string;
  galleyPosition?: string;
  lavatoryPosition?: string;
  doorPosition?: string;
  equipmentPosition?: string;
  operationalImpact?: string;
  cabinImpact?: string;
  assignedTeam?: string;
};

export type FleetMaintenanceInput = {
  maintenanceType: string;
  reason: string;
  status?: "planned" | "scheduled" | "aircraft_awaited" | "in_progress" | "awaiting_parts" | "awaiting_inspection" | "awaiting_engineering" | "testing";
  blocking?: boolean;
  location?: string;
  provider?: string;
  workScope?: string;
  plannedStartAt?: string;
  estimatedCompletionAt?: string;
};

export type FleetDamageInput = {
  location: string;
  damageType: string;
  description: string;
  severity: "minor" | "major" | "critical";
  station?: string;
  inspectionRequired?: boolean;
  repairRequired?: boolean;
  operationalRestriction?: string;
};

export type FleetHardLandingInput = {
  landingFpm: number;
  station?: string;
};

export type FleetHardLandingAssessment = {
  outcome: "inspection_required" | "maintenance_required";
  landingFpm: number;
  registration: string;
  reference: string;
};

export type FleetFlightAssignmentInput = {
  pilotSubject: string;
  pilotDisplayName?: string;
  flightReference: string;
  departureStation?: string;
  arrivalStation?: string;
};

export type FleetFlightAssignment = {
  id: string;
  aircraftId: string;
  pilotSubject: string;
  pilotDisplayName: string;
  flightReference: string;
  departureStation: string | null;
  arrivalStation: string | null;
  status: "reserved" | "operating" | "completed" | "cancelled";
  reservedAt: string;
  offBlockAt: string | null;
  onBlockAt: string | null;
  blockMinutes: number | null;
};

export type FleetRepaintInput = {
  newLivery: string;
  paintFacility?: string;
  reason?: string;
  plannedStartAt?: string;
  estimatedCompletionAt?: string;
  notes?: string;
};

export type FleetStatusHistoryEntry = {
  id: string;
  operational_status: string;
  technical_status: string;
  dispatch_status: string;
  reason: string;
  remarks: string | null;
  station: string | null;
  effective_at: string;
  source: string;
  changed_by_subject: string;
};

export type FleetLogEntry = {
  id: string;
  reference: string;
  occurred_at: string;
  station: string | null;
  category: string;
  description: string;
  status: string;
};

export type FleetDefect = {
  id: string;
  reference: string;
  reported_at: string;
  reporting_station: string | null;
  category: string;
  seat_number: string | null;
  description: string;
  severity: string;
  dispatch_impact: string;
  status: string;
  version: number;
  deferral: FleetDeferral | null;
};

export type FleetDeferral = {
  id: string;
  deferral_kind: "mel" | "cdl" | "airline_rule";
  reference: string;
  restriction: string;
  operational_procedure: string | null;
  maintenance_procedure: string | null;
  due_at: string | null;
  due_cycles: number | null;
  due_hours_minutes: number | null;
};

export type FleetDefectTransitionInput = {
  expectedVersion: number;
  action: "review" | "defer" | "schedule_maintenance" | "start_work" | "await_parts" | "rectify" | "close" | "void";
  notes: string;
  deferral?: {
    kind: "mel" | "cdl" | "airline_rule";
    reference: string;
    restriction: string;
    operationalProcedure?: string;
    maintenanceProcedure?: string;
    dueAt?: string;
    dueCycles?: number;
    dueHoursMinutes?: number;
  };
};

export type FleetMaintenanceDue = {
  task_id: string;
  task_code: string;
  task_name: string;
  due_date: string | null;
  due_hours_minutes: number | null;
  due_cycles: number | null;
  due_status: "normal" | "due_soon" | "overdue";
  due_reason: string;
};

export type FleetMaintenanceEvent = {
  id: string;
  reference: string;
  maintenance_type: string;
  planned_start_at: string | null;
  estimated_completion_at: string | null;
  location: string | null;
  provider: string | null;
  reason: string;
  status: string;
  blocking: boolean;
  version: number;
};

export type FleetDamageRecord = {
  id: string;
  reference: string;
  reported_at: string;
  station: string | null;
  location: string;
  damage_type: string;
  description: string;
  severity: string;
  status: string;
  version: number;
};

export type FleetRepaint = {
  id: string;
  reference: string;
  new_livery: string;
  paint_facility: string | null;
  status: string;
  estimated_completion_at: string | null;
};

export type FleetAircraftRecord = FleetAircraftDetail & {
  availability: { dispatchStatus: string; available: boolean; reasons: string[] };
  defects: FleetDefect[];
  maintenanceDue: FleetMaintenanceDue[];
  maintenanceEvents: FleetMaintenanceEvent[];
  damageRecords: FleetDamageRecord[];
  repaints: FleetRepaint[];
  statusHistory: FleetStatusHistoryEntry[];
  logbook: FleetLogEntry[];
};

type AircraftRow = {
  id: string;
  registration: string;
  aircraft_model: string;
  variant: string | null;
  icao_type: string | null;
  subfleet: string | null;
  current_station: string | null;
  operational_status: string;
  technical_status: string;
  dispatch_status: string;
  airframe_hours_minutes: number;
  airframe_cycles: number;
  last_flight_at: string | null;
  next_assigned_flight_reference: string | null;
  status_version: number;
  fleet_number: string | null;
  aircraft_family: string | null;
  manufacturer: string | null;
  msn: string | null;
  home_base: string | null;
  current_livery: string | null;
  configuration_id: string | null;
  entry_into_service_date: string | null;
  engine_data: unknown;
  apu_data: unknown;
};

type AircraftImageRow = {
  aircraft_id: string;
  image_url: string;
  source_name: string;
  credit: string | null;
  source_page_url: string | null;
};

type FlightAssignmentRow = {
  id: string;
  aircraft_id: string;
  pilot_subject: string;
  pilot_display_name: string;
  flight_reference: string;
  departure_station: string | null;
  arrival_station: string | null;
  status: "reserved" | "operating" | "completed" | "cancelled";
  reserved_at: string;
  off_block_at: string | null;
  on_block_at: string | null;
  block_minutes: number | null;
};

type PlaneSpottersPhoto = {
  id?: string | number;
  link?: string;
  photographer?: string;
  thumbnail?: { src?: string; url?: string };
  thumbnail_large?: { src?: string; url?: string };
};

type PlaneSpottersResponse = {
  photos?: PlaneSpottersPhoto[];
};

export class FleetServiceError extends Error {
  public readonly status: number;

  public constructor(message: string, status = 500) {
    super(message);
    this.name = "FleetServiceError";
    this.status = status;
  }
}

function getServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) {
    throw new FleetServiceError("Fleet data is not configured on this server.", 503);
  }

  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function asImage(row: AircraftImageRow | null | undefined): FleetAircraftImage | null {
  if (!row) return null;
  return { url: row.image_url, source: row.source_name, credit: row.credit, sourcePageUrl: row.source_page_url };
}

function asSummary(row: AircraftRow, image?: AircraftImageRow | null): FleetAircraftSummary {
  return {
    id: row.id,
    registration: row.registration,
    aircraftModel: row.aircraft_model,
    variant: row.variant,
    icaoType: row.icao_type,
    subfleet: row.subfleet,
    currentStation: row.current_station,
    operationalStatus: row.operational_status,
    technicalStatus: row.technical_status,
    dispatchStatus: row.dispatch_status,
    airframeHoursMinutes: row.airframe_hours_minutes,
    airframeCycles: row.airframe_cycles,
    lastFlightAt: row.last_flight_at,
    nextAssignedFlightReference: row.next_assigned_flight_reference,
    statusVersion: row.status_version,
    image: asImage(image),
  };
}

function asDetail(row: AircraftRow, image?: AircraftImageRow | null): FleetAircraftDetail {
  return {
    ...asSummary(row, image),
    fleetNumber: row.fleet_number,
    aircraftFamily: row.aircraft_family,
    manufacturer: row.manufacturer,
    msn: row.msn,
    homeBase: row.home_base,
    currentLivery: row.current_livery,
    configurationId: row.configuration_id,
    entryIntoServiceDate: row.entry_into_service_date,
    engineData: row.engine_data,
    apuData: row.apu_data,
  };
}

function asFlightAssignment(row: FlightAssignmentRow): FleetFlightAssignment {
  return {
    id: row.id,
    aircraftId: row.aircraft_id,
    pilotSubject: row.pilot_subject,
    pilotDisplayName: row.pilot_display_name,
    flightReference: row.flight_reference,
    departureStation: row.departure_station,
    arrivalStation: row.arrival_station,
    status: row.status,
    reservedAt: row.reserved_at,
    offBlockAt: row.off_block_at,
    onBlockAt: row.on_block_at,
    blockMinutes: row.block_minutes,
  };
}

async function organizationId(client: SupabaseClient) {
  const { data, error } = await client
    .from("organizations")
    .select("id")
    .eq("code", ORGANIZATION_CODE)
    .maybeSingle();
  if (error) throw new FleetServiceError(`Could not load fleet organization: ${error.message}`);
  if (!data?.id) throw new FleetServiceError("The British Airways Virtual fleet organization has not been initialized.", 503);
  return String(data.id);
}

export function fleetRoleCodeForWebsiteRole(websiteRole: string) {
  if (websiteRole === "admin") return "airline_administrator";
  if (websiteRole === "operations") return "operations_controller";
  if (websiteRole === "pilot") return "pilot";
  return "viewer";
}

const summaryFields = "id, registration, aircraft_model, variant, icao_type, subfleet, current_station, operational_status, technical_status, dispatch_status, airframe_hours_minutes, airframe_cycles, last_flight_at, next_assigned_flight_reference, status_version";
const detailFields = `${summaryFields}, fleet_number, aircraft_family, manufacturer, msn, home_base, current_livery, configuration_id, entry_into_service_date, engine_data, apu_data`;

async function fleetImagesByAircraft(client: SupabaseClient, organization: string, aircraftIds?: string[]) {
  let query = client
    .from("aircraft_images")
    .select("aircraft_id, image_url, source_name, credit, source_page_url")
    .eq("organization_id", organization);
  if (aircraftIds?.length) query = query.in("aircraft_id", aircraftIds);
  const { data, error } = await query;
  if (error) throw new FleetServiceError(`Could not load aircraft photo catalogue: ${error.message}`);
  return new Map((data ?? []).map((row) => [String(row.aircraft_id), row as AircraftImageRow]));
}

export async function listFleetAircraft(): Promise<FleetAircraftSummary[]> {
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client
    .from("aircraft")
    .select(summaryFields)
    .eq("organization_id", organization)
    .order("registration", { ascending: true });
  if (error) throw new FleetServiceError(`Could not load aircraft: ${error.message}`);
  const aircraft = (data ?? []) as AircraftRow[];
  const images = await fleetImagesByAircraft(client, organization, aircraft.map((row) => row.id));
  return aircraft.map((row) => asSummary(row, images.get(row.id)));
}

export async function getFleetAircraft(aircraftId: string): Promise<FleetAircraftDetail | null> {
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client
    .from("aircraft")
    .select(detailFields)
    .eq("organization_id", organization)
    .eq("id", aircraftId)
    .maybeSingle();
  if (error) throw new FleetServiceError(`Could not load aircraft: ${error.message}`);
  if (!data) return null;
  const images = await fleetImagesByAircraft(client, organization, [aircraftId]);
  return asDetail(data as AircraftRow, images.get(aircraftId));
}

function requestId() {
  return crypto.randomUUID();
}

function requiredText(value: string | undefined, field: string, minimum = 1) {
  const normalized = value?.trim() ?? "";
  if (normalized.length < minimum) throw new FleetServiceError(`${field} is required.`, 400);
  return normalized;
}

function flightActor(input: FleetFlightAssignmentInput) {
  const pilotSubject = requiredText(input.pilotSubject, "Signed-in staff ID", 2).toUpperCase();
  if (!/^[A-Z0-9._:-]{2,160}$/.test(pilotSubject)) {
    throw new FleetServiceError("Signed-in account ID is invalid.", 400);
  }
  const flightReference = requiredText(input.flightReference, "Flight reference", 2).toUpperCase();
  const departureStation = input.departureStation?.trim().toUpperCase() || null;
  const arrivalStation = input.arrivalStation?.trim().toUpperCase() || null;
  return {
    pilotSubject,
    pilotDisplayName: input.pilotDisplayName?.trim() || pilotSubject,
    flightReference,
    departureStation,
    arrivalStation,
  };
}

function optionalUrl(value: string | undefined, field: string) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("not HTTPS");
    return parsed.toString();
  } catch {
    throw new FleetServiceError(`${field} must be a valid HTTPS URL.`, 400);
  }
}

function requiredUrl(value: string | undefined, field: string) {
  const url = optionalUrl(value, field);
  if (!url) throw new FleetServiceError(`${field} is required.`, 400);
  return url;
}

function planespottersContact() {
  const contact = (process.env.PLANESPOTTERS_CONTACT ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!contact) {
    throw new FleetServiceError("Planespotters photo sync needs PLANESPOTTERS_CONTACT set to a real public contact URL or email address.", 503);
  }
  const isHttpsUrl = /^https:\/\/\S+$/i.test(contact);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(contact);
  if (!isHttpsUrl && !isEmail) {
    throw new FleetServiceError("PLANESPOTTERS_CONTACT must be a public HTTPS URL or email address.", 503);
  }
  return contact;
}

function asHttpsUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function planespottersPhotoForRegistration(registration: string, contact: string) {
  const response = await fetch(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(registration)}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": `FreeFlightCabinControls/1.0 (+${contact})`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return { status: "not_found" as const };
  if (!response.ok) return { status: "failed" as const };

  const body = await response.json() as PlaneSpottersResponse;
  const first = body.photos?.[0];
  const imageUrl = asHttpsUrl(
    first?.thumbnail_large?.src
      ?? first?.thumbnail_large?.url
      ?? first?.thumbnail?.src
      ?? first?.thumbnail?.url,
  );
  if (!first || !imageUrl) return { status: "not_found" as const };
  const sourcePageUrl = asHttpsUrl(first.link) ?? (first.id ? `https://www.planespotters.net/photo/${first.id}` : null);
  return {
    status: "found" as const,
    imageUrl,
    credit: first.photographer?.trim() || null,
    sourcePageUrl,
  };
}

function rpcError(action: string, error: { message: string; code?: string } | null) {
  if (!error) return;
  const status = error.code === "40001" ? 409 : error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400;
  throw new FleetServiceError(`${action}: ${error.message}`, status);
}

export async function createFleetAircraft(actor: FleetActor, input: CreateFleetAircraftInput) {
  const registration = requiredText(input.registration, "Registration", 2).toUpperCase();
  const aircraftModel = requiredText(input.aircraftModel, "Aircraft model", 2);
  if (!/^[A-Z0-9-]{2,16}$/.test(registration)) {
    throw new FleetServiceError("Registration must use uppercase letters, numbers or hyphens.", 400);
  }
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_create_aircraft", {
    p_organization_id: organization,
    p_payload: { ...input, registration, aircraftModel },
    p_actor_subject: actor.subject,
    p_actor_role: actor.fleetRole,
    p_request_id: requestId(),
  });
  rpcError("Could not create aircraft", error);
  return asDetail(data as AircraftRow);
}

export async function upsertFleetAircraftImage(aircraftId: string, actor: FleetActor, input: Partial<FleetAircraftImageInput>) {
  const imageUrl = requiredUrl(input.imageUrl, "Image URL");
  const sourceName = requiredText(input.sourceName, "Image source", 2);
  const sourcePageUrl = optionalUrl(input.sourcePageUrl, "Source page URL");
  const client = getServerClient();
  const organization = await organizationId(client);
  const aircraft = await getFleetAircraft(aircraftId);
  if (!aircraft) throw new FleetServiceError("Aircraft not found.", 404);

  const { data, error } = await client
    .from("aircraft_images")
    .upsert({
      organization_id: organization,
      aircraft_id: aircraftId,
      image_url: imageUrl,
      source_name: sourceName,
      credit: input.credit?.trim() || null,
      source_page_url: sourcePageUrl,
      approved_by_subject: actor.subject,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "aircraft_id" })
    .select("aircraft_id, image_url, source_name, credit, source_page_url")
    .single();
  if (error) throw new FleetServiceError(`Could not save aircraft photo: ${error.message}`);
  return asImage(data as AircraftImageRow)!;
}

export async function importFleetAircraftImages(actor: FleetActor, rows: FleetAircraftImageImportInput[]): Promise<FleetAircraftImageImportResult> {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) {
    throw new FleetServiceError("Import between 1 and 500 approved photo rows at a time.", 400);
  }
  const normalized = rows.map((row) => ({
    registration: requiredText(row.registration, "Registration", 2).toUpperCase(),
    imageUrl: requiredUrl(row.imageUrl, "Image URL"),
    sourceName: requiredText(row.sourceName, "Image source", 2),
    credit: row.credit?.trim() || null,
    sourcePageUrl: optionalUrl(row.sourcePageUrl, "Source page URL"),
  }));
  const registrations = new Set<string>();
  for (const row of normalized) {
    if (!/^[A-Z0-9-]{2,16}$/.test(row.registration)) throw new FleetServiceError(`Invalid registration: ${row.registration}.`, 400);
    if (registrations.has(row.registration)) throw new FleetServiceError(`Duplicate registration in photo import: ${row.registration}.`, 400);
    registrations.add(row.registration);
  }

  const client = getServerClient();
  const organization = await organizationId(client);
  const { data: aircraft, error: aircraftError } = await client
    .from("aircraft")
    .select("id, registration")
    .eq("organization_id", organization)
    .in("registration", [...registrations]);
  if (aircraftError) throw new FleetServiceError(`Could not validate photo registrations: ${aircraftError.message}`);
  const aircraftByRegistration = new Map((aircraft ?? []).map((item) => [String(item.registration).toUpperCase(), String(item.id)]));
  const missing = normalized.map((row) => row.registration).filter((registration) => !aircraftByRegistration.has(registration));
  if (missing.length) throw new FleetServiceError(`No Fleet aircraft record for: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}.`, 400);

  const timestamp = new Date().toISOString();
  const { error } = await client
    .from("aircraft_images")
    .upsert(normalized.map((row) => ({
      organization_id: organization,
      aircraft_id: aircraftByRegistration.get(row.registration),
      image_url: row.imageUrl,
      source_name: row.sourceName,
      credit: row.credit,
      source_page_url: row.sourcePageUrl,
      approved_by_subject: actor.subject,
      approved_at: timestamp,
      updated_at: timestamp,
    })), { onConflict: "aircraft_id" });
  if (error) throw new FleetServiceError(`Could not import aircraft photo catalogue: ${error.message}`);
  return { imported: normalized.length };
}

export async function syncFleetAircraftImagesFromPlanespotters(actor: FleetActor): Promise<PlaneSpottersPhotoSyncResult> {
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data: aircraft, error: aircraftError } = await client
    .from("aircraft")
    .select("id, registration")
    .eq("organization_id", organization)
    .order("registration", { ascending: true });
  if (aircraftError) throw new FleetServiceError(`Could not load aircraft for photo synchronization: ${aircraftError.message}`);

  const fleet = (aircraft ?? []).map((row) => ({ id: String(row.id), registration: String(row.registration).toUpperCase() }));
  const existing = await fleetImagesByAircraft(client, organization, fleet.map((row) => row.id));
  const candidates = fleet.filter((row) => {
    const image = existing.get(row.id);
    return !image || /^planespotters(?:\.net)?$/i.test(image.source_name.trim());
  });
  const contact = planespottersContact();
  const photos: Array<{ aircraftId: string; imageUrl: string; credit: string | null; sourcePageUrl: string | null }> = [];
  let notFound = 0;
  let failed = 0;

  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    const results = await Promise.all(batch.map(async (aircraft) => ({ aircraft, photo: await planespottersPhotoForRegistration(aircraft.registration, contact) })));
    for (const { aircraft, photo } of results) {
      if (photo.status === "found") photos.push({ aircraftId: aircraft.id, imageUrl: photo.imageUrl, credit: photo.credit, sourcePageUrl: photo.sourcePageUrl });
      else if (photo.status === "not_found") notFound += 1;
      else failed += 1;
    }
    if (index + batch.length < candidates.length) await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (photos.length) {
    const timestamp = new Date().toISOString();
    const { error } = await client
      .from("aircraft_images")
      .upsert(photos.map((photo) => ({
        organization_id: organization,
        aircraft_id: photo.aircraftId,
        image_url: photo.imageUrl,
        source_name: "Planespotters.net",
        credit: photo.credit,
        source_page_url: photo.sourcePageUrl,
        approved_by_subject: actor.subject,
        approved_at: timestamp,
        updated_at: timestamp,
      })), { onConflict: "aircraft_id" });
    if (error) throw new FleetServiceError(`Could not save Planespotters aircraft photos: ${error.message}`);
  }

  return {
    checked: candidates.length,
    imported: photos.length,
    notFound,
    preserved: fleet.length - candidates.length,
    failed,
  };
}

export async function importFleetAircraft(
  actor: FleetActor,
  sourceLabel: string,
  importId: string,
  rows: FleetImportAircraftInput[],
): Promise<FleetImportResult> {
  const normalizedSource = requiredText(sourceLabel, "Import source", 3);
  if (!/^[0-9a-f-]{36}$/i.test(importId)) throw new FleetServiceError("Import ID is invalid.", 400);
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) {
    throw new FleetServiceError("Import between 1 and 500 aircraft at a time.", 400);
  }

  const registrations = new Set<string>();
  const normalizedRows = rows.map((row) => {
    const registration = requiredText(row.registration, "Registration", 2).toUpperCase();
    const aircraftModel = requiredText(row.aircraftModel, "Aircraft model", 2);
    if (!/^[A-Z0-9-]{2,16}$/.test(registration)) {
      throw new FleetServiceError("Each registration must use uppercase letters, numbers or hyphens.", 400);
    }
    if (registrations.has(registration)) throw new FleetServiceError(`Duplicate registration in import: ${registration}.`, 400);
    registrations.add(registration);
    if (row.sourceStatus !== "active" && row.sourceStatus !== "stored") {
      throw new FleetServiceError(`Source status for ${registration} must be Active or Stored.`, 400);
    }
    return {
      registration,
      aircraftModel,
      manufacturer: row.manufacturer?.trim() || undefined,
      aircraftFamily: row.aircraftFamily?.trim() || undefined,
      icaoType: row.icaoType?.trim().toUpperCase() || undefined,
      subfleet: row.subfleet?.trim() || undefined,
      operatorName: row.operatorName?.trim() || undefined,
      ownerName: row.ownerName?.trim() || undefined,
      sourceStatus: row.sourceStatus,
    };
  });

  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_import_aircraft", {
    p_organization_id: organization,
    p_rows: normalizedRows,
    p_source_label: normalizedSource,
    p_actor_subject: actor.subject,
    p_actor_role: actor.fleetRole,
    p_request_id: importId,
  });
  rpcError("Could not import aircraft", error);
  return data as FleetImportResult;
}

export async function transitionFleetAircraftStatus(aircraftId: string, actor: FleetActor, input: FleetStatusTransitionInput) {
  requiredText(input.reason, "Reason", 3);
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_transition_aircraft_status", {
    p_organization_id: organization,
    p_aircraft_id: aircraftId,
    p_expected_version: input.expectedVersion,
    p_operational_status: input.operationalStatus,
    p_technical_status: input.technicalStatus,
    p_dispatch_status: input.dispatchStatus,
    p_action: input.action,
    p_reason: input.reason.trim(),
    p_remarks: input.remarks?.trim() || null,
    p_station: input.station?.trim().toUpperCase() || null,
    p_effective_at: input.effectiveAt || null,
    p_actor_subject: actor.subject,
    p_actor_role: actor.fleetRole,
    p_request_id: requestId(),
    p_source: "website",
  });
  rpcError("Could not update aircraft status", error);
  return asDetail(data as AircraftRow);
}

export async function reportFleetDefect(aircraftId: string, actor: FleetActor, input: FleetDefectInput) {
  requiredText(input.category, "Defect category", 2);
  requiredText(input.description, "Defect description", 3);
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_report_defect", {
    p_organization_id: organization,
    p_aircraft_id: aircraftId,
    p_payload: input,
    p_actor_subject: actor.subject,
    p_actor_role: actor.fleetRole,
    p_request_id: requestId(),
  });
  rpcError("Could not report defect", error);
  return data as FleetDefect;
}

export async function transitionFleetDefect(defectId: string, actor: FleetActor, input: FleetDefectTransitionInput) {
  const actions = new Set(["review", "defer", "schedule_maintenance", "start_work", "await_parts", "rectify", "close", "void"]);
  if (!actions.has(input.action)) throw new FleetServiceError("Unsupported defect action.", 400);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) throw new FleetServiceError("Defect version is invalid. Refresh and try again.", 400);
  requiredText(input.notes, "Defect action note", 3);
  if (input.action === "defer") {
    if (!input.deferral || !["mel", "cdl", "airline_rule"].includes(input.deferral.kind)) throw new FleetServiceError("A MEL, CDL or airline-rule deferral kind is required.", 400);
    requiredText(input.deferral.reference, "Deferral reference", 2);
    requiredText(input.deferral.restriction, "Deferral restriction", 3);
  }
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_transition_defect", {
    p_organization_id: organization,
    p_defect_id: defectId,
    p_expected_version: input.expectedVersion,
    p_action: input.action,
    p_notes: input.notes.trim(),
    p_deferral: input.action === "defer" ? input.deferral : null,
    p_actor_subject: actor.subject,
    p_actor_role: actor.fleetRole,
    p_request_id: requestId(),
  });
  rpcError("Could not transition defect", error);
  return data as FleetDefect;
}

export async function createFleetMaintenanceEvent(aircraftId: string, actor: FleetActor, input: FleetMaintenanceInput) {
  requiredText(input.maintenanceType, "Maintenance type", 2);
  requiredText(input.reason, "Maintenance reason", 3);
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_create_maintenance_event", {
    p_organization_id: organization, p_aircraft_id: aircraftId, p_payload: input,
    p_actor_subject: actor.subject, p_actor_role: actor.fleetRole, p_request_id: requestId(),
  });
  rpcError("Could not create maintenance event", error);
  return data as FleetMaintenanceEvent;
}

export async function reportFleetDamage(aircraftId: string, actor: FleetActor, input: FleetDamageInput) {
  requiredText(input.location, "Damage location", 2);
  requiredText(input.damageType, "Damage type", 2);
  requiredText(input.description, "Damage description", 3);
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_report_damage", {
    p_organization_id: organization, p_aircraft_id: aircraftId, p_payload: input,
    p_actor_subject: actor.subject, p_actor_role: actor.fleetRole, p_request_id: requestId(),
  });
  rpcError("Could not report damage", error);
  return data as FleetDamageRecord;
}

export async function recordFleetHardLanding(aircraftId: string, actor: FleetActor, input: FleetHardLandingInput) {
  if (!Number.isFinite(input.landingFpm) || input.landingFpm > -500) {
    throw new FleetServiceError("A hard-landing assessment requires a touchdown rate of -500 fpm or lower.", 400);
  }
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_record_hard_landing", {
    p_organization_id: organization,
    p_aircraft_id: aircraftId,
    p_landing_fpm: Math.round(input.landingFpm),
    p_station: input.station?.trim().toUpperCase() || null,
    p_actor_subject: actor.subject,
    p_actor_role: actor.fleetRole,
    p_request_id: requestId(),
  });
  rpcError("Could not record hard-landing assessment", error);
  return data as FleetHardLandingAssessment;
}

export async function reserveFleetAircraftForFlight(aircraftId: string, actor: FleetActor, input: FleetFlightAssignmentInput) {
  const flight = flightActor(input);
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_reserve_aircraft_for_flight", {
    p_organization_id: organization,
    p_aircraft_id: aircraftId,
    p_pilot_subject: flight.pilotSubject,
    p_pilot_display_name: flight.pilotDisplayName,
    p_flight_reference: flight.flightReference,
    p_departure_station: flight.departureStation,
    p_arrival_station: flight.arrivalStation,
    p_actor_subject: actor.subject,
    p_actor_role: actor.fleetRole,
    p_request_id: requestId(),
  });
  rpcError("Could not reserve aircraft", error);
  return asFlightAssignment(data as FlightAssignmentRow);
}

export async function startFleetAircraftFlight(aircraftId: string, actor: FleetActor, input: FleetFlightAssignmentInput) {
  const flight = flightActor(input);
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_start_reserved_aircraft_flight", {
    p_organization_id: organization,
    p_aircraft_id: aircraftId,
    p_pilot_subject: flight.pilotSubject,
    p_flight_reference: flight.flightReference,
    p_actor_subject: actor.subject,
    p_actor_role: actor.fleetRole,
    p_request_id: requestId(),
  });
  rpcError("Could not start aircraft operation", error);
  return asFlightAssignment(data as FlightAssignmentRow);
}

export async function completeFleetAircraftFlight(aircraftId: string, actor: FleetActor, input: FleetFlightAssignmentInput) {
  const flight = flightActor(input);
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_complete_reserved_aircraft_flight", {
    p_organization_id: organization,
    p_aircraft_id: aircraftId,
    p_pilot_subject: flight.pilotSubject,
    p_flight_reference: flight.flightReference,
    p_arrival_station: flight.arrivalStation,
    p_actor_subject: actor.subject,
    p_actor_role: actor.fleetRole,
    p_request_id: requestId(),
  });
  rpcError("Could not complete aircraft operation", error);
  return asFlightAssignment(data as FlightAssignmentRow);
}

export async function cancelFleetAircraftReservation(aircraftId: string, actor: FleetActor, input: FleetFlightAssignmentInput) {
  const flight = flightActor(input);
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_cancel_aircraft_reservation", {
    p_organization_id: organization,
    p_aircraft_id: aircraftId,
    p_pilot_subject: flight.pilotSubject,
    p_flight_reference: flight.flightReference,
    p_actor_subject: actor.subject,
    p_actor_role: actor.fleetRole,
    p_request_id: requestId(),
  });
  rpcError("Could not release aircraft reservation", error);
  return asFlightAssignment(data as FlightAssignmentRow);
}

export async function startFleetRepaint(aircraftId: string, actor: FleetActor, input: FleetRepaintInput) {
  requiredText(input.newLivery, "New livery", 2);
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client.rpc("fleet_start_repaint", {
    p_organization_id: organization, p_aircraft_id: aircraftId, p_payload: input,
    p_actor_subject: actor.subject, p_actor_role: actor.fleetRole, p_request_id: requestId(),
  });
  rpcError("Could not start repaint", error);
  return data as FleetRepaint;
}

export async function getFleetAircraftRecord(aircraftId: string): Promise<FleetAircraftRecord | null> {
  const client = getServerClient();
  const organization = await organizationId(client);
  const detail = await getFleetAircraft(aircraftId);
  if (!detail) return null;
  const [availabilityResult, defectsResult, dueResult, maintenanceResult, damageResult, repaintResult, historyResult, logbookResult] = await Promise.all([
    client.rpc("fleet_aircraft_availability", { p_aircraft_id: aircraftId }),
    client.from("aircraft_defects").select("id, reference, reported_at, reporting_station, category, seat_number, description, severity, dispatch_impact, status, version, deferred_defects(id, deferral_kind, reference, restriction, operational_procedure, maintenance_procedure, due_at, due_cycles, due_hours_minutes)").eq("organization_id", organization).eq("aircraft_id", aircraftId).order("reported_at", { ascending: false }),
    client.rpc("fleet_maintenance_due", { p_aircraft_id: aircraftId }),
    client.from("maintenance_events").select("id, reference, maintenance_type, planned_start_at, estimated_completion_at, location, provider, reason, status, blocking, version").eq("organization_id", organization).eq("aircraft_id", aircraftId).order("created_at", { ascending: false }),
    client.from("aircraft_damage_records").select("id, reference, reported_at, station, location, damage_type, description, severity, status, version").eq("organization_id", organization).eq("aircraft_id", aircraftId).order("reported_at", { ascending: false }),
    client.from("aircraft_repaints").select("id, reference, new_livery, paint_facility, status, estimated_completion_at").eq("organization_id", organization).eq("aircraft_id", aircraftId).order("created_at", { ascending: false }),
    client.from("aircraft_status_history").select("id, operational_status, technical_status, dispatch_status, reason, remarks, station, effective_at, source, changed_by_subject").eq("organization_id", organization).eq("aircraft_id", aircraftId).order("effective_at", { ascending: false }).limit(50),
    client.from("aircraft_log_entries").select("id, reference, occurred_at, station, category, description, status").eq("organization_id", organization).eq("aircraft_id", aircraftId).order("occurred_at", { ascending: false }).limit(100),
  ]);
  rpcError("Could not calculate aircraft availability", availabilityResult.error);
  rpcError("Could not load aircraft defects", defectsResult.error);
  rpcError("Could not load maintenance due data", dueResult.error);
  rpcError("Could not load maintenance events", maintenanceResult.error);
  rpcError("Could not load damage records", damageResult.error);
  rpcError("Could not load repaint records", repaintResult.error);
  rpcError("Could not load status history", historyResult.error);
  rpcError("Could not load technical log", logbookResult.error);
  const availabilityRow = (availabilityResult.data?.[0] ?? {}) as { dispatch_status?: string; available?: boolean; reasons?: string[] };
  return {
    ...detail,
    availability: {
      dispatchStatus: availabilityRow.dispatch_status ?? detail.dispatchStatus,
      available: availabilityRow.available ?? detail.dispatchStatus !== "not_dispatchable",
      reasons: Array.isArray(availabilityRow.reasons) ? availabilityRow.reasons : [],
    },
    defects: (defectsResult.data ?? []).map((row) => {
      const item = row as Omit<FleetDefect, "deferral"> & { deferred_defects?: FleetDeferral[] | FleetDeferral | null };
      const deferred = Array.isArray(item.deferred_defects) ? item.deferred_defects[0] : item.deferred_defects;
      const { deferred_defects: _deferredDefects, ...defect } = item;
      return { ...defect, deferral: deferred ?? null } as FleetDefect;
    }),
    maintenanceDue: (dueResult.data ?? []) as FleetMaintenanceDue[],
    maintenanceEvents: (maintenanceResult.data ?? []) as FleetMaintenanceEvent[],
    damageRecords: (damageResult.data ?? []) as FleetDamageRecord[],
    repaints: (repaintResult.data ?? []) as FleetRepaint[],
    statusHistory: (historyResult.data ?? []) as FleetStatusHistoryEntry[],
    logbook: (logbookResult.data ?? []) as FleetLogEntry[],
  };
}

export async function ensureFleetMembership(input: {
  subject: string;
  displayName: string;
  websiteRole: string;
}) {
  const client = getServerClient();
  const organization = await organizationId(client);
  const roleCode = fleetRoleCodeForWebsiteRole(input.websiteRole);
  const { error } = await client.from("organization_memberships").upsert({
    organization_id: organization,
    external_subject: input.subject,
    display_name: input.displayName,
    role_code: roleCode,
    active: true,
  }, { onConflict: "organization_id,external_subject" });
  if (error) throw new FleetServiceError(`Could not synchronize fleet access: ${error.message}`);
}
