import { notFound } from "next/navigation";
import { GlobeVisualCheck } from "@/components/radar-globe/visual-check";
export const dynamic = "force-dynamic";
export default function GlobeCheck() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GlobeVisualCheck />;
}
