import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BAV_NETWORK_ICAO_BY_IATA } from "@/data/bav-network-2026";

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
  currentLivery: string | null;
  image: FleetAircraftImage | null;
};

function normaliseAircraftType(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function aircraftIcaoForVirtualType(value: string | null | undefined) {
  const normalized = normaliseAircraftType(value).toUpperCase();
  if (normalized.includes("777200") || normalized.includes("B772") || normalized.includes("B77E")) return "B772";
  if (normalized.includes("777300") || normalized.includes("B773") || normalized.includes("B77W")) return "B773";
  if (normalized.includes("7878") || normalized.includes("B788")) return "B788";
  if (normalized.includes("7879") || normalized.includes("B789")) return "B789";
  if (normalized.includes("78710") || normalized.includes("B78X")) return "B78X";
  if (normalized.includes("A319")) return "A319";
  if (normalized.includes("A320NEO") || normalized.includes("A20N")) return "A20N";
  if (normalized.includes("A320")) return "A320";
  if (normalized.includes("A321NEO") || normalized.includes("A21N")) return "A21N";
  if (normalized.includes("A321")) return "A321";
  if (normalized.includes("A350") || normalized.includes("A359") || normalized.includes("A35K")) return "A359";
  if (normalized.includes("E190")) return "E190";
  return null;
}

/** Matches a BAV service's approved virtual aircraft with a physical Fleet record. */
export function fleetAircraftMatchesVirtualType(aircraft: Pick<FleetAircraftSummary, "aircraftModel" | "icaoType">, virtualAircraft: string) {
  const requested = normaliseAircraftType(virtualAircraft);
  const fleetType = normaliseAircraftType(aircraft.aircraftModel);
  const requestedIcao = aircraftIcaoForVirtualType(virtualAircraft);
  if (requestedIcao && aircraft.icaoType?.toUpperCase() === requestedIcao) return true;
  return Boolean(requested && fleetType && (requested === fleetType || requested.includes(fleetType) || fleetType.includes(requested)));
}

/** A booking selector only offers registrations that Fleet currently marks safe to dispatch. */
export function isFleetAircraftBookable(aircraft: FleetAircraftSummary) {
  return aircraft.operationalStatus === "available" &&
    aircraft.technicalStatus === "serviceable" &&
    aircraft.dispatchStatus === "dispatchable" &&
    !aircraft.nextAssignedFlightReference;
}

const iataByIcao = new Map(Object.entries(BAV_NETWORK_ICAO_BY_IATA).map(([iata, icao]) => [icao, iata]));

function normaliseStation(value: string | null | undefined) {
  const station = value?.trim().toUpperCase() ?? "";
  return station ? iataByIcao.get(station) ?? station : null;
}

/** Treat an unassigned station as deployable, otherwise require the airframe to be at the departure airport. */
export function fleetAircraftIsAtStation(aircraft: Pick<FleetAircraftSummary, "currentStation">, departureStation: string) {
  const currentStation = normaliseStation(aircraft.currentStation);
  const departure = normaliseStation(departureStation);
  return !currentStation || !departure || currentStation === departure;
}

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
  deliveryDate: string | null;
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
  actual_start_at: string | null;
  estimated_completion_at: string | null;
  actual_completion_at: string | null;
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

export const FLEET_AIRFRAME_FAMILIARITY_LEVELS = [
  { key: "new", label: "New", minimumFlights: 0 },
  { key: "familiar", label: "Familiar", minimumFlights: 1 },
  { key: "bronze", label: "Bronze", minimumFlights: 5 },
  { key: "silver", label: "Silver", minimumFlights: 15 },
  { key: "gold", label: "Gold", minimumFlights: 30 },
  { key: "master", label: "Master", minimumFlights: 50 },
] as const;

export type FleetPublicFlight = {
  id: string;
  flightReference: string;
  departureStation: string | null;
  arrivalStation: string | null;
  offBlockAt: string | null;
  onBlockAt: string | null;
  blockMinutes: number;
  flightCycles: number;
  pilotName: string | null;
};

export type FleetAircraftTimelineEvent = {
  id: string;
  occurredAt: string;
  kind: "fleet" | "flight" | "milestone" | "maintenance" | "livery" | "status";
  title: string;
  detail: string;
};

export type FleetAircraftSectorMilestone = {
  target: number;
  label: string;
  achievedAt: string | null;
  flightReference: string | null;
};

export type PilotAircraftPassport = {
  registrations: Array<{
    registration: string;
    aircraftModel: string | null;
    flights: number;
    blockMinutes: number;
    distanceNm: number;
    firstFlightAt: string | null;
    latestFlightAt: string | null;
    activeFleetRecord: boolean;
    currentStation: string | null;
  }>;
  collections: Array<{
    aircraftModel: string;
    collected: number;
    fleetTotal: number;
  }>;
};

export type FleetAircraftProfile = {
  aircraft: FleetAircraftDetail;
  configuration: { code: string; name: string; cabinLayoutId: string | null; cabinDefinition: unknown } | null;
  statistics: { sectors: number; distanceNm: number | null; flightHoursMinutes: number; cycles: number; reliability: null };
  operation: {
    state: "airborne" | "operating" | "assigned" | "maintenance" | "unavailable" | "turnaround" | "parked";
    airport: string | null;
    updatedAt: string | null;
    liveTelemetry: { latitude: number; longitude: number; altitudeFt: number; groundSpeedKt: number } | null;
    previousFlight: FleetPublicFlight | null;
    nextAssignment: FleetFlightAssignment | null;
  };
  maintenance: {
    serviceability: "serviceable" | "limited_service" | "maintenance_due" | "in_maintenance" | "aog" | "out_of_service";
    openDefects: number;
    deferredDefects: Array<{ reference: string; category: string; status: string; restriction: string | null }>;
    nextDue: FleetMaintenanceDue | null;
    lastMaintenanceAt: string | null;
  };
  recentFlights: FleetPublicFlight[];
  timeline: FleetAircraftTimelineEvent[];
  sectorMilestones: FleetAircraftSectorMilestone[];
  logbook: Array<{ id: string; occurredAt: string; category: "flight" | "maintenance" | "technical" | "livery" | "status"; title: string; detail: string; station: string | null }>;
  pilotHistory: {
    flights: number;
    blockMinutes: number;
    distanceNm: number;
    destinations: number;
    firstFlightAt: string | null;
    latestFlightAt: string | null;
    longestFlight: { flightReference: string; route: string; distanceNm: number } | null;
    mostCommonRoute: string | null;
    percentageOfPilotFlights: number | null;
    familiarity: (typeof FLEET_AIRFRAME_FAMILIARITY_LEVELS)[number];
  } | null;
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
  delivery_date: string | null;
  engine_data: unknown;
  apu_data: unknown;
};

type AircraftFlightRow = {
  id: string;
  external_event_id: string;
  flight_reference: string;
  departure_station: string | null;
  arrival_station: string | null;
  off_block_at: string | null;
  on_block_at: string | null;
  block_minutes: number;
  flight_cycles: number;
};

type AcarsProfileSessionRow = {
  id: string;
  flight_number: string;
  departure_station: string;
  arrival_station: string;
  started_at: string;
  completed_at: string | null;
  distance_nm: number;
  updated_at: string;
  last_snapshot: unknown;
};

type PirepMetricRow = {
  acars_session_id: string | null;
  flight_number: string;
  departure_station: string;
  arrival_station: string;
  completed_at: string;
  block_minutes: number;
  distance_nm: number;
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
    currentLivery: row.current_livery,
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
    deliveryDate: row.delivery_date,
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
  const findOrganization = () => client
    .from("organizations")
    .select("id")
    .eq("code", ORGANIZATION_CODE)
    .maybeSingle();

  const { data, error } = await findOrganization();
  if (error) throw new FleetServiceError(`Could not load fleet organization: ${error.message}`);
  if (data?.id) return String(data.id);

  // A clean production database contains the fleet schema but no tenant data.
  // Bootstrap BAV once so the first authorised fleet action can proceed without
  // a manual SQL seed. A concurrent first request is handled by the retry below.
  const { data: created, error: createError } = await client
    .from("organizations")
    .insert({ code: ORGANIZATION_CODE, name: "British Airways Virtual" })
    .select("id")
    .single();
  if (created?.id) return String(created.id);

  if (createError?.code === "23505") {
    const { data: concurrent, error: concurrentError } = await findOrganization();
    if (concurrentError) throw new FleetServiceError(`Could not load fleet organization: ${concurrentError.message}`);
    if (concurrent?.id) return String(concurrent.id);
  }

  throw new FleetServiceError(`Could not initialize fleet organization: ${createError?.message ?? "No organization ID was returned."}`, 503);
}

export function fleetRoleCodeForWebsiteRole(websiteRole: string) {
  if (websiteRole === "admin") return "airline_administrator";
  if (websiteRole === "operations") return "operations_controller";
  if (websiteRole === "pilot") return "pilot";
  return "viewer";
}

const summaryFields = "id, registration, aircraft_model, variant, icao_type, subfleet, current_station, operational_status, technical_status, dispatch_status, airframe_hours_minutes, airframe_cycles, last_flight_at, next_assigned_flight_reference, status_version, current_livery";
const detailFields = `${summaryFields}, fleet_number, aircraft_family, manufacturer, msn, home_base, current_livery, configuration_id, entry_into_service_date, delivery_date, engine_data, apu_data`;

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

/** Looks up an individual airframe by its public registration, never by a browser-supplied database ID. */
export async function getFleetAircraftByRegistration(registrationInput: string): Promise<FleetAircraftDetail | null> {
  const registration = registrationInput.trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,16}$/.test(registration)) return null;
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client
    .from("aircraft")
    .select(detailFields)
    .eq("organization_id", organization)
    .eq("registration", registration)
    .maybeSingle();
  if (error) throw new FleetServiceError(`Could not load aircraft: ${error.message}`);
  if (!data) return null;
  const row = data as AircraftRow;
  const images = await fleetImagesByAircraft(client, organization, [row.id]);
  return asDetail(row, images.get(row.id));
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

