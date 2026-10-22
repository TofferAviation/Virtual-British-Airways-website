# BAV Aurora Partner API

This is a read-only, server-to-server feed of BAV's normalized NOAA SWPC
OVATION Prime aurora forecast. It does not expose pilots, flight positions,
accounts, Fleet data, or any other BAV data.

## Endpoint

`GET https://virtualairline.co.uk/api/partner/v1/aurora`

Send one of the following headers:

```http
Authorization: Bearer YOUR_PARTNER_KEY
```

or:

```http
X-BAV-Aurora-Key: YOUR_PARTNER_KEY
```

The response is cached privately for 60 seconds. BAV refreshes its NOAA source
cache every five minutes.

```json
{
  "source": "NOAA SWPC OVATION Prime",
  "observedAt": "2026-10-22T12:00:00Z",
  "forecastAt": "2026-10-22T12:00:00Z",
  "samples": [
    { "longitude": -18, "latitude": 67, "probability": 24 }
  ],
  "refreshedAt": "2026-10-22T12:03:00.000Z"
}
```

`longitude` and `latitude` are WGS-84 degrees. `probability` is an OVATION
probability percentage between 0 and 100. BAV omits zero-probability cells and
low-latitude points that cannot be part of an auroral oval.

## Node / server integration

Keep the key in the partner's server environment, never in browser code.

```ts
const response = await fetch("https://virtualairline.co.uk/api/partner/v1/aurora", {
  headers: { Authorization: `Bearer ${process.env.BAV_AURORA_PARTNER_KEY}` },
  next: { revalidate: 60 },
});

if (!response.ok) throw new Error(`BAV aurora request failed: ${response.status}`);
const aurora = await response.json();
// aurora.samples: Array<{ longitude: number; latitude: number; probability: number }>
```

## Key rotation and revocation

Set `BAV_AURORA_PARTNER_API_KEYS` in BAV's deployment environment to a
comma-separated list of active keys. Adding a new key rotates access without
interrupting an existing partner; removing a key revokes it immediately after
deployment. Never commit a real key to source control.
