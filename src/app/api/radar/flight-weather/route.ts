import { NextResponse } from "next/server";
import { getAllMetsatReport } from "@/lib/allmetsat";

const MAX_STATIONS = 3;

export async function GET(request: Request) {
  const values = new URL(request.url).searchParams.get("stations")?.split(",") ?? [];
  const stations = [...new Set(values.map((value) => value.trim().toUpperCase()).filter((value) => /^[A-Z]{4}$/.test(value)))].slice(0, MAX_STATIONS);
  if (stations.length === 0) return NextResponse.json({ reports: [] });
  const reports = await Promise.all(stations.map((station) => getAllMetsatReport(station)));
  return NextResponse.json({ reports }, { headers: { "Cache-Control": "private, max-age=60" } });
}
