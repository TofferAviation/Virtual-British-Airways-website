export const pilot = {
  id: "BAWVA0001",
  name: "Pilot",
  rank: "First Officer",
  hub: "London Heathrow",
  points: 2476,
  tierPoints: 943,
  lifetimeTierPoints: 4810,
  tier: "Blue",
  flights: 128,
  hours: 642.3,
  hoursDisplay: "642h 18m",
  distanceNm: 281640,
  averageLanding: -182,
  bestLanding: -34,
  onTime: 96,
  streak: 7,
};

export const recentFlights = [
  { flight: "BA117", route: "LHR → JFK", aircraft: "Boeing 777-200ER", duration: "7h 52m", date: "03 Sep 2026", landing: -146, points: 186 },
  { flight: "BA762", route: "LHR → OSL", aircraft: "Airbus A320neo", duration: "2h 09m", date: "01 Sep 2026", landing: -92, points: 74 },
  { flight: "BA281", route: "LHR → LAX", aircraft: "Boeing 787-9", duration: "10h 41m", date: "29 Aug 2026", landing: -211, points: 208 },
  { flight: "BA430", route: "LHR → AMS", aircraft: "Airbus A320", duration: "1h 08m", date: "27 Aug 2026", landing: -168, points: 56 },
];

export const featuredDestinations = [
  { city: "New York", code: "JFK", image: "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=1000&q=85" },
  { city: "Dubai", code: "DXB", image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1000&q=85" },
  { city: "Singapore", code: "SIN", image: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1000&q=85" },
  { city: "Los Angeles", code: "LAX", image: "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?auto=format&fit=crop&w=1000&q=85" },
];

export const fleet = [
  { type: "Airbus A319", family: "Short haul", count: 30 },
  { type: "Airbus A320", family: "Short haul", count: 67 },
  { type: "Airbus A320neo", family: "Short haul", count: 20 },
  { type: "Airbus A321neo", family: "Short haul", count: 18 },
  { type: "Airbus A350-1000", family: "Long haul", count: 18 },
  { type: "Boeing 777-200ER", family: "Long haul", count: 43 },
  { type: "Boeing 777-300ER", family: "Long haul", count: 16 },
  { type: "Boeing 787-8", family: "Long haul", count: 12 },
  { type: "Boeing 787-9", family: "Long haul", count: 18 },
  { type: "Boeing 787-10", family: "Long haul", count: 12 },
  { type: "Embraer E190", family: "BA CityFlyer", count: 20 },
];
