export default function GlobeSources() {
  return <main style={{maxWidth:850,margin:"40px auto",padding:24,lineHeight:1.6}}>
    <h1>Globe terrain, imagery and aurora sources</h1>
    <p>Terrain relief is derived from <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen Terrain Tiles on AWS Open Data</a>. Heights are resampled into geographic meshes without vertical exaggeration. Source geoid heights are applied over WGS84 without a geoid-to-ellipsoid correction. This globe is a visualisation, not a navigation or surveying tool.</p>
    <p>Terrain is limited to 85.0511° north/south by the Mercator source. Polar caps retain the WGS84 ellipsoid and ground descent is disabled there. Missing terrain keeps the parent surface; descent waits for a valid local DEM. Imagery is historical NASA GIBS Blue Marble / Landsat, not street-level photogrammetry. Ground views will not contain buildings, trees or photographic ground detail.</p>
    <h2>Terrain attribution</h2>
    <ul>
      <li>ArcticDEM terrain DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736.</li>
      <li>Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017.</li>
      <li>Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich.</li>
      <li>Canada terrain data contains information licensed under the Open Government Licence – Canada.</li>
      <li>Europe terrain data produced using Copernicus data and information funded by the European Union – EU-DEM layers.</li>
      <li>Global ETOPO1 terrain data: U.S. National Oceanic and Atmospheric Administration.</li>
      <li>Mexico terrain data source: INEGI, Continental relief, 2016.</li>
      <li>New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved).</li>
      <li>Norway terrain data © Kartverket.</li>
      <li>United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved.</li>
      <li>United States 3DEP (formerly NED), global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey.</li>
    </ul>
    <p><a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Provider terms, full attribution and source documentation</a>.</p>
    <h2>Aurora and clouds</h2>
    <p>NOAA SWPC OVATION supplies auroral geographic activity, not measured photon radiance or predictions of individual curtains. Rays, folds, animation and spectral appearance are procedural, physically inspired visual detail.</p>
    <p>Live clouds use NOAA GOES-18/19 ABI clear-sky masks (ACMF) for locations, good-quality cloud optical depth (CODF) and cloud-top height (ACHAF) retrievals for appearance. Each product is decoded and navigated using its own coordinate scales and the satellite projection metadata. Clear pixels have zero cloud extinction. Missing, stale, bad-quality and outside-footprint pixels are unknown, not clear, and are never filled with GFS or procedural coverage. GOES is regional, not global; Europe, much of Asia/Africa and polar areas can be unknown.</p>
    <p>Only base altitude and thickness are estimates. A detected cloud without good-quality optical-depth AND cloud-top-height retrievals is marked “cloud detected · volume unknown”; no substitute optical depth or top height is invented. Optical depth informs extinction; procedural volumes are not a radiometrically exact inversion of COD or an observation of hidden cloud layers. The default 0.2° display grid is resampled, not the products’ native resolution. Locations use nominal ABI ellipsoid navigation; cloud parallax and subpixel cloud edges remain limitations.</p>
    <p>Consecutive observations provide feature-motion estimates, with existing NOAA GFS winds as a prior where available. New supported cloud cover unexplained by transport is labelled developing; it is an inference. Motion and detail are constrained to the latest observed cloud mask—never extrapolated into confidently clear/unknown cells. Source-property transitions are smoothed, but a new confident clear report takes effect immediately.</p>
    <p><a href="https://www.star.nesdis.noaa.gov/atmospheric-composition-training/satellite_data_goes_imager_projection.php">NOAA ABI navigation</a> · <a href="https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ncdc%3AC01508">Cloud optical depth</a> · <a href="https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ncdc%3AC01505">Cloud-top height</a>.</p>
    <p>The optional screenshot colour override adjusts green, red, violet/pink and blue emission strengths for artistic screenshots, not measured NOAA colours. It leaves coverage, height profiles and curtain motion unchanged. With it switched off, or all colour strengths at 100%, the original palette is used.</p>
    <p>Manual Kp simulation is a separate, opt-in screenshot preview from 0 to 9. Its art-directed tilted-dipole oval becomes brighter, broader and more equatorward as the setting rises. It is not a calibrated Kp-to-OVATION model, observation or viewing forecast. Live NOAA data is never modified; switching back restores the latest live field. Source changes blend over 12 seconds. Ray tempo is procedural, with a calmer default speed and independently easing bundles, not measured real-time ray motion.</p>
    <p>Auroral ray inclination uses the full degree/order 12 <a href="https://www.ncei.noaa.gov/products/world-magnetic-model">WMM2025 model</a> with secular variation, evaluated on a bounded local direction lattice. This is local field-aligned geometry, not full magnetospheric particle tracing. WMM2025 coefficients are public-domain U.S. Government material, produced by NOAA NCEI and the British Geological Survey. The model is valid for 2025–2029; outside that epoch, ray inclination falls back to local vertical without moving NOAA activity.</p>
    <p><a href="https://www.spaceweather.gov/content/aurora-tutorial">NOAA aurora tutorial</a> · <a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast">OVATION forecast documentation</a>.</p>
  </main>;
}
