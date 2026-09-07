import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SERVICE_SOURCE_PERMISSION } from "@/lib/permissions";
import { requireStaffSession } from "@/lib/staff-auth";
import { getStaffState, hasPermission, isMasterAdminAccount } from "@/lib/staff-store";
import { ServiceSettingsClient } from "./ServiceSettingsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Service Settings",
  description: "Protected British Airways Virtual website source workspace for authorised staff.",
};

export default async function ServiceSettingsPage() {
  const session = await requireStaffSession();
  const state = await getStaffState();
  const account = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!account || !hasPermission(state, account, SERVICE_SOURCE_PERMISSION)) notFound();

  return (
    <>
      <SiteHeader />
      <main className="service-settings-page">
        <ServiceSettingsClient
          staffName={account.name}
          isMasterAdmin={isMasterAdminAccount(account)}
        />
      </main>
      <SiteFooter />
    </>
  );
}
