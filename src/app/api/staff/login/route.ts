import { NextRequest, NextResponse } from "next/server";
import {
  STAFF_COOKIE_NAME,
  createStaffSessionToken,
  isStaffAuthConfigured,
  staffSessionCookieOptions,
  validateStaffCredentials,
} from "@/lib/staff-auth";
import { relativeRedirect, requestUsesHttps } from "@/lib/request-context";

function publicRedirect(path: string) {
  // Keep the form handoff on the request's exact origin. An absolute URL
  // configured for a deployment can differ from the browser's current host
  // behind a proxy, which risks the browser discarding a freshly issued
  // session cookie on the redirect. A validated relative path cannot cross
  // origins and is the same pattern used by the other session routes.
  return relativeRedirect(path, 303);
}

export async function POST(request: NextRequest) {
  const formSubmission = request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded") ?? false;
  const loginError = (code: string, status: number, message: string) => {
    if (formSubmission) {
      return publicRedirect(`/staff-login?error=${encodeURIComponent(code)}`);
    }
    return NextResponse.json({ error: message }, { status });
  };

  if (!isStaffAuthConfigured()) {
    return loginError("not-configured", 503, "Staff login is not configured. Add the BAV_STAFF_* environment variables first.");
  }

  let email = "";
  let password = "";
  if (formSubmission) {
    const form = await request.formData().catch(() => null);
    email = form?.get("email")?.toString().trim() ?? "";
    password = form?.get("password")?.toString() ?? "";
  } else {
    const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
    email = body?.email?.trim() ?? "";
    password = body?.password ?? "";
  }

  if (!email || !password) {
    return loginError("invalid-credentials", 401, "Invalid staff email or password.");
  }

  let account;
  try {
    account = await validateStaffCredentials(email, password);
  } catch {
    return loginError("service-unavailable", 503, "Staff account service is temporarily unavailable. Please try again shortly.");
  }
  if (!account) {
    return loginError("invalid-credentials", 401, "Invalid staff email or password.");
  }

  // Form navigation is intentional: some browsers fail to retain an HttpOnly
  // cookie issued from a client-side fetch before an immediate route change.
  // A 303 response makes the browser persist the cookie first, then load /staff.
  const response = formSubmission
    ? publicRedirect("/staff")
    : NextResponse.json({ ok: true, role: account.roleId });
  response.cookies.set(STAFF_COOKIE_NAME, createStaffSessionToken(account), {
    ...staffSessionCookieOptions,
    secure: requestUsesHttps(request),
  });
  return response;
}
