# BAV Aurora API — Partner Installation Guide

This guide connects your flight-logger map to British Airways Virtual's
read-only aurora feed. The feed contains live NOAA SWPC OVATION Prime aurora
forecast samples only; it does not expose BAV pilots, flight data, accounts,
or Fleet information.

## 1. What you need

- A server-side application or serverless function (Node.js examples below).
- The private BAV Aurora API key supplied separately by BAV Operations.
- An environment-variable manager for your hosting provider.

> Do **not** add the BAV API key to browser JavaScript, a public GitHub
> repository, or a client-side map configuration. Anyone who can view it could
> reuse it. Your backend should call BAV, then return only the aurora data your
> browser map needs.

## 2. Add the key to your server environment

Create this private environment variable in your server or hosting dashboard:

```text
BAV_AURORA_PARTNER_KEY=PASTE_THE_PRIVATE_KEY_BAV_GAVE_YOU
```

Restart or redeploy your application after saving it.

## 3. BAV API endpoint

```text
GET https://virtualairline.co.uk/api/partner/v1/aurora
```

Authenticate with this header:

```http
Authorization: Bearer YOUR_BAV_AURORA_PARTNER_KEY
```

The feed is read-only. BAV caches its NOAA source for up to five minutes; you
should cache the response on your side for around 60 seconds rather than
calling it for every map frame or every visitor.

## 4. Node.js / TypeScript server example

Use this from a server route, backend worker, API handler, or scheduled cache
job — not from a browser component.

```ts
export type AuroraSample = {
  longitude: number;
  latitude: number;
  probability: number;
};

export type BavAuroraResponse = {
  source: "NOAA SWPC OVATION Prime";
  observedAt: string | null;
  forecastAt: string | null;
  refreshedAt: string;
  samples: AuroraSample[];
};

export async function getBavAurora(): Promise<BavAuroraResponse> {
  const key = process.env.BAV_AURORA_PARTNER_KEY;
  if (!key) throw new Error("BAV_AURORA_PARTNER_KEY is not configured.");

  const response = await fetch(
    "https://virtualairline.co.uk/api/partner/v1/aurora",
    {
      headers: { Authorization: `Bearer ${key}` },
      // In Next.js this prevents more than one upstream request each minute.
      next: { revalidate: 60 },
    },
  );

  if (!response.ok) {
    throw new Error(`BAV Aurora API returned ${response.status}.`);
  }

  return response.json() as Promise<BavAuroraResponse>;
}
```

## 5. Proxy it to your browser map

Your map frontend should call your own API route. Example Next.js route:

```ts
// app/api/aurora/route.ts
import { NextResponse } from "next/server";
import { getBavAurora } from "@/lib/get-bav-aurora";

export async function GET() {
  try {
    return NextResponse.json(await getBavAurora(), {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=240" },
    });
  } catch {
    return NextResponse.json({ error: "Aurora feed is temporarily unavailable." }, { status: 503 });
  }
}
```

Your client map can then fetch `/api/aurora` without ever receiving the BAV
partner key.

## 6. Reading the samples

Each sample has:

| Field | Meaning |
| --- | --- |
| `longitude` | WGS-84 longitude in degrees, from -180 to 180. |
| `latitude` | WGS-84 latitude in degrees. |
| `probability` | NOAA OVATION aurora probability from 0 to 100. |

Only meaningful high-latitude samples are returned. A straightforward map
display can render a semi-transparent point, heatmap, or interpolated band;
stronger probability values should have higher opacity or brightness.

## 7. Test it

Run this on your server or local machine after exporting the key:

```bash
curl -i https://virtualairline.co.uk/api/partner/v1/aurora \
  -H "Authorization: Bearer $BAV_AURORA_PARTNER_KEY"
```

Expected result: HTTP `200` with a JSON payload containing `samples`.

Common errors:

| Status | Meaning | Fix |
| --- | --- | --- |
| `401` | The key is absent or incorrect. | Check the environment variable and `Bearer` header. |
| `503` | BAV has not enabled a partner key on its host yet. | Ask BAV Operations to confirm the deployment environment variable is set. |
| `5xx` | A temporary BAV or NOAA upstream issue. | Keep your last successful result briefly and retry later. |

## 8. Key handling and revocation

Treat the key as a password. If it is accidentally exposed, tell BAV
Operations immediately; they can remove it and issue a replacement without
changing the public endpoint.
