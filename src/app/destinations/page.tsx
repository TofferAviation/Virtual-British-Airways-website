import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { airports } from "@/data/airports";

export const metadata = { title: "Destinations" };

export default function DestinationsPage() {
  const countries = [...new Set(airports.map((airport) => airport.country))].sort();

  return (
    <>
      <SiteHeader />
      <main className="page-shell">
        <div className="page-container wide-page">
          <section className="page-heading">
            <div className="section-kicker">Virtual network</div>
            <h1>Destinations</h1>
            <p>
              The current production seed contains {airports.length} British Airways destination airports across {countries.length} country/region entries. The schedule backend will later decide which routes are actively available to pilots on each date.
            </p>
          </section>

          <div className="network-toolbar card">
            <div><strong>{airports.length}</strong><span>Airports</span></div>
            <div><strong>{countries.length}</strong><span>Countries / regions</span></div>
            <div><strong>4</strong><span>London operating bases</span></div>
            <Link className="button button-primary" href="/book">Search flights</Link>
          </div>

          <section className="airport-directory">
            {countries.map((country) => {
              const countryAirports = airports.filter((airport) => airport.country === country);
              return (
                <article className="country-card card" key={country}>
                  <h2>{country}</h2>
                  <div className="country-airports">
                    {countryAirports.map((airport) => (
                      <Link href={`/book?to=${airport.code}`} key={airport.code}>
                        <strong>{airport.code}</strong>
                        <span>{airport.name}</span>
                      </Link>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
