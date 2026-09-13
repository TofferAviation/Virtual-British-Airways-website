import { relativeRedirect } from "@/lib/request-context";

// Legacy endpoint retained for old bookmarks. Staff Centre now has its own
// sign-in and the protected one-time setup is available from that page.
export async function GET() { return relativeRedirect("/staff-login", 303); }
export async function POST() { return relativeRedirect("/staff-login", 303); }
