"use client";

import { useRef, useState } from "react";

type DispatchResponse = {
  action: string;
  expectedOfpId: string;
  fields: Record<string, string>;
};

function readError(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function SimbriefDispatchButton({ bookingId }: { bookingId: string }) {
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const timer = useRef<number | null>(null);

  async function completeDispatch(ofpId: string) {
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        setStatus(attempt === 0 ? "Finalising the generated OFP…" : `Waiting for SimBrief to publish the OFP (${attempt + 1}/20)…`);
        const response = await fetch(`/api/flight-plans/${encodeURIComponent(bookingId)}/simbrief/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ofpId }),
        });
        const payload = await response.json().catch(() => null);
        if (response.ok) {
          window.location.assign(`/flight-plans/${encodeURIComponent(bookingId)}?synced=1&official=1`);
          return;
        }
        if (response.status !== 409 || attempt === 19) throw new Error(readError(payload, "Unable to retrieve the generated SimBrief OFP."));
        await wait(1500);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to retrieve the generated SimBrief OFP.");
      setIsWorking(false);
    }
  }

  async function generate() {
    if (timer.current) window.clearInterval(timer.current);
    setStatus("");
    setIsWorking(true);
    const popup = window.open("about:blank", "BAVSimBriefDispatch", "width=600,height=315");
    if (!popup) {
      setStatus("Your browser blocked the SimBrief popup. Allow popups for this site, then try again.");
      setIsWorking(false);
      return;
    }

    try {
      popup.document.title = "Preparing SimBrief dispatch";
      popup.document.body.textContent = "Opening SimBrief dispatch…";
      const response = await fetch(`/api/flight-plans/${encodeURIComponent(bookingId)}/simbrief/dispatch`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(payload, "Unable to start SimBrief dispatch."));
      const dispatch = payload as DispatchResponse;
      if (!dispatch.action || !dispatch.expectedOfpId || !dispatch.fields) throw new Error("BAV received an invalid SimBrief dispatch response.");

      const form = document.createElement("form");
      form.method = "get";
      form.action = dispatch.action;
      form.target = "BAVSimBriefDispatch";
      for (const [name, value] of Object.entries(dispatch.fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      window.name = "BAVSimBriefCaller";
      form.submit();
      form.remove();
      setStatus("Complete the SimBrief popup. BAV will save the OFP automatically when it closes.");
      timer.current = window.setInterval(() => {
        if (!popup.closed) return;
        if (timer.current) window.clearInterval(timer.current);
        timer.current = null;
        void completeDispatch(dispatch.expectedOfpId);
      }, 700);
    } catch (error) {
      popup.close();
      setStatus(error instanceof Error ? error.message : "Unable to start SimBrief dispatch.");
      setIsWorking(false);
    }
  }

  return <div className="simbrief-official-dispatch"><button className="button button-primary" type="button" onClick={generate} disabled={isWorking}>{isWorking ? "Preparing SimBrief…" : "Generate official SimBrief plan"}</button>{status ? <p className="dispatch-help" aria-live="polite">{status}</p> : null}</div>;
}
