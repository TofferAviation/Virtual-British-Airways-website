import type { Metadata } from "next";
import { SiteSearchClient } from "@/components/SiteSearchClient";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { siteSearchItems } from "@/data/site-search";

export const metadata: Metadata = {
  title: "Search",
  description: "Search British Airways Virtual guidance, pilot operations and support.",
};

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";

  return (
    <>
      <SiteHeader />
      <SiteSearchClient initialQuery={query} items={siteSearchItems} />
      <SiteFooter />
    </>
  );
}
