"use client";

import { useFormStatus } from "react-dom";

export function BookingSubmitButton() {
  const { pending } = useFormStatus();

  return <button className="button button-primary" type="submit" disabled={pending}>
    {pending ? "Opening flight planning…" : "Select flight"}
  </button>;
}
