import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { requireStaffSession } from "@/lib/staff-auth";
import { StaffProfileForms } from "./StaffProfileForms";
import "./staff-profile.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff Profile", description: "Manage your British Airways Virtual staff profile." };

export default async function StaffProfilePage() {
  const session = await requireStaffSession();
  return <>
    <SiteHeader />
    <main className="staff-profile-page">
      <div className="staff-profile-shell">
        <nav className="staff-profile-crumbs"><Link href="/">Home</Link><span>›</span><Link href="/staff">Staff Centre</Link><span>›</span><strong>My profile</strong></nav>
        <header><span>Staff account</span><h1>My profile</h1><p>Update your Staff Centre display name and separate Staff Centre password.</p></header>
        <StaffProfileForms initialName={session.name} email={session.email} role={session.isMasterAdmin ? "Master Admin" : session.roleId.replace(/-/g, " ")} />
      </div>
    </main>
    <SiteFooter />
  </>;
}
