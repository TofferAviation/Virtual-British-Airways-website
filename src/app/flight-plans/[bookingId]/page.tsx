import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPilotBooking, getPilotFlightPlan } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
import { getSimbriefCodes } from "@/lib/simbrief";
import { openSimbriefDispatch, syncSimbriefFlightPlan } from "./actions";
import "./flight-plan.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Flight planning" };

export default async function FlightPlanPage({ params, searchParams }: { params: Promise<{ bookingId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ bookingId }, query] = await Promise.all([params, searchParams]);
  const session = await requirePilotSession();
  const [booking, pilot, flightPlan] = await Promise.all([getPilotBooking(bookingId, session.pilotId), getPilotById(session.pilotId), getPilotFlightPlan(bookingId, session.pilotId)]);
  if (!booking || !pilot || !flightPlan) notFound();
  if (booking.status === "cancelled") redirect("/book");
  const error = typeof query.error === "string" ? query.error : "";
  const synced = query.synced === "1";
  const codes = getSimbriefCodes(booking);
  const canDispatch = Boolean(pilot.simbriefPilotId && codes.origin && codes.destination && codes.aircraft);
  const safeOfpUrl = flightPlan.simbriefOfpUrl?.startsWith("https://") ? flightPlan.simbriefOfpUrl : null;

  return <><SiteHeader /><main className="page-shell flight-plan-page"><div className="page-container flight-plan-container">
    <div className="booking-steps"><div className="booking-step"><span>1</span>Choose virtual flight</div><div className="booking-step active"><span>2</span>Flight briefing</div><div className="booking-step"><span>3</span>Confirm assignment</div></div>
    <section className="flight-plan-hero"><div><span className="section-kicker">BAV FLIGHT PLANNING</span><h1>{booking.flightNumber} · {booking.from} → {booking.to}</h1><p>Your BAV assignment is saved. Prepare the dispatch below before you fly.</p></div><Link className="button button-outline" href="/account">View account</Link></section>
    {synced ? <div className="flight-plan-notice success"><strong>Flight plan saved to your BAV account.</strong> The latest matching SimBrief OFP is now linked to this assignment.</div> : null}
    {error ? <div className="flight-plan-notice error"><strong>Plan not synced.</strong> {error}</div> : null}
    <div className="flight-plan-grid"><section className="flight-plan-card"><span className="flight-plan-label">Selected BAV service</span><h2>{booking.flightNumber} · {booking.aircraft}</h2><div className="flight-plan-details"><div><span>Departure</span><strong>{booking.from} {codes.origin ? `(${codes.origin})` : ""}</strong><small>{booking.departure} UTC · {booking.date}</small></div><div><span>Arrival</span><strong>{booking.to} {codes.destination ? `(${codes.destination})` : ""}</strong><small>{booking.arrival} UTC · {booking.duration}</small></div></div><p>This is an in-house British Airways Virtual assignment. It remains available in your account while you complete the flight and submit your PIREP.</p></section>
      <section className="flight-plan-card dispatch-card"><span className="flight-plan-label">SIMBRIEF DISPATCH</span><h2>{flightPlan.status === "synced" ? "Plan generated" : "Generate your flight plan"}</h2>{canDispatch ? <><p>Open SimBrief with this BAV service already filled in. SimBrief keeps its own login; BAV never sees or stores your password.</p><form action={openSimbriefDispatch}><input type="hidden" name="bookingId" value={booking.id} /><button className="button button-primary" type="submit">Open SimBrief dispatch</button></form><p className="dispatch-help">After generating the OFP in SimBrief, return here and select “Sync generated plan”.</p><form action={syncSimbriefFlightPlan}><input type="hidden" name="bookingId" value={booking.id} /><button className="button button-outline" type="submit">Sync generated plan</button></form></> : <><p>{pilot.simbriefPilotId ? "This route or aircraft has not yet been mapped to a SimBrief ICAO dispatch code. Choose another current BAV service or ask Operations to add a mapping." : "Add your numeric SimBrief Pilot ID in Account Settings first. It lets BAV pre-fill the selected flight and securely retrieve the latest matching OFP after you generate it."}</p>{pilot.simbriefPilotId ? <Link className="button button-outline" href="/book">Choose another flight</Link> : <Link className="button button-primary" href="/account/profile">Add SimBrief Pilot ID</Link>}</>}</section>
    </div>
    <section className="flight-plan-card plan-status"><span className="flight-plan-label">BAV FLIGHT-PLAN RECORD</span>{flightPlan.status === "synced" ? <div><h2>SimBrief OFP {flightPlan.simbriefOfpId ? `#${flightPlan.simbriefOfpId}` : "synced"}</h2><dl><div><dt>Route</dt><dd>{flightPlan.route ?? "Not supplied by SimBrief"}</dd></div><div><dt>Initial cruise</dt><dd>{flightPlan.cruiseAltitude ?? "Not supplied"}</dd></div><div><dt>Alternate</dt><dd>{flightPlan.alternate ?? "Not supplied"}</dd></div><div><dt>Last synced</dt><dd>{flightPlan.lastSyncedAt ? new Date(flightPlan.lastSyncedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd></div></dl>{safeOfpUrl ? <a className="ops-inline-link" href={safeOfpUrl} target="_blank" rel="noreferrer">Open OFP document ↗</a> : null}</div> : <p>Your BAV flight-plan record was created with this assignment. It will retain the SimBrief OFP identifier, route and briefing details when you sync the generated plan.</p>}</section>
  </div></main><SiteFooter /></>;
}
