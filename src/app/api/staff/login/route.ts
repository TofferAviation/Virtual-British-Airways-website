import { NextResponse } from "next/server";

// Retained only as a safe redirect for stale bookmarks. Staff Centre no
// longer accepts a second password or writes a separate browser cookie.
export async function POST(request: Request) {
  return NextResponse.redirect(new URL("/login?returnTo=%2Fstaff", request.url), 303);
}
