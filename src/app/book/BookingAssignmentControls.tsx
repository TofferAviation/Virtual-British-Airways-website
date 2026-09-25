"use client";

import { useMemo, useState } from "react";

export type BookingRegistrationOption = {
  id: string;
  registration: string;
  aircraft: string;
  station: string | null;
};

type Props = {
  aircraft: string[];
  selectedAircraft: string;
  registrationOptions: Record<string, BookingRegistrationOption[]>;
};

export function BookingAssignmentControls({ aircraft, selectedAircraft, registrationOptions }: Props) {
  const [selected, setSelected] = useState(selectedAircraft);
  const [registrationId, setRegistrationId] = useState("");
  const registrations = useMemo(() => registrationOptions[selected] ?? [], [registrationOptions, selected]);

  return <>
    {aircraft.length > 1 ? <label className="booking-aircraft-choice"><span>Virtual aircraft</span><select name="aircraft" value={selected} onChange={(event) => { setSelected(event.target.value); setRegistrationId(""); }}>{aircraft.map((candidate) => <option key={candidate} value={candidate}>{candidate}{candidate === selectedAircraft ? " · scheduled" : " · approved substitute"}</option>)}</select></label> : <input type="hidden" name="aircraft" value={selected} />}
    <label className="booking-aircraft-choice">
      <span>Registration</span>
      <select name="fleetAircraftId" value={registrationId} onChange={(event) => setRegistrationId(event.target.value)}>
        <option value="">Any available registration · choose later in Ember</option>
        {registrations.map((registration) => <option key={registration.id} value={registration.id}>{registration.registration} · {registration.aircraft}{registration.station ? ` · ${registration.station}` : ""}</option>)}
      </select>
      <small>{registrations.length ? "Choosing a registration reserves it immediately for this BAV flight." : "No matching dispatchable registration is currently available; Ember can select one later."}</small>
    </label>
  </>;
}
