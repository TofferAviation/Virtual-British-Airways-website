# Satellite-observed Live clouds

Deployment is on hold. This replaces GFS cloud coverage in the website's live globe; it does not deploy a new hosted data service.

## Rules

- ACMF's good-quality four-level mask determines cloud support. Clear is exactly zero extinction, probably-clear is uncertain/unrendered, and missing/bad-quality/space/outside-footprint pixels are unknown.
- CODF supplies optical depth only when its retrieval is good-quality; ACHAF supplies cloud-top geopotential height only when good-quality. Missing/degraded retrievals are not replaced with made-up optical depth or tops. A mask can report cloud while its volume remains unknown/unrendered.
- Only cloud base and full thickness are estimated, with a bounded, documented heuristic from the available optical depth and top height. These are not measurements of overlapping/hidden cloud layers.
- Procedural noise supplies internal volume detail only after the categorical observation and property-availability gates. The same gates govern ground shadows.
- GFS is a motion prior, never a cloud-location or unknown-area fallback.

## Coverage and navigation

The first provider ingests public NOAA GOES-19/East and GOES-18/West full-disk ACMF, CODF and ACHAF NetCDF4 products. It uses each file's packed coordinate scales/offsets, actual perspective height, ellipsoid axes, projection-origin longitude, sweep axis, fill values and quality flags. Products are matched to the same scan and sampled on their own grids. Processing revisions of one scan do not count as consecutive observations.

Output is a north-first, cell-centred geographic grid with no duplicated dateline or pole row. The default 0.2° display grid is a performance choice, **not the native satellite resolution**. Optional 0.1° output increases memory/transfer costs. Categorical nearest-neighbour masks are never blurred into clear/unknown cells. Multi-satellite overlap selects the usable view with the lower local zenith angle. Views beyond 70° local zenith are excluded, not stretched to fill the rest of Earth.

GOES is **not a global provider**. Much of Europe, Africa, Asia and the polar regions remains unknown. Nominal ABI ellipsoid navigation is used; a full cloud-parallax correction is not implemented. More regional/global observations require separately verified providers; neither NASA daytime photographs nor GFS coverage silently fills these gaps.

## Motion

The ingester compares two synchronized consecutive mosaics. A bounded patch matcher uses real cloud-mask/optical-depth structure and existing GFS surface/FL180/FL300 winds as height-selected priors where available. Low-confidence matches retain the labelled wind prior; missing wind/transport evidence does not grant a development classification. Newly detected cover over a confidently clear previous neighbourhood, not explained by the estimated transport, is flagged developing. This is an inference, not a direct measurement of condensation or a high-resolution optical-flow solver.

The shader transports procedural detail and blends corresponding retrieved column properties over 12 seconds, constrained by the **latest observed mask**. A new clear/unknown report takes effect immediately. It does not extrapolate a cloud footprint into a newer clear/unknown cell, or claim that subpixel cloud structures and their movement were observed. Source scan times are retained per satellite; the composite timestamp is the latest scan end.

## Run ingestion locally

Requires a current Node 22 runtime with native TypeScript stripping (22.18+), or newer, and `npm ci`. The pinned `h5wasm` decoder runs only in the ingestion process, never in a viewer's browser.

```powershell
$env:BAV_CLOUD_WIND_ORIGIN = 'http://127.0.0.1:3107'
npm run clouds:ingest
```

For a continuously refreshed local preview, run `npm run clouds:watch` in one separate process. It waits five minutes between completed ingestion runs; the satellites' scan/product latency still determines observation age. Use only one ingester for a given output file. `npm run clouds:ingest -- --inspect` prints actual source metadata for diagnosis.

Configuration:

| Setting | Meaning |
| --- | --- |
| `BAV_SATELLITE_CLOUD_FILE` | Absolute/shared JSON output path; default `.bav-data/satellite-clouds/latest.json`. The web server and ingester must use the same file. |
| `BAV_CLOUD_WIND_ORIGIN` | Trusted website origin serving the existing public `/api/radar/wind-grid` endpoint. No account key or pilot data is sent. Missing wind fields are recorded, not fabricated. |
| `BAV_SATELLITE_STEP_DEG` | `.1`, `.2` (default), `.25` or `.5`. This resamples observations; it cannot add native sensor detail. |

