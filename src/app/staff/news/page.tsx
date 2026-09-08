import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getNewsArticles } from "@/lib/news-store";
import { requireStaffSession } from "@/lib/staff-auth";
import { getStaffState, hasPermission } from "@/lib/staff-store";
import { NewsManager } from "./NewsManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News & announcements manager",
  description: "Manage British Airways Virtual newsroom content and public announcements.",
};

export default async function StaffNewsPage() {
  const session = await requireStaffSession();
  const state = await getStaffState();
  const account = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!account || !hasPermission(state, account, "news.view")) notFound();

  const articles = await getNewsArticles();
  const canCreate = hasPermission(state, account, "news.create");
  const canEdit = hasPermission(state, account, "news.edit");
  const canPublish = hasPermission(state, account, "news.publish");
  const canDelete = hasPermission(state, account, "news.delete");

  return (
    <>
      <SiteHeader />
      <main className="news-admin-page">
        <div className="news-admin-shell news-admin-hero">
          <div>
            <span className="staff-kicker">Staff centre · newsroom</span>
            <h1>News & announcements</h1>
            <p>Publish newsroom stories, route updates, community news and public announcements from one place.</p>
          </div>
          <div><Link className="news-admin-secondary" href="/staff">Back to Staff Centre</Link><Link className="news-admin-primary" href="/news" target="_blank">Open public page ↗</Link></div>
        </div>
        <div className="news-admin-shell"><NewsManager initialArticles={articles} canCreate={canCreate} canEdit={canEdit} canPublish={canPublish} canDelete={canDelete} /></div>
      </main>
      <SiteFooter />
    </>
  );
}
