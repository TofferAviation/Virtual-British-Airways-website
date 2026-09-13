import { NextResponse } from "next/server";

function signInRedirect(request: Request) {
  return NextResponse.redirect(new URL("/login?returnTo=%2Fstaff", request.url), 303);
}

// Legacy endpoint retained for old bookmarks. Owner access is now derived
// directly from the BAV account and its Staff role record.
export async function GET(request: Request) { return signInRedirect(request); }
export async function POST(request: Request) { return signInRedirect(request); }
