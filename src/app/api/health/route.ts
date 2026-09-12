import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "british-airways-virtual-website",
    status: "ok",
    // This is deliberately a source revision rather than an environment
    // value so the public health endpoint can confirm which authentication
    // release Render is actually serving, without exposing any secret.
    revision: "staff-auth-bc58f86",
    staffAuthConfigured: Boolean(
      process.env.BAV_STAFF_EMAIL &&
        process.env.BAV_STAFF_PASSWORD &&
        process.env.BAV_STAFF_SESSION_SECRET &&
        process.env.BAV_STAFF_SESSION_SECRET.length >= 24,
    ),
  });
}
