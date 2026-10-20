import { redirect } from "next/navigation";
import { PassportStudioEditor } from "@/components/PassportStudioEditor";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Passport Studio" };

export default async function PassportStudioPage() {
  const session = await requirePilotSession();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot) redirect("/login");
  return <PassportStudioEditor initialStudio={pilot.passportStudio} pilotName={pilot.name} />;
}
