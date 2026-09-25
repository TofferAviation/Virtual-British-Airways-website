import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPilotBooking, getPilotFlightPlan } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
import { getPilotAircraftEligibility } from "@/lib/pilot-ranks";
import { getManagedRoutes } from "@/lib/route-store";
import { getSimbriefCodes, isSimbriefApiConfigured } from "@/lib/simbrief";
import { changeBookingAircraft, openSimbriefDispatch, syncSimbriefFlightPlan } from "./actions";
import { SimbriefDispatchButton } from "./SimbriefDispatchButton";
import { FlightPlanBriefing } from "./FlightPlanBriefing";
import "./flight-plan.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Flight planning" };

export default async function FlightPlanPage({ params, searchParams }: { params: Promise<{ bookingId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ bookingId }, query] = await Promise.all([params, searchParams]);
  const session = await requirePilotSession();
  const [booking, pilot, flightPlan, routes] = await Promise.all([getPilotBooking(bookingId, session.pilotId), getPilotById(session.pilotId), getPilotFlightPlan(bookingId, session.pilotId), getManagedRoutes()]);
  if (!booking || !pilot || !flightPlan) notFound();
  if (booking.status === "cancelled") redirect("/book");
  const error = typeof query.error === "string" ? query.error : "";
  const protectedAssignment = query.protected === "1";
  const synced = query.synced === "1";
  const aircraftUpdated = query.aircraftUpdated === "1";
  const aircraftError = ["aircraft-change", "aircraft-qualification", "aircraft-started", "registration-locked"].includes(error);
  const registrationUnavailable = error === "registration-unavailable";
  const route = booking.routeId ? routes.find((item) => item.id === booking.routeId && item.active && !item.catalogueOnly) : null;
  const approvedAircraft = route ? Array.from(new Set([route.aircraft, ...(route.aircraftOptions ?? [])])) : [booking.aircraft];
  const eligibleAircraft = approvedAircraft.filter((aircraft) => getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft }).eligible);
  const codes = getSimbriefCodes(booking);
  const canDispatch = Boolean(pilot.simbriefPilotId && codes.origin && codes.destination && codes.aircraft);
  const officialDispatchConfigured = isSimbriefApiConfigured();
  const safeOfpUrl = flightPlan.simbriefOfpUrl?.startsWith("https://") ? flightPlan.simbriefOfpUrl : null;

  return <><SiteHeader /><main className="page-shell flight-plan-page"><div className="page-container flight-plan-container">
    <div className="booking-steps"><div className="booking-step"><span>1</span>Choose virtual flight</div><div className="booking-step active"><span>2</span>Flight briefing</div><div className="booking-step"><span>3</span>Confirm assignment</div></div>
    <section className="flight-plan-hero"><div><span className="section-kicker">BAV FLIGHT PLANNING</span><h1>{booking.flightNumber} · {booking.from} → {booking.to}</h1><p>Your BAV assignment is saved. Prepare the dispatch below before you fly.</p></div><Link className="button button-outline" href="/account">View account</Link></section>
    {protectedAssignment ? <div className="flight-plan-notice success"><strong>Your active BAV flight is protected.</strong> It was kept in place instead of being replaced. Complete it before selecting another service.</div> : null}
    {synced ? <div className="flight-plan-notice success"><strong>Flight plan saved to your BAV account.</strong> The latest matching SimBrief OFP is now linked to this assignment.</div> : null}
    {aircraftUpdated ? <div className="flight-plan-notice success"><strong>Virtual aircraft updated.</strong> Generate a fresh SimBrief OFP for {booking.aircraft} before beginning the Ember flight.</div> : null}
    {aircraftError ? <div className="flight-plan-notice error"><strong>Aircraft change unavailable.</strong> {error === "aircraft-started" ? "The aircraft is locked once an Ember flight has begun." : error === "registration-locked" ? `The aircraft is locked because ${booking.registration ?? "a registration"} has already been reserved for this flight.` : error === "aircraft-qualification" ? "Your BAV rank or type ratings do not permit that aircraft." : "Choose the published aircraft or an Operations-approved virtual substitute."}</div> : null}
    {registrationUnavailable ? <div className="flight-plan-notice error"><strong>Registration not reserved.</strong> Another pilot selected it first, so your BAV flight was kept protected without an airframe. Choose a registration in Ember when one is available.</div> : null}
    {error && !aircraftError ? <div className="flight-plan-notice error"><strong>Plan not synced.</strong> {error}</div> : null}
    <div className="flight-plan-grid"><section className="flight-plan-card"><span className="flight-plan-label">Selected BAV service</span><h2>{booking.flightNumber} · {booking.aircraft}</h2><div className="flight-plan-details"><div><span>Departure</span><strong>{booking.from} {codes.origin ? `(${codes.origin})` : ""}</strong><small>{booking.departure} local · {booking.date}</small></div><div><span>Arrival</span><strong>{booking.to} {codes.destination ? `(${codes.destination})` : ""}</strong><small>{booking.arrival} local · {booking.duration}</small></div><div><span>Registration</span><strong>{booking.registration ?? "Any available"}</strong><small>{booking.registration ? "Reserved for this BAV flight" : "Choose in Ember when ready"}</small></div></div>{route && booking.status === "booked" && eligibleAircraft.length > 1 && !booking.fleetAircraftId ? <form className="flight-plan-aircraft-change" action={changeBookingAircraft}><input type="hidden" name="bookingId" value={booking.id} /><label><span>Virtual aircraft</span><select name="aircraft" defaultValue={booking.aircraft}>{eligibleAircraft.map((aircraft) => <option key={aircraft} value={aircraft}>{aircraft}{aircraft === route.aircraft ? " · scheduled" : " · approved substitute"}</option>)}</select></label><button className="button button-outline" type="submit">Update aircraft</button><small>Only Operations-approved aircraft your rank and type ratings permit are listed. Updating aircraft clears the existing SimBrief OFP.</small></form> : null}<p>This is an in-house British Airways Virtual assignment. Fly when it suits your simulator session: the published time is a reference, not a departure gate. Ember records telemetry continuously and submits the linked PIREP only when you explicitly end the flight in the app. Every completed full hour after the published departure makes only a 0.1 VA-point adjustment, without affecting Tier Points or fleet credit.</p></section>
      <section className="flight-plan-card dispatch-card"><span className="flight-plan-label">SIMBRIEF DISPATCH</span><h2>{flightPlan.status === "synced" ? "Plan generated" : "Generate your flight plan"}</h2>{canDispatch ? <><p>{officialDispatchConfigured ? "Generate this BAV service through SimBrief's official VA API. SimBrief keeps its own sign-in and BAV never sees or stores a pilot password." : "Open SimBrief with this BAV service already filled in. SimBrief keeps its own login; BAV never sees or stores your password."}</p>{officialDispatchConfigured ? <SimbriefDispatchButton bookingId={booking.id} /> : <form action={openSimbriefDispatch}><input type="hidden" name="bookingId" value={booking.id} /><button className="button button-primary" type="submit">Open SimBrief dispatch</button></form>}<p className="dispatch-help">{officialDispatchConfigured ? "After the SimBrief popup completes, BAV checks and saves the matching OFP automatically. The manual sync remains available if SimBrief takes longer to publish it." : "After generating the OFP in SimBrief, return here and select “Sync generated plan”."}</p><form action={syncSimbriefFlightPlan}><input type="hidden" name="bookingId" value={booking.id} /><button className="button button-outline" type="submit">Sync generated plan</button></form></> : <><p>{pilot.simbriefPilotId ? "This route or aircraft has not yet been mapped to a SimBrief ICAO dispatch code. Choose another current BAV service or ask Operations to add a mapping." : "Add your numeric SimBrief Pilot ID in Account Settings first. It lets BAV pre-fill the selected flight and securely retrieve the latest matching OFP after you generate it."}</p>{pilot.simbriefPilotId ? <Link className="button button-outline" href="/book">Choose another flight</Link> : <Link className="button button-primary" href="/account/profile">Add SimBrief Pilot ID</Link>}</>}</section>
    </div>
    <section className="flight-plan-card plan-status"><span className="flight-plan-label">BAV FLIGHT-PLAN RECORD</span>{flightPlan.status === "synced" ? <div><h2>SimBrief OFP {flightPlan.simbriefOfpId ? `#${flightPlan.simbriefOfpId}` : "synced"}</h2><dl><div><dt>Route</dt><dd>{flightPlan.route ?? "Not supplied by SimBrief"}</dd></div><div><dt>Initial cruise</dt><dd>{flightPlan.cruiseAltitude ?? "Not supplied"}</dd></div><div><dt>Alternate</dt><dd>{flightPlan.alternate ?? "Not supplied"}</dd></div><div><dt>Last synced</dt><dd>{flightPlan.lastSyncedAt ? new Date(flightPlan.lastSyncedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd></div></dl>{safeOfpUrl ? <a className="ops-inline-link" href={safeOfpUrl} target="_blank" rel="noreferrer">Open OFP document ↗</a> : null}<a className="ops-inline-link" href={`/api/flight-plans/${encodeURIComponent(booking.id)}/xplane-fms`}>Download X-Plane FMS plan ↓</a><p className="dispatch-help">Save the downloaded .fms file in your X-Plane <strong>Output/FMS plans</strong> folder, then load it manually in the simulator.</p></div> : <p>Your BAV flight-plan record was created with this assignment. It will retain the SimBrief OFP identifier, route and briefing details when you sync the generated plan.</p>}</section>
    {flightPlan.status === "synced" && flightPlan.simbriefBriefing ? <FlightPlanBriefing briefing={flightPlan.simbriefBriefing} route={flightPlan.route} cruiseAltitude={flightPlan.cruiseAltitude} alternate={flightPlan.alternate} ofpUrl={safeOfpUrl} originIcao={codes.origin ?? null} destinationIcao={codes.destination ?? null} date={booking.date} departure={booking.departure} duration={booking.duration} /> : null}
  </div></main><SiteFooter /></>;
}