The ingester downloads original public NOAA files into the ignored `.bav-data/satellite-clouds/raw` cache, retains three hours of its own named source files, and atomically replaces the validated JSON artifact. It does not write satellite data into Git/public assets, touch ACARS or call pilot/staff write APIs. Failed ingestion does not replace a verified artifact with manufactured data.

## Serving and deployment prerequisites

`/api/radar/clouds` reads the prepared artifact. Web requests do not download or decode large NetCDF files. File validation, gzip transport and GPU textures are reused for unchanged observations. An unchanged refresh does not reset the visual transition. The client polls once per minute.

Both the API and renderer expire observations after 35 minutes, based on the contributing source scan ends. No stale-while-revalidate cloud fallback is allowed. No usable artifact produces a successful explicit **unknown** field, not a clear-sky claim. A fetch failure clears the active cloud field rather than preserving ghost clouds indefinitely. The interface reports geographic unknown coverage, retrieval reconstruction availability and the state below the camera.

Before deployment, provision the ingestion process and a shared durable artifact path accessible to the website, and measure its peak RAM/network costs against the existing hosting plan. Large HDF5 source arrays must not be processed once per viewer or inside a low-memory web request. **No paid worker, cron service, storage resource, global provider account or deployment has been created.** The current Render start command is unchanged; deploying source alone does not start the ingester. Without a running data job, the site correctly becomes unknown as its last observation expires.

## Checks and limitations

`npm run test:satellite-clouds` covers independent NOAA projection round trips, distinct product grids, categorical clear/unknown handling, bounded base estimates, missing retrievals, stale/malformed artifacts, compressed transport, translated-feature tracking, developing-cover evidence and the shader's pre-noise gates. Existing globe/cloud/integration tests remain in use.

This is a conservative reconstruction, not observed 3D cloud interiors, calibrated radiance, global satellite coverage, a forecast or a flight-safety weather product. Strict good-quality retrieval requirements can make reconstructed volume coverage much smaller than detected cloud coverage; this must remain visible instead of being “fixed” with fake fields.

### Local verification, 23 October 2026

- All 78 satellite/cloud/globe/integration tests passed, along with TypeScript and targeted ESLint checks. The production build passed with 10 filesystem tracing warnings; the observation artifact is intentionally a separately provisioned runtime file, not a bundled build asset.
- The production `/ba-radar` preview served version 2 observations and displayed the satellite-only controls, source time, clear/unknown rules and retrieval availability. No browser/shader errors were reported during that check.
- Two consecutive GOES-18/19 scans ending around 19:59 UTC classified 31% of the display grid; 69% remained geographically unknown. 16,256 of 350,417 detected cloud cells (4.6%) had both accepted retrievals. Missing/degraded optical depth was the main limitation. These are snapshot counts, not guaranteed coverage.
- The observed-Americas QA preset used live UTC sunlight and the real observation field, not synthetic calibration. The stationary 1024 × 376 render reached its 60 fps cap on this test machine with an 870 × 319 cloud buffer; this is not a low-end hardware performance guarantee. An Africa/Europe check reported unknown beneath the camera without generated cloud fill.
- Deployment, an ongoing hosted ingestion job, shared storage and additional regional providers remain outstanding. Neither the accepted aurora appearance nor its controls were changed.

Primary references: [NOAA ABI navigation](https://www.star.nesdis.noaa.gov/atmospheric-composition-training/satellite_data_goes_imager_projection.php), [NOAA GOES public archive](https://github.com/NOAA-Big-Data-Program/nodd-data-docs/blob/main/GOES/README.md), [cloud mask](https://www.goes-r.gov/products/baseline-clear-sky-mask.html), [optical depth](https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ncdc%3AC01508), [cloud-top height](https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ncdc%3AC01505).
