import { buildCloudFootprint, CLOUD_BOUNDARY_BAND_KM, type CloudFootprintRequest } from "@/lib/radar-cloud-footprint";
import { buildSatelliteRenderTexture } from "@/lib/radar-satellite-render";

self.addEventListener("message", (event: MessageEvent<CloudFootprintRequest>) => {
  const { id, pixels, width, height, scale } = event.data;
  try {
    const field = buildCloudFootprint(pixels, width, height, scale, CLOUD_BOUNDARY_BAND_KM);
    const properties = buildSatelliteRenderTexture(pixels,width,height,false,CLOUD_BOUNDARY_BAND_KM);
    self.postMessage({ ...field,id,properties }, { transfer: [field.pixels.buffer,properties.buffer] });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
});
