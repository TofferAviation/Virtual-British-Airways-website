# Terrain and NOAA aurora integration (2026-10-23)

Open `http://127.0.0.1:3107/dev/globe`. This remains a local change; it has not been deployed.

## Ground and terrain

The camera now has a **Go to ground · 5 m** control. Wheel and Q/E can also descend. Clearance is checked against the same triangular DEM interpolation used by the displayed mesh, not an assumed spherical Earth. Unknown or insufficient local terrain holds descent at 9.1 km until a valid tile is ready. Unsupported polar terrain never permits ground descent.

Near-ground wheel and keyboard speed use clearance above terrain rather than mountain elevation, so a small zoom over a 3 km mountain does not jump hundreds of metres. Eye positions use full geodetic height, not a radial approximation that shifts the eye sideways into steep terrain.

Mapzen Terrarium tiles from AWS Open Data are decoded as numeric heights (R × 256 + G + B/256 − 32768), resampled into 65 × 65 geographic height grids, and applied at real scale over WGS84. Source elevations use source geoid datums: no survey-grade geoid-to-ellipsoid correction is claimed. Bathymetry is held at sea level. The Mercator source does not cover latitudes beyond ±85.05112878°; those caps remain ellipsoidal.

Tile-local vertices plus an eye-relative world origin preserve close-up precision. Logarithmic depth, inward LOD skirts, updated normals, real terrain depth for cloud clipping and cloud-shadow sampling, and depth-tested atmosphere prevent terrain penetration, cracks and sky/cloud overlays across ridges.

DEM requests share the existing client concurrency limit (one DEM in flight), reserve future geometry memory, abort obsolete work and dispose released buffers. The fixed-origin server proxy allows only validated z/x/y coordinates, caps upstream concurrency at three, and retains at most 64 decoded 256² DEM tiles (~16 MiB). Geometry can refine to LOD 14 (Low: 12); imagery stops at LOD 10 and is correctly cropped/reused above its native level. Historical Landsat is approximately 30 m imagery, not ground-level photogrammetry, buildings or trees.

Low resizes only the two distant fallback roots to 512², preserving locally downloaded detail. Ground mode prioritises the collision tile over distant horizon refinement. Under cache pressure, finer DEM meshes can borrow a correctly cropped parent image rather than waiting for four new texture allocations; higher quality opportunistically upgrades borrowed imagery when budget allows. Split estimates are recounted before network scheduling so unused sibling reservations cannot starve elevation requests. The scheduler regression explicitly descends in Low within its 48 MiB budget and then upgrades/downgrades without holes or request-budget violations.

Provider attribution and limitations are published at `/globe-sources`.

## Aurora

The complete operational NOAA grid is validated, including quiet/zero cells, coordinate order, unique cells, timestamps, regular one-degree coverage and both hemispheres. Unsupported resolution/schema changes fail closed. The last verified snapshot survives refresh errors in the server's process cache and is marked stale. This is not persistent storage across a server restart. Refresh is every five minutes, with one-minute retry backoff after upstream failure. Older observation snapshots are rejected.

The GPU receives a periodic 360 × 181 activity texture. Multiple activity-weighted tracks reconstruct irregular geographic curtains across the forecast's width rather than collapsing it into one centreline. Geographic interpolation and local deterministic noise constrain detail; quiet regions cannot become a synthetic storm. Forecast updates morph existing buffers and blend activity over 12 seconds; the vertex shader corrects chord interpolation back to the intended emission altitude. The model uses eight meshes, no per-frame geometry rebuild, and less than 16 MiB of curtain geometry even at High.

Full degree/order 12 WMM2025 with secular variation inclines rays using a bounded 4° direction lattice. NOAA geographic activity is **not rotated again** or expanded using Kp. WMM2025 passes NOAA's 100 official field-component test vectors to within 0.2 nT. Model validity is 2025–2029 and −1 to 850 km; expired epochs use explicitly documented local-vertical geometry instead of extrapolated magnetic results. This is local field alignment, not a full magnetospheric field-line/particle simulation.

