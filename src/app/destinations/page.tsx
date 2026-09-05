import Link from "next/link";
import { FlightSearch } from "@/components/FlightSearch";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { airports } from "@/data/airports";

export const metadata = { title: "Discover destinations" };

type DestinationCard = {
  city: string;
  code: string;
  label: string;
  image: string;
};

type DiscoverMoreCard = {
  title: string;
  href: string;
  image: string;
  alt: string;
};

const ukDestinations: DestinationCard[] = [
  { city: "London", code: "LHR", label: "London Heathrow", image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=85" },
  { city: "Edinburgh", code: "EDI", label: "Scotland", image: "https://images.unsplash.com/photo-1506377585622-bedcbb5a8b2c?auto=format&fit=crop&w=1200&q=85" },
  { city: "Newcastle", code: "NCL", label: "North East England", image: "https://images.unsplash.com/photo-1526470608268-f674ce90ebd4?auto=format&fit=crop&w=1200&q=85" },
  { city: "Dublin", code: "DUB", label: "Ireland", image: "https://images.unsplash.com/photo-1549918864-48ac978761a4?auto=format&fit=crop&w=1200&q=85" },
];

const europeDestinations: DestinationCard[] = [
  { city: "Barcelona", code: "BCN", label: "Spain", image: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=1200&q=85" },
  { city: "Madrid", code: "MAD", label: "Spain", image: "https://images.unsplash.com/photo-1539576776193-2c07122e5fee?auto=format&fit=crop&w=1200&q=85" },
  { city: "Paris", code: "CDG", label: "France", image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=85" },
  { city: "Prague", code: "PRG", label: "Czechia", image: "https://images.unsplash.com/photo-1519671282429-b44660ead0a7?auto=format&fit=crop&w=1200&q=85" },
  { city: "Tenerife", code: "TFS", label: "Canary Islands", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85" },
  { city: "Malta", code: "MLA", label: "Malta", image: "https://images.unsplash.com/photo-1514222134-b57cbb8ce073?auto=format&fit=crop&w=1200&q=85" },
];

const northAmericaDestinations: DestinationCard[] = [
  { city: "Vancouver", code: "YVR", label: "Canada", image: "https://images.unsplash.com/photo-1559511260-66a654ae982a?auto=format&fit=crop&w=1200&q=85" },
  { city: "Las Vegas", code: "LAS", label: "United States", image: "https://images.unsplash.com/photo-1605833556294-ea5c7a74f57d?auto=format&fit=crop&w=1200&q=85" },
  { city: "Miami", code: "MIA", label: "United States", image: "https://images.unsplash.com/photo-1506966953602-c20cc11f75e3?auto=format&fit=crop&w=1200&q=85" },
  { city: "New York", code: "JFK", label: "United States", image: "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=1200&q=85" },
  { city: "San Francisco", code: "SFO", label: "United States", image: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1200&q=85" },
  { city: "Los Angeles", code: "LAX", label: "United States", image: "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?auto=format&fit=crop&w=1200&q=85" },
];

const worldDestinations: DestinationCard[] = [
  { city: "Bangkok", code: "BKK", label: "Thailand", image: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=1200&q=85" },
  { city: "Barbados", code: "BGI", label: "Caribbean", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85" },
  { city: "Buenos Aires", code: "EZE", label: "Argentina", image: "https://images.unsplash.com/photo-1589909202802-8f4aadce1849?auto=format&fit=crop&w=1200&q=85" },
  { city: "Dubai", code: "DXB", label: "United Arab Emirates", image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=85" },
  { city: "Maldives", code: "MLE", label: "Indian Ocean", image: "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&q=85" },
  { city: "Mauritius", code: "MRU", label: "Indian Ocean", image: "https://images.unsplash.com/photo-1589197331516-4d84b72ebde3?auto=format&fit=crop&w=1200&q=85" },
];

const discoverMoreCards: DiscoverMoreCard[] = [
  {
    title: "Argentina flights",
    href: "/book?to=EZE",
    image: "https://images.unsplash.com/photo-1589909202802-8f4aadce1849?auto=format&fit=crop&w=1100&q=82",
    alt: "Obelisk and city centre in Buenos Aires, Argentina",
  },
  {
    title: "Australia flights",
    href: "/book?to=SYD",
    image: "https://images.unsplash.com/photo-1556089309-389321ee92d9?auto=format&fit=crop&w=1100&q=82",
    alt: "Sydney Opera House in Australia",
  },
  {
    title: "Brazil flights",
    href: "/book?to=GIG",
    image: "https://images.unsplash.com/photo-1621764541297-91694f8e90c9?auto=format&fit=crop&w=1100&q=82",
    alt: "Rio de Janeiro city and bay in Brazil",
  },
  {
    title: "Caribbean flights",
    href: "/book?to=ANU",
    image: "https://images.unsplash.com/photo-1583860168269-5d0b9e9131b2?auto=format&fit=crop&w=1100&q=82",
    alt: "Fort James Beach in Antigua and Barbuda",
  },
  {
    title: "China flights",
    href: "/book?to=PVG",
    image: "https://images.unsplash.com/photo-1693721783596-afebf1d4354f?auto=format&fit=crop&w=1100&q=82",
    alt: "Great Wall of China near Beijing",
  },
  {
    title: "Costa Rica flights",
    href: "/book?to=SJO",
    image: "https://images.unsplash.com/photo-1630488991068-d12e7e0dadb7?auto=format&fit=crop&w=1100&q=82",
    alt: "Tropical beach in Costa Rica",
  },
  {
    title: "Egypt flights",
    href: "/book?to=CAI",
    image: "https://images.unsplash.com/photo-1639157451911-365bf4fc26ed?auto=format&fit=crop&w=1100&q=82",
    alt: "Pyramids of Giza in Egypt",
  },
  {
    title: "Ghana flights",
    href: "/book?to=ACC",
    image: "https://images.unsplash.com/photo-1651860282137-a59f01d2db7b?auto=format&fit=crop&w=1100&q=82",
    alt: "Cape Coast shoreline in Ghana",
  },
  {
    title: "Indian Ocean flights",
    href: "/book?to=MLE",
    image: "https://images.unsplash.com/photo-1586500036065-bdaeac7a4feb?auto=format&fit=crop&w=1100&q=82",
    alt: "White sand beach and turquoise water in the Maldives",
  },
  {
    title: "Japan flights",
    href: "/book?to=HND",
    image: "https://images.unsplash.com/photo-1743731853247-79c0bfb78b33?auto=format&fit=crop&w=1100&q=82",
    alt: "Mount Fuji and a Japanese temple",
  },
  {
    title: "London flights",
    href: "/book?to=LHR",
    image: "https://images.unsplash.com/photo-1765924848146-c0a553565688?auto=format&fit=crop&w=1100&q=82",
    alt: "Big Ben and Westminster Bridge in London",
  },
  {
    title: "Scotland flights",
    href: "/book?to=EDI",
    image: "https://images.unsplash.com/photo-1663942465127-0b0f35c90704?auto=format&fit=crop&w=1100&q=82",
    alt: "Edinburgh skyline from Calton Hill in Scotland",
  },
  {
    title: "South Africa flights",
    href: "/book?to=CPT",
    image: "https://images.unsplash.com/photo-1721155265830-1622a3383da4?auto=format&fit=crop&w=1100&q=82",
    alt: "Cape Town and Table Mountain in South Africa",
  },
  {
    title: "Thailand flights",
    href: "/book?to=BKK",
    image: "https://images.unsplash.com/photo-1762698352682-4f93466b58ea?auto=format&fit=crop&w=1100&q=82",
    alt: "Ornate temple architecture in Bangkok, Thailand",
  },
  {
    title: "United Arab Emirates flights",
    href: "/book?to=DXB",
    image: "https://images.unsplash.com/photo-1721977568971-f07e1aa58cf9?auto=format&fit=crop&w=1100&q=82",
    alt: "Dubai Marina in the United Arab Emirates",
  },
  {
    title: "USA flights",
    href: "/book?to=JFK",
    image: "https://images.unsplash.com/photo-1663052721527-0d971e81d257?auto=format&fit=crop&w=1100&q=82",
    alt: "New York skyline with the Empire State Building",
  },
];

function DestinationGrid({ items }: { items: DestinationCard[] }) {
  return (
    <div className="discover-card-grid">
      {items.map((destination) => (
        <Link className="discover-destination-card" href={`/book?to=${destination.code}`} key={destination.code}>
          <div className="discover-card-image" style={{ backgroundImage: `url(${destination.image})` }} />
          <div className="discover-card-copy">
            <h3>{destination.city}</h3>
            <p><span>{destination.label}</span><strong>{destination.code}</strong></p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function DestinationsPage() {
  return (
    <>
      <SiteHeader />
      <main className="discover-page">
        <section className="discover-top">
          <div className="discover-wrap">
            <h1>Flights with British Airways Virtual</h1>
            <FlightSearch />
          </div>
        </section>

        <section className="discover-section">
          <div className="discover-wrap">
            <div className="discover-heading-row">
              <div>
                <h2>Destinations to London and the UK</h2>
                <p>Explore our core British and Irish destinations and choose one as the starting point for your next virtual assignment.</p>
              </div>
              <Link href="/book">View scheduled flights</Link>
            </div>
            <DestinationGrid items={ukDestinations} />
          </div>
        </section>

        <section className="discover-section">
          <div className="discover-wrap">
            <div className="discover-heading-row">
              <div>
                <h2>Destinations in Europe</h2>
                <p>Short-haul and CityFlyer-style flying across some of the busiest and most scenic destinations in the network.</p>
              </div>
              <Link href="/book">Browse Europe flights</Link>
            </div>
            <DestinationGrid items={europeDestinations} />
          </div>
        </section>

        <section className="discover-section">
          <div className="discover-wrap">
            <div className="discover-heading-row">
              <div>
                <h2>Destinations in North America</h2>
                <p>Long-haul virtual operations across Canada and the United States using the wide-body fleet.</p>
              </div>
              <Link href="/book">Browse long-haul flights</Link>
            </div>
            <DestinationGrid items={northAmericaDestinations} />
          </div>
        </section>

        <section className="discover-why">
          <div className="discover-wrap">
            <h2>Why fly with British Airways Virtual</h2>
            <p className="discover-why-lead">What to expect when you fly with our virtual airline.</p>
            <div className="discover-benefits">
              <article className="discover-benefit">
                <div className="discover-benefit-icon">✈</div>
                <h3>A structured schedule</h3>
                <p>Choose from realistic routes, aircraft types and operating patterns instead of flying disconnected one-off sectors.</p>
                <Link href="/book">Search scheduled flights</Link>
              </article>
              <article className="discover-benefit">
                <div className="discover-benefit-icon">◉</div>
                <h3>A shared pilot career</h3>
                <p>Your website profile is designed to stay aligned with Phoenix and vAMSYS data as the integrations come online.</p>
                <Link href="/account">Open your pilot account</Link>
              </article>
              <article className="discover-benefit">
                <div className="discover-benefit-icon">▱</div>
                <h3>A realistic fleet</h3>
                <p>Fly short-haul, long-haul and CityFlyer aircraft across a network inspired by British Airways operations.</p>
                <Link href="/fleet">Explore the fleet</Link>
              </article>
            </div>
          </div>
        </section>

        <section className="discover-section alt">
          <div className="discover-wrap">
            <div className="discover-heading-row">
              <div>
                <h2>Destinations in the rest of the world</h2>
                <p>Explore long-haul flying beyond Europe and North America.</p>
              </div>
              <Link href="/book">Find a virtual flight</Link>
            </div>
            <DestinationGrid items={worldDestinations} />
          </div>
        </section>

        <section className="discover-operation">
          <div className="discover-wrap">
            <h2>Our virtual operation</h2>
            <p>Choose the style of flying that suits your next assignment.</p>
            <div className="discover-operation-grid">
              <article className="discover-operation-card">
                <h3>Short haul</h3>
                <p>European flying with the Airbus A319, A320 and A321neo families.</p>
                <Link href="/fleet">View short-haul aircraft</Link>
              </article>
              <article className="discover-operation-card">
                <h3>Long haul</h3>
                <p>Intercontinental sectors with the 777, 787 and A350 families.</p>
                <Link href="/fleet">View long-haul aircraft</Link>
              </article>
              <article className="discover-operation-card">
                <h3>CityFlyer</h3>
                <p>Regional operations focused around London City and the Embraer E190.</p>
                <Link href="/fleet">Explore CityFlyer</Link>
              </article>
              <article className="discover-operation-card">
                <h3>Pilot progression</h3>
                <p>Build flight hours, landing statistics, VA Points and virtual membership progress.</p>
                <Link href="/account">View pilot career</Link>
              </article>
            </div>
          </div>
        </section>

        <section className="discover-more">
          <div className="discover-wrap">
            <h2>Discover more</h2>
            <div className="discover-country-grid">
              {discoverMoreCards.map((card) => (
                <Link className="discover-country-card" href={card.href} key={card.title}>
                  <div
                    className="discover-country-image"
                    role="img"
                    aria-label={card.alt}
                    style={{ backgroundImage: `url(${card.image})` }}
                  />
                  <div className="discover-country-copy">
                    <span>{card.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="discover-note">
          <div className="discover-wrap">
            <h2>About virtual destination availability</h2>
            <p>
              Destinations shown here represent the British Airways Virtual network seed. Individual routes, aircraft and pilot slots will be controlled by the live schedule backend as that system is connected. This site is for flight simulation only and does not sell real-world tickets.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
