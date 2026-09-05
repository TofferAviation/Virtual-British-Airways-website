import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "british-airways-virtual-website",
    status: "ok",
    version: "0.1.0",
  });
}