Emission spans 95–450 km: a broad green oxygen profile, fainter high-altitude red oxygen and restrained lower nitrogen colour. Spatial noise generates evolving nonuniform rays; derivative filtering suppresses subpixel shimmer. Animation speed and pause use an accumulated clock, not a phase reset. Both hemispheres remain independent. Atmosphere attenuates emission without adding its sky term twice. Opaque terrain occludes far-side curtains; below-cloud views composite aurora before clouds so cloud opacity masks it. From orbit it is composited above the troposphere. Within the cloud volume, a single before/after switch at 18 km is an approximation, not a per-sample unified cloud/aurora integrator.

Rendering is physically inspired, not calibrated spectral radiance or a plasma simulation. Display-RGB spectral approximations and additive transparency are used; there is no full-frame HDR radiometric composition, OIT or added bloom pass. Enhanced photography changes emission exposure only, never coverage or altitude. NOAA does not observe/predict the individual displayed folds, rays or colour.

## Verification

`npm run test:globe` covers geodesy, safe zoom/clipping, camera input, frame budgets, real Three tile scheduling, memory/request limits, DEM decode/projection/triangle interpolation, complete NOAA field validation/seams/multiple latitude peaks/quiet fields, official WMM vectors and actual curtain heights/seams/resource budgets/buffer-preserving forecast morphs. `npm run test:clouds` covers existing weather/noise regressions.

The visual QA page includes north/south/night/Norway/oblique aurora/limb, mountain/ground/flight views; raw NOAA field and altitude modes; both hemisphere selectors; labelled synthetic quiet/active/shifted forecasts; pause, continuous camera motion and a six-second canvas recording control. Synthetic datasets are never production fallbacks. Test Sun timestamps are deliberately fixed and shown separately from live forecast-valid time.

Browser checks reached 5 m AGL on alpine terrain with lateral movement and downward collision protection; the initial oblique mountain view and settled ground view ran at 60 fps on the current computer. These are local measurements, not a guarantee for low-end hardware. Existing adaptive quality/frame caps and cache reuse remain enabled.

The live oblique aurora view also ran at 60 fps. During continuous camera motion with clouds, measured GPU frame time was around 2.9–3.4 ms at the 1024 × 376 internal ground resolution used by this browser. A real six-second, 30 fps canvas stream was saved as `globe-aurora-orbit-20261023.webm` in the parent workspace folder; it is not an image-generation mockup. Screenshots were saved there as `globe-ground-terrain-20261023.jpg` and `globe-noaa-aurora-20261023.jpg`.

The browser also reached 5 m AGL in Low at its 30 fps cap, with 46.9 MiB reserved against a 48 MiB terrain budget and 62 nodes against its 72-node cap. This is a profile check on the same computer, not a benchmark on genuine low-end hardware.

NOAA's official northern/southern image URLs returned HTTP 403 to this environment during verification. Coordinate tests validate the actual JSON grid and debug views show it, but a same-valid-time comparison with NOAA's rendered map images could not be completed; no such comparison is claimed.

## Primary sources

- [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), [encoding](https://github.com/tilezen/joerd/blob/master/docs/formats.md), [attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
- [NOAA Aurora Tutorial](https://www.spaceweather.gov/content/aurora-tutorial).
- [NOAA OVATION forecast documentation](https://www.spaceweather.gov/products/aurora-30-minute-forecast) and [operational JSON](https://services.swpc.noaa.gov/json/ovation_aurora_latest.json).
- [NOAA/BGS WMM2025](https://www.ncei.noaa.gov/products/world-magnetic-model), [official coefficients](https://www.ncei.noaa.gov/sites/default/files/2024-12/WMM2025COF.zip). Bundled coefficient and test-vector files are public-domain U.S. Government material, retrieved 2026-10-23.