/**
 * Returns the single registration currently reserved or operated by a pilot.
 * This is deliberately server-side so Cabin Control can restore a valid fleet
 * assignment after an app restart without trusting a locally cached tail.
 */
export async function getActiveFleetFlightAssignmentForPilot(actor: FleetActor): Promise<FleetFlightAssignment | null> {
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client
    .from("aircraft_flight_assignments")
    .select("id, aircraft_id, pilot_subject, pilot_display_name, flight_reference, departure_station, arrival_station, status, reserved_at, off_block_at, on_block_at, block_minutes")
    .eq("organization_id", organization)
    .eq("pilot_subject", actor.subject.trim().toUpperCase())
    .in("status", ["reserved", "operating"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new FleetServiceError(`Could not load your active aircraft assignment: ${error.message}`);
  return data ? asFlightAssignment(data as FlightAssignmentRow) : null;
}

/**
 * Verifies a pilot's own completed registration assignment before a
 * post-flight technical observation can enter the existing Fleet log.
 * The website never trusts a registration supplied by the browser alone.
 */
export async function getFleetFlightAssignmentForPilotAndFlight(input: { pilotSubject: string; aircraftId: string; flightReference: string }): Promise<FleetFlightAssignment | null> {
  const pilotSubject = input.pilotSubject.trim().toUpperCase();
  const flightReference = input.flightReference.trim().toUpperCase();
  if (!pilotSubject || !flightReference || !/^[0-9a-f-]{20,80}$/i.test(input.aircraftId)) return null;
  const client = getServerClient();
  const organization = await organizationId(client);
  const { data, error } = await client
    .from("aircraft_flight_assignments")
    .select("id, aircraft_id, pilot_subject, pilot_display_name, flight_reference, departure_station, arrival_station, status, reserved_at, off_block_at, on_block_at, block_minutes")
    .eq("organization_id", organization)
    .eq("aircraft_id", input.aircraftId)
    .eq("pilot_subject", pilotSubject)
    .eq("flight_reference", flightReference)
    .in("status", ["reserved", "operating", "completed"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new FleetServiceError(`Could not verify the Fleet assignment: ${error.message}`);
  return data ? asFlightAssignment(data as FlightAssignmentRow) : null;
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
    client.from("maintenance_events").select("id, reference, maintenance_type, planned_start_at, actual_start_at, estimated_completion_at, actual_completion_at, location, provider, reason, status, blocking, version").eq("organization_id", organization).eq("aircraft_id", aircraftId).order("created_at", { ascending: false }),
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

function publicFlight(row: AircraftFlightRow, assignment?: FlightAssignmentRow): FleetPublicFlight {
  return {
    id: row.id,
    flightReference: row.flight_reference,
    departureStation: row.departure_station,
    arrivalStation: row.arrival_station,
    offBlockAt: row.off_block_at,
    onBlockAt: row.on_block_at,
    blockMinutes: row.block_minutes,
    flightCycles: row.flight_cycles,
    pilotName: assignment?.pilot_display_name ?? null,
  };
}

function profileTelemetry(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  const number = (field: string) => typeof snapshot[field] === "number" && Number.isFinite(snapshot[field]) ? snapshot[field] : null;
  const latitude = number("latitude");
  const longitude = number("longitude");
  const altitudeFt = number("altitudeFt");
  const groundSpeedKt = number("groundSpeedKt");
  if (latitude == null || longitude == null || altitudeFt == null || groundSpeedKt == null) return null;
  return { latitude, longitude, altitudeFt, groundSpeedKt, onGround: snapshot.onGround === true };
}

function registrationFromSnapshot(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const registration = (value as Record<string, unknown>).registration;
  if (typeof registration !== "string") return null;
  const normalized = registration.trim().toUpperCase();
  return /^[A-Z0-9-]{2,16}$/.test(normalized) ? normalized : null;
}

function familiarityForFlights(flights: number) {
  return [...FLEET_AIRFRAME_FAMILIARITY_LEVELS].reverse().find((level) => flights >= level.minimumFlights) ?? FLEET_AIRFRAME_FAMILIARITY_LEVELS[0];
}

function publicServiceability(record: FleetAircraftRecord): FleetAircraftProfile["maintenance"]["serviceability"] {
  if (["aog", "grounded"].includes(record.technicalStatus)) return "aog";
  if (["in_maintenance", "scheduled_maintenance", "awaiting_parts", "awaiting_engineering", "damage_inspection", "repaint"].includes(record.technicalStatus)) return "in_maintenance";
  if (record.dispatchStatus === "not_dispatchable" || record.operationalStatus === "retired") return "out_of_service";
  if (record.maintenanceDue.some((item) => item.due_status === "overdue")) return "maintenance_due";
  if (record.technicalStatus === "serviceable_with_deferred_defects" || record.dispatchStatus === "dispatchable_with_restrictions") return "limited_service";
  return "serviceable";
}

async function pilotHistoryForAircraft(client: SupabaseClient, registration: string, pilotId: string): Promise<FleetAircraftProfile["pilotHistory"]> {
  const [sessionsResult, totalPirepsResult] = await Promise.all([
    client.from("acars_sessions")
      .select("id, flight_number, departure_station, arrival_station, started_at, completed_at, distance_nm, updated_at, last_snapshot")
      .eq("pilot_id", pilotId)
      .eq("status", "completed")
      .contains("last_snapshot", { registration })
      .order("completed_at", { ascending: true }),
    client.from("pilot_pireps").select("id", { count: "exact", head: true }).eq("pilot_id", pilotId).eq("status", "accepted"),
  ]);
  if (sessionsResult.error) throw new FleetServiceError(`Could not load pilot airframe history: ${sessionsResult.error.message}`);
  if (totalPirepsResult.error) throw new FleetServiceError(`Could not load pilot career totals: ${totalPirepsResult.error.message}`);
  const sessions = (sessionsResult.data ?? []) as AcarsProfileSessionRow[];
  if (!sessions.length) return { flights: 0, blockMinutes: 0, distanceNm: 0, destinations: 0, firstFlightAt: null, latestFlightAt: null, longestFlight: null, mostCommonRoute: null, percentageOfPilotFlights: totalPirepsResult.count ? 0 : null, familiarity: familiarityForFlights(0) };

  const { data: pirepData, error: pirepError } = await client.from("pilot_pireps")
    .select("acars_session_id, flight_number, departure_station, arrival_station, completed_at, block_minutes, distance_nm")
    .eq("pilot_id", pilotId)
    .eq("status", "accepted")
    .in("acars_session_id", sessions.map((session) => session.id));
  if (pirepError) throw new FleetServiceError(`Could not load accepted pilot airframe history: ${pirepError.message}`);
  const flights = (pirepData ?? []) as PirepMetricRow[];
  const routeCounts = new Map<string, number>();
  const destinations = new Set<string>();
  let longestFlight: { flightReference: string; route: string; distanceNm: number } | null = null;
  for (const flight of flights) {
    const route = `${flight.departure_station} → ${flight.arrival_station}`;
    routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
    destinations.add(flight.arrival_station);
    if (!longestFlight || flight.distance_nm > longestFlight.distanceNm) longestFlight = { flightReference: flight.flight_number, route, distanceNm: flight.distance_nm };
  }
  const mostCommonRoute = [...routeCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  const totalPireps = totalPirepsResult.count ?? 0;
  return {
    flights: flights.length,
    blockMinutes: flights.reduce((total, flight) => total + Math.max(0, flight.block_minutes), 0),
    distanceNm: flights.reduce((total, flight) => total + Math.max(0, flight.distance_nm), 0),
    destinations: destinations.size,
    firstFlightAt: flights[0]?.completed_at ?? null,
    latestFlightAt: flights.at(-1)?.completed_at ?? null,
    longestFlight,
    mostCommonRoute,
    percentageOfPilotFlights: totalPireps ? Math.round((flights.length / totalPireps) * 1000) / 10 : null,
    familiarity: familiarityForFlights(flights.length),
  };
}

/**
 * Derives a pilot's registration collection from accepted PIREPs and their
 * matching completed ACARS sessions. There is deliberately no second passport
 * table to keep in sync with flight records.
 */
export async function getPilotAircraftPassport(pilotId: string): Promise<PilotAircraftPassport> {
  const client = getServerClient();
  const sessionsResult = await client.from("acars_sessions")
    .select("id, completed_at, last_snapshot")
    .eq("pilot_id", pilotId)
    .eq("status", "completed")
    .order("completed_at", { ascending: true });
  if (sessionsResult.error) throw new FleetServiceError(`Could not load Aircraft Passport sessions: ${sessionsResult.error.message}`);
  const sessions = (sessionsResult.data ?? []) as Array<Pick<AcarsProfileSessionRow, "id" | "completed_at" | "last_snapshot">>;
  if (!sessions.length) return { registrations: [], collections: [] };

  const pirepsResult = await client.from("pilot_pireps")
    .select("acars_session_id, flight_number, departure_station, arrival_station, completed_at, block_minutes, distance_nm")
    .eq("pilot_id", pilotId)
    .eq("status", "accepted")
    .in("acars_session_id", sessions.map((session) => session.id));
  if (pirepsResult.error) throw new FleetServiceError(`Could not load accepted Aircraft Passport flights: ${pirepsResult.error.message}`);
  const pirepsBySession = new Map<string, PirepMetricRow>();
  for (const pirep of (pirepsResult.data ?? []) as PirepMetricRow[]) {
    if (pirep.acars_session_id) pirepsBySession.set(pirep.acars_session_id, pirep);
  }

  const grouped = new Map<string, { registration: string; flights: number; blockMinutes: number; distanceNm: number; firstFlightAt: string | null; latestFlightAt: string | null }>();
  for (const session of sessions) {
    const registration = registrationFromSnapshot(session.last_snapshot);
    const pirep = pirepsBySession.get(session.id);
    if (!registration || !pirep) continue;
    const existing = grouped.get(registration) ?? { registration, flights: 0, blockMinutes: 0, distanceNm: 0, firstFlightAt: null, latestFlightAt: null };
    const completedAt = pirep.completed_at || session.completed_at;
    existing.flights += 1;
    existing.blockMinutes += Math.max(0, pirep.block_minutes);
    existing.distanceNm += Math.max(0, pirep.distance_nm);
    if (completedAt && (!existing.firstFlightAt || completedAt < existing.firstFlightAt)) existing.firstFlightAt = completedAt;
    if (completedAt && (!existing.latestFlightAt || completedAt > existing.latestFlightAt)) existing.latestFlightAt = completedAt;
    grouped.set(registration, existing);
  }

  const fleet = await listFleetAircraft();
  const aircraftByRegistration = new Map(fleet.map((aircraft) => [aircraft.registration.toUpperCase(), aircraft]));
  const fleetTotals = new Map<string, number>();
  for (const aircraft of fleet) fleetTotals.set(aircraft.aircraftModel, (fleetTotals.get(aircraft.aircraftModel) ?? 0) + 1);
  const collectedByModel = new Map<string, Set<string>>();
  const registrations = [...grouped.values()].map((entry) => {
    const aircraft = aircraftByRegistration.get(entry.registration);
    if (aircraft) {
      const collected = collectedByModel.get(aircraft.aircraftModel) ?? new Set<string>();
      collected.add(entry.registration);
      collectedByModel.set(aircraft.aircraftModel, collected);
    }
    return { ...entry, aircraftModel: aircraft?.aircraftModel ?? null, activeFleetRecord: Boolean(aircraft), currentStation: aircraft?.currentStation ?? null };
  }).sort((left, right) => (right.latestFlightAt ?? "").localeCompare(left.latestFlightAt ?? "") || left.registration.localeCompare(right.registration));
  const collections = [...collectedByModel.entries()]
    .map(([aircraftModel, collected]) => ({ aircraftModel, collected: collected.size, fleetTotal: fleetTotals.get(aircraftModel) ?? collected.size }))
    .sort((left, right) => left.aircraftModel.localeCompare(right.aircraftModel));
  return { registrations, collections };
}

/**
 * The pilot-safe aircraft read model. It composes existing Fleet, ACARS and
 * PIREP records without adding a second source of truth for an airframe.
 */
export async function getFleetAircraftProfile(registrationInput: string, pilotId?: string | null): Promise<FleetAircraftProfile | null> {
  const aircraft = await getFleetAircraftByRegistration(registrationInput);
  if (!aircraft) return null;
  const client = getServerClient();
  const organization = await organizationId(client);
  const [record, configurationResult, sectorCountResult, recentFlightsResult, activeAssignmentResult, liveSessionResult, telemetryDistanceResult, pilotHistory] = await Promise.all([
    getFleetAircraftRecord(aircraft.id),
    aircraft.configurationId ? client.from("aircraft_configurations").select("code, name, cabin_layout_id, cabin_definition").eq("organization_id", organization).eq("id", aircraft.configurationId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    client.from("aircraft_flights").select("id", { count: "exact", head: true }).eq("organization_id", organization).eq("aircraft_id", aircraft.id),
    client.from("aircraft_flights").select("id, external_event_id, flight_reference, departure_station, arrival_station, off_block_at, on_block_at, block_minutes, flight_cycles").eq("organization_id", organization).eq("aircraft_id", aircraft.id).order("on_block_at", { ascending: false }).range(0, 29),
    client.from("aircraft_flight_assignments").select("id, aircraft_id, pilot_subject, pilot_display_name, flight_reference, departure_station, arrival_station, status, reserved_at, off_block_at, on_block_at, block_minutes").eq("organization_id", organization).eq("aircraft_id", aircraft.id).in("status", ["reserved", "operating"]).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("acars_sessions").select("id, flight_number, departure_station, arrival_station, started_at, completed_at, distance_nm, updated_at, last_snapshot").eq("status", "active").contains("last_snapshot", { registration: aircraft.registration }).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("acars_sessions").select("distance_nm").eq("status", "completed").contains("last_snapshot", { registration: aircraft.registration }),
    pilotId ? pilotHistoryForAircraft(client, aircraft.registration, pilotId) : Promise.resolve(null),
  ]);
  if (!record) return null;
  if (configurationResult.error) throw new FleetServiceError(`Could not load aircraft configuration: ${configurationResult.error.message}`);
  if (sectorCountResult.error) throw new FleetServiceError(`Could not count BAV sectors: ${sectorCountResult.error.message}`);
  if (recentFlightsResult.error) throw new FleetServiceError(`Could not load recent aircraft flights: ${recentFlightsResult.error.message}`);
  if (activeAssignmentResult.error) throw new FleetServiceError(`Could not load aircraft assignment: ${activeAssignmentResult.error.message}`);
  if (liveSessionResult.error) throw new FleetServiceError(`Could not load live aircraft telemetry: ${liveSessionResult.error.message}`);
  if (telemetryDistanceResult.error) throw new FleetServiceError(`Could not load aircraft telemetry distance: ${telemetryDistanceResult.error.message}`);

  const recentRows = (recentFlightsResult.data ?? []) as AircraftFlightRow[];
  const flightEventIds = recentRows.map((flight) => flight.external_event_id);
  const assignmentResult = flightEventIds.length
    ? await client.from("aircraft_flight_assignments").select("id, aircraft_id, pilot_subject, pilot_display_name, flight_reference, departure_station, arrival_station, status, reserved_at, off_block_at, on_block_at, block_minutes").eq("organization_id", organization).in("id", flightEventIds)
    : { data: [], error: null };
  if (assignmentResult.error) throw new FleetServiceError(`Could not load flight crews: ${assignmentResult.error.message}`);
  const assignmentsById = new Map(((assignmentResult.data ?? []) as FlightAssignmentRow[]).map((assignment) => [assignment.id, assignment]));
  const recentFlights = recentRows.map((flight) => publicFlight(flight, assignmentsById.get(flight.external_event_id)));
  const activeAssignment = activeAssignmentResult.data ? asFlightAssignment(activeAssignmentResult.data as FlightAssignmentRow) : null;
  const liveSession = liveSessionResult.data as AcarsProfileSessionRow | null;
  const telemetry = profileTelemetry(liveSession?.last_snapshot);
  const serviceability = publicServiceability(record);
  const activeMaintenance = record.maintenanceEvents.some((event) => !["completed", "released", "cancelled"].includes(event.status));
  const state = telemetry && !telemetry.onGround ? "airborne" as const
    : activeAssignment?.status === "operating" ? "operating" as const
      : activeAssignment?.status === "reserved" ? "assigned" as const
        : activeMaintenance ? "maintenance" as const
          : !record.availability.available ? "unavailable" as const
            : record.operationalStatus === "turnaround" ? "turnaround" as const
              : "parked" as const;
  const openDefects = record.defects.filter((defect) => !["closed", "voided", "rectified"].includes(defect.status));
  const nextDue = [...record.maintenanceDue].sort((left, right) => (left.due_status === "overdue" ? -1 : right.due_status === "overdue" ? 1 : left.due_status === "due_soon" ? -1 : right.due_status === "due_soon" ? 1 : left.task_code.localeCompare(right.task_code)))[0] ?? null;
  const lastMaintenance = record.maintenanceEvents.find((event) => ["completed", "released"].includes(event.status));
  const telemetryDistance = ((telemetryDistanceResult.data ?? []) as Array<{ distance_nm: number | null }>).reduce((total, session) => total + Math.max(0, Number(session.distance_nm) || 0), 0);
  const sectorCount = sectorCountResult.count ?? 0;
  const milestoneDefinitions = [
    { target: 1, label: "First BAV sector" },
    { target: 100, label: "100 BAV sectors" },
    { target: 500, label: "500 BAV sectors" },
    { target: 1000, label: "1,000 BAV sectors" },
  ] as const;
  const milestoneResults = await Promise.all(milestoneDefinitions.map((milestone) => sectorCount >= milestone.target
    ? client.from("aircraft_flights").select("flight_reference, off_block_at, on_block_at").eq("organization_id", organization).eq("aircraft_id", aircraft.id).order("on_block_at", { ascending: true }).range(milestone.target - 1, milestone.target - 1).maybeSingle()
    : Promise.resolve({ data: null, error: null }),
  ));
  if (milestoneResults.some((result) => result.error)) throw new FleetServiceError("Could not calculate aircraft sector milestones.");
  const sectorMilestones = milestoneDefinitions.map((milestone, index) => {
    const flight = milestoneResults[index].data as Pick<AircraftFlightRow, "flight_reference" | "off_block_at" | "on_block_at"> | null;
    return { target: milestone.target, label: milestone.label, achievedAt: flight?.on_block_at ?? flight?.off_block_at ?? null, flightReference: flight?.flight_reference ?? null };
  });
  const timeline: FleetAircraftTimelineEvent[] = [
    ...(aircraft.entryIntoServiceDate ? [{ id: "fleet-entry", occurredAt: aircraft.entryIntoServiceDate, kind: "fleet" as const, title: "Entered the BAV Fleet", detail: "Fleet entry recorded for this simulated airframe." }] : []),
    ...sectorMilestones.filter((milestone) => milestone.achievedAt).map((milestone) => ({ id: `sector-${milestone.target}`, occurredAt: milestone.achievedAt!, kind: milestone.target === 1 ? "flight" as const : "milestone" as const, title: milestone.label, detail: milestone.flightReference ? `${milestone.flightReference} recorded this fleet milestone.` : "Fleet flight record reached this milestone." })),
    ...record.maintenanceEvents.filter((event) => ["completed", "released"].includes(event.status)).map((event) => ({ id: `maintenance-${event.id}`, occurredAt: event.actual_completion_at ?? event.actual_start_at ?? event.planned_start_at ?? "", kind: "maintenance" as const, title: `${event.maintenance_type} maintenance completed`, detail: event.location ? `Completed at ${event.location}.` : "Maintenance completion recorded." })).filter((event) => event.occurredAt),
    ...record.repaints.filter((repaint) => ["completed", "released"].includes(repaint.status)).map((repaint) => ({ id: `repaint-${repaint.id}`, occurredAt: repaint.estimated_completion_at ?? "", kind: "livery" as const, title: `Livery applied: ${repaint.new_livery}`, detail: repaint.paint_facility ? `Completed at ${repaint.paint_facility}.` : "Livery change recorded." })).filter((event) => event.occurredAt),
    ...record.statusHistory.filter((entry) => entry.technical_status === "serviceable" && entry.dispatch_status !== "not_dispatchable").map((entry) => ({ id: `return-${entry.id}`, occurredAt: entry.effective_at, kind: "status" as const, title: "Returned to service", detail: entry.station ? `Serviceable at ${entry.station}.` : "Serviceable status recorded." })),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 18);
  const logbook = [
    ...recentFlights.map((flight) => ({ id: `flight-${flight.id}`, occurredAt: flight.onBlockAt ?? flight.offBlockAt ?? new Date(0).toISOString(), category: "flight" as const, title: `${flight.flightReference} completed`, detail: `${flight.departureStation ?? "—"} → ${flight.arrivalStation ?? "—"}${flight.pilotName ? ` · ${flight.pilotName}` : ""}`, station: flight.arrivalStation })),
    ...record.maintenanceEvents.slice(0, 10).map((event) => ({ id: `maintenance-${event.id}`, occurredAt: event.actual_completion_at ?? event.actual_start_at ?? event.planned_start_at ?? new Date(0).toISOString(), category: "maintenance" as const, title: `${event.maintenance_type} maintenance`, detail: event.status.replaceAll("_", " "), station: event.location })),
    ...openDefects.slice(0, 10).map((defect) => ({ id: `defect-${defect.id}`, occurredAt: defect.reported_at, category: "technical" as const, title: `${defect.category} technical record`, detail: defect.status.replaceAll("_", " "), station: defect.reporting_station })),
    ...record.repaints.slice(0, 5).map((repaint) => ({ id: `repaint-${repaint.id}`, occurredAt: repaint.estimated_completion_at ?? new Date(0).toISOString(), category: "livery" as const, title: `Livery: ${repaint.new_livery}`, detail: repaint.status.replaceAll("_", " "), station: repaint.paint_facility })),
    ...record.statusHistory.slice(0, 10).map((entry) => ({ id: `status-${entry.id}`, occurredAt: entry.effective_at, category: "status" as const, title: "Operational status updated", detail: `${entry.operational_status.replaceAll("_", " ")} · ${entry.technical_status.replaceAll("_", " ")}`, station: entry.station })),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 30);

  const configuration = configurationResult.data as { code: string; name: string; cabin_layout_id: string | null; cabin_definition: unknown } | null;
  return {
    aircraft,
    configuration: configuration ? { code: configuration.code, name: configuration.name, cabinLayoutId: configuration.cabin_layout_id, cabinDefinition: configuration.cabin_definition } : null,
    statistics: { sectors: sectorCount, distanceNm: telemetryDistance || null, flightHoursMinutes: aircraft.airframeHoursMinutes, cycles: aircraft.airframeCycles, reliability: null },
    operation: { state, airport: state === "airborne" && liveSession ? `${liveSession.departure_station} → ${liveSession.arrival_station}` : aircraft.currentStation, updatedAt: liveSession?.updated_at ?? activeAssignment?.offBlockAt ?? activeAssignment?.reservedAt ?? aircraft.lastFlightAt, liveTelemetry: telemetry ? { latitude: telemetry.latitude, longitude: telemetry.longitude, altitudeFt: telemetry.altitudeFt, groundSpeedKt: telemetry.groundSpeedKt } : null, previousFlight: recentFlights[0] ?? null, nextAssignment: activeAssignment },
    maintenance: { serviceability, openDefects: openDefects.length, deferredDefects: openDefects.filter((defect) => defect.deferral).map((defect) => ({ reference: defect.reference, category: defect.category, status: defect.status, restriction: defect.deferral?.restriction ?? null })), nextDue, lastMaintenanceAt: lastMaintenance?.actual_completion_at ?? lastMaintenance?.actual_start_at ?? lastMaintenance?.planned_start_at ?? null },
    recentFlights,
    timeline,
    sectorMilestones,
    logbook,
    pilotHistory,
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
