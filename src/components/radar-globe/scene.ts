import * as THREE from "three";
import type {
  RadarAuroraData,
  RadarCloudData,
  VatsimStation,
} from "@/lib/radar-external";
import type { PublicRadarFlight } from "@/lib/radar-live";
import type { CloudSettings } from "@/components/BaRadarCloudLayer";
import type { AuroraSettings } from "@/components/BaRadarAuroraLayer";
import { auroraPhotoUniforms } from "@/lib/radar-aurora-photo";
import { advanceAuroraTime, auroraMotionSpeed } from "@/lib/radar-aurora-motion";
import { auroraKpOverride, auroraKpField } from "@/lib/radar-aurora-kp";
import { SATELLITE_MAX_AGE_MS, satelliteGridIndex } from "@/lib/radar-satellite-math";
import { buildSatelliteRenderTexture, observedCloudDistance } from "@/lib/radar-satellite-render";
import { CLOUD_BOUNDARY_BAND_KM, sampleCloudFootprint, type CloudFootprint, type CloudFootprintResponse } from "@/lib/radar-cloud-footprint";
import { ACCEPTED_CLOUD_REVISION } from "./cloud-appearance";
import {
  WGS84_A_KM,
  WGS84_B_KM,
  geodeticToWorld,
  geodeticNormal,
  solarDirection,
  wrapLongitude,
  globeClipRange,
  globeOverviewDistance,
  globeZoomTarget,
  globeAltitudeStep, globeDescentFloor,
} from "@/lib/radar-globe-geodesy";
import { GlobeSurface } from "./surface";
import { GlobeAircraft } from "./aircraft";
import { flightTrackGeometry } from "./flight-track";
import { flightAltitudeMetres, type FlightTrackPoint } from "@/lib/radar-aircraft";
import { buildAuroraCurtains, updateAuroraCurtains } from "./aurora";
import { auroraField } from "@/lib/radar-aurora-field";
import { AdaptiveGlobeQuality, GLOBE_PROFILES, globeRenderSize, type GlobeQuality } from "@/lib/radar-globe-quality";
import { GlobeGpuTimer } from "./gpu-timer";
import { globeDragMode, globeLookDrag, globePanDrag, globePanPosition, nextGlobeFrame, type GlobeDragMode } from "@/lib/radar-globe-navigation";
import { GlobeCloudCache, movingCloudSize } from "@/lib/radar-globe-cloud-cache";
import { TERRAIN_CLEARANCE_KM } from "@/lib/radar-globe-elevation";
import {
  surfaceVertex,
  surfaceFragment,
  volumeVertex,
  cloudFragment,
  atmosphereFragment,
  auroraVertex,
  auroraFragment,
  groundShadowFragment,
  compositeVertex,
  cloudCompositeFragment,
  auroraFieldVertex, auroraFieldFragment,
  terrainDepthFragment,
} from "./shaders";

export type GlobeCamera = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};
export type GlobeReplay = {
  id: string;
  aircraft?: string;
  points: Array<FlightTrackPoint & { headingDeg: number }>;
  activeIndex: number;
} | null;
export type GlobeSceneState = {
  flights: PublicRadarFlight[];
  selectedId: string;
  onSelect: (id: string) => void;
  controllers: VatsimStation[];
  onSelectController: (callsign: string) => void;
  replay: GlobeReplay;
  auroraEnabled: boolean;
  aurora: RadarAuroraData | null;
  auroraSettings: AuroraSettings;
  cloudsEnabled: boolean;
  cloudData: RadarCloudData | null;
  cloudSettings: CloudSettings;
  dayNightEnabled: boolean;
  initialCamera: GlobeCamera | null;
  onCameraChange: (camera: GlobeCamera) => void;
  /** Used exclusively by the local visual regression page. */
  testDate?: string;
  /** Local QA only: compare moving/full-resolution/uncached workloads. */
  testCloudCache?: boolean;
  testCameraMotion?: boolean;
  /** Explicitly labelled, development-only density calibration. Never a live fallback. */
  testCloudProfile?: { coverage: number; baseKm: number; topKm: number };
  testView?: {
    latitude: number;
    longitude: number;
    distanceKm: number;
    pitch?: number;
    fov?: number;
    bearing?: number;
  };
};

function clearGroup(group: THREE.Group) {
  for (const object of [...group.children]) {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    group.remove(object);
  }
}
function ellipsoidShell(heightKm: number) {
  const geometry = new THREE.SphereGeometry(WGS84_A_KM + heightKm, 128, 96);
  geometry.scale(1, (WGS84_B_KM + heightKm) / (WGS84_A_KM + heightKm), 1);
  return geometry;
}
function decodeTexture(data: RadarCloudData, encoded: string, nearest=false) {
  const binary = atob(encoded),
    values = new Uint8Array(binary.length);
  if (binary.length !== data.width * data.height * 4)
    throw new Error("Incomplete cloud field");
  for (let i = 0; i < binary.length; i++) values[i] = binary.charCodeAt(i);
  const texture = new THREE.DataTexture(
    values,
    data.width,
    data.height,
    THREE.RGBAFormat,
  );
  texture.minFilter = texture.magFilter = nearest?THREE.NearestFilter:THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
function satelliteShapeTexture(data: RadarCloudData, observed: THREE.DataTexture, reconstructSupport = true) {
  const texture = new THREE.DataTexture(buildSatelliteRenderTexture(observed.image.data as Uint8Array, data.width, data.height, reconstructSupport), data.width, data.height, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function createGlobeScene(
  host: HTMLDivElement,
  read: () => GlobeSceneState,
  noise: [THREE.Data3DTexture, THREE.Data3DTexture],
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true,
  });
  renderer.setClearColor("#01040a");
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.info.autoReset = false;
  const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const adaptive = new AdaptiveGlobeQuality({ mobile: /Android|iPhone|iPad/i.test(navigator.userAgent), memoryGb: device.deviceMemory, cores: device.hardwareConcurrency, saveData: device.connection?.saveData });
  let effectiveQuality: GlobeQuality = read().cloudSettings.quality === "auto" ? adaptive.quality : read().cloudSettings.quality as GlobeQuality;
  let profile = GLOBE_PROFILES[effectiveQuality];
  let lastRequestedQuality = read().cloudSettings.quality;
  const gpuTimer = new GlobeGpuTimer(renderer.getContext() as WebGL2RenderingContext);
  if (process.env.NODE_ENV !== "production")
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      const message = [
        gl.getProgramInfoLog(program),
        gl.getShaderInfoLog(vertex),
        gl.getShaderInfoLog(fragment),
      ]
        .filter(Boolean)
        .join("\n");
      window.dispatchEvent(
        new CustomEvent("globe-shader-error", { detail: message }),
      );
      console.error(message);
    };
  renderer.domElement.className = "ba-radar-globe-three-canvas";
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive WGS84 Earth globe",
  );
  renderer.domElement.tabIndex = 0;
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement,
    scene = new THREE.Scene(),
    earth = new THREE.Group();
  scene.add(earth);
  canvas.style.cursor = "grab";
  const initial = read().initialCamera,
    testView = read().testView;
  const camera = new THREE.PerspectiveCamera(testView?.fov ?? 35, 1, 0.5, 120000);
  const zoomDistance = (zoom: number) =>
    WGS84_A_KM * (1 + 1.7 * Math.exp(-zoom * 0.38));
  camera.position.set(
    0,
    0,
    testView?.distanceKm ?? (initial ? zoomDistance(initial.zoom) : globeOverviewDistance(host.clientWidth / Math.max(1, host.clientHeight), camera.fov)),
  );
  camera.lookAt(0, 0, 0);
  let targetDistance = camera.position.z,
    distance = Math.max(targetDistance, WGS84_A_KM + 9.1),
    initialDescent = targetDistance < distance;
  let verticalVelocity = 0, groundPitchTarget: number | null = null;
  let maxDescentFrameFraction=0,lastCameraTrace=0;
  const cameraTrace: number[][]=[];
  let pitch = THREE.MathUtils.clamp(testView?.pitch ?? initial?.pitch ?? 0, 0, 175);
  let bearing = testView?.bearing ?? initial?.bearing ?? 0;
  let longitude = testView?.longitude ?? initial?.center[0] ?? -25,
    latitude = testView?.latitude ?? initial?.center[1] ?? 35;
  // A stable east/north/up frame keeps heading meaningful when the camera
  // pans across longitudes or poles. The previous shortest-arc rotation did
  // not preserve north, and stored bearing was never applied to the camera.
  let surfaceRadius = WGS84_A_KM;
  const orbit = () => {
    const target = new THREE.Vector3(
      ...geodeticToWorld(latitude, longitude),
    );
    surfaceRadius = target.length();
    const up = new THREE.Vector3(...geodeticNormal(latitude,longitude));
    const lambda = THREE.MathUtils.degToRad(longitude);
    const east = new THREE.Vector3(Math.cos(lambda), 0, -Math.sin(lambda));
    const north = new THREE.Vector3().crossVectors(up, east).normalize();
    earth.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, up)).invert();
    earth.updateMatrixWorld(true);
  };
  orbit();
  const fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  fallback.needsUpdate = true;
  const [base, detail] = noise;
  const shared = {
    uSun: {
      value: new THREE.Vector3(
        ...solarDirection(new Date(read().testDate ?? Date.now())),
      ),
    },
    uCamera: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uDayNight: { value: 1 },
    uLowWeather: { value: fallback },
    uMiddleWeather: { value: fallback },
    uHighWeather: { value: fallback },
    uSatelliteCurrent: {value:fallback},uSatellitePrevious:{value:fallback},uSatelliteMotion:{value:fallback},
    uSatelliteShapeCurrent:{value:fallback},uSatelliteShapePrevious:{value:fallback},
    uSatelliteFootprint:{value:fallback},uSatelliteFootprintReady:{value:0},
    uSatelliteMode:{value:1},uObservationBlend:{value:1},uObservationInterval:{value:0},
    uBaseNoise: { value: base },
    uDetailNoise: { value: detail },
    uLayers: { value: new THREE.Vector3(1, 1, 1) },
    uClouds: { value: 0 },
    uCloudOpacity: { value: 1 },
    uShadows: { value: 1 },
    uDebug: { value: 0 },
    uPixelAngle: { value: 0.001 },
    uAirSamples: { value: profile.airSamples as number },
    uShadowSamples: { value: profile.shadowSamples as number },
    uGroundSize: { value: new THREE.Vector2(1, 1) },
    uShadowRegion: { value: new THREE.Vector4(1, 1, 1, 1) },
    uTerrainDepth:{value:null as THREE.Texture|null},uTerrainDepthSize:{value:new THREE.Vector2(1,1)},uTerrainDepthViewport:{value:new THREE.Vector2(1,1)},uShadowDrawSize:{value:new THREE.Vector2(1,1)},
  };
  const testProfile = process.env.NODE_ENV !== "production" ? read().testCloudProfile : undefined;
  const testCloudTexture = testProfile ? new THREE.DataTexture(
    new Uint8Array([Math.round(testProfile.coverage * 255), Math.round(testProfile.baseKm * 10), Math.round(testProfile.topKm * 10), 255]),
    1, 1, THREE.RGBAFormat,
  ) : null;
  if (testCloudTexture) {
    testCloudTexture.needsUpdate = true;
    shared.uLowWeather.value = testCloudTexture;
    shared.uSatelliteMode.value=0; // Explicitly labelled development calibration only.
  }
  const material = (
    vertexShader: string,
    fragmentShader: string,
    uniforms: Record<string, THREE.IUniform> = {},
  ) =>
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      // Live programs contain only observed reconstruction, not three unused
      // forecast density trees at every lighting probe. Calibration is QA-only.
      defines: testProfile ? { BAV_FORECAST_CALIBRATION: 1 } : {},
      uniforms: { ...shared, ...uniforms },
      vertexShader,
      fragmentShader,
    });
  const surface = new GlobeSurface(
    (texture, night) =>
      material(surfaceVertex, surfaceFragment, {
        uSurface: { value: texture },
        uNight: { value: night },
        uGroundShadow: { value: null },
      }),
    renderer.capabilities.getMaxAnisotropy(),
  );
  earth.add(surface.group);
  const cloudMaterial = material(volumeVertex, cloudFragment, {
    uSteps: { value: 48 },
    uLightSamples: { value: 6 },
    uLightStepKm: { value: 0.16 },
  });
  cloudMaterial.transparent = true;
  cloudMaterial.depthWrite = false;
  cloudMaterial.side = THREE.BackSide;
  cloudMaterial.depthTest = false;
  const cloudMesh = new THREE.Mesh(ellipsoidShell(18), cloudMaterial);
  cloudMesh.renderOrder = 3;
  cloudMesh.layers.set(1);
  earth.add(cloudMesh);
  const shadowMaterial = material(volumeVertex, groundShadowFragment);
  shadowMaterial.depthTest = shadowMaterial.depthWrite = false;
  shadowMaterial.side = THREE.BackSide;
  const shadowMesh = new THREE.Mesh(ellipsoidShell(80), shadowMaterial);
  shadowMesh.layers.set(3);
  earth.add(shadowMesh);
  const cloudTarget = new THREE.WebGLRenderTarget(1, 1, { type: renderer.extensions.has("EXT_color_buffer_float") ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false });
  const shadowTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const terrainDepthTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  const terrainDepthMaterial=material(surfaceVertex,terrainDepthFragment,{uTileOrigin:{value:new THREE.Vector3()}});
  shared.uTerrainDepth.value=terrainDepthTarget.texture;
  const cloudCache = new GlobeCloudCache();
  const compositeScene = new THREE.Scene(), compositeCamera = new THREE.Camera();
  const compositeMaterial = new THREE.ShaderMaterial({ vertexShader: compositeVertex, fragmentShader: cloudCompositeFragment, glslVersion: THREE.GLSL3, uniforms: { uCloudImage: { value: cloudTarget.texture }, uCloudRegion: { value: new THREE.Vector4(1, 1, 1, 1) } }, transparent: true, depthWrite: false, depthTest: false });
  const compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
  compositeQuad.frustumCulled = false;
  compositeScene.add(compositeQuad);
  let cloudPrograms: "idle" | "compiling" | "ready" | "failed" = "idle", cloudCompileRevision = 0;
  const prepareCloudPrograms = () => {
    if (cloudPrograms !== "idle") return;
    cloudPrograms = "compiling";
    const revision = ++cloudCompileRevision, previousTarget = renderer.getRenderTarget();
    // Compile against each pass's actual output colour space. Compiling only
    // the onscreen variant still stalls on the first offscreen volume draw.
    const prepare = async () => {
      try {
        renderer.setRenderTarget(cloudTarget);
        const volume = renderer.compileAsync(cloudMesh, camera, scene);
        renderer.setRenderTarget(shadowTarget);
        const shadow = renderer.compileAsync(shadowMesh, camera, scene);
        renderer.setRenderTarget(null);
        const composite = renderer.compileAsync(compositeScene, compositeCamera);
        await Promise.all([volume, shadow, composite]);
        if (!disposed && revision === cloudCompileRevision) { cloudPrograms = "ready"; cloudCache.invalidate(); }
      } catch (error) {
        if (!disposed && revision === cloudCompileRevision) { cloudPrograms = "failed"; console.error("Cloud graphics preparation failed", error); }
      }
    };
    void prepare();
    // compileAsync starts synchronously but polls readiness asynchronously;
    // restore render state before the ordinary globe frame continues.
    renderer.setRenderTarget(previousTarget);
  };
  const atmosphereMaterial = material(volumeVertex, atmosphereFragment);
  atmosphereMaterial.transparent = true;
  atmosphereMaterial.depthWrite = false;
  // A tilted close-up can enter the 80 km atmosphere. March the back face
  // in both cases; the analytic ground intersection clips the volume itself.
  atmosphereMaterial.side = THREE.BackSide;
  atmosphereMaterial.depthTest = true;
  const atmosphere = new THREE.Mesh(ellipsoidShell(80), atmosphereMaterial);
  atmosphere.renderOrder = 2;
  earth.add(atmosphere);
  const auroraMaterial = material(auroraVertex, auroraFragment, {
    uBrightness: { value: 1 },
    uActivity: { value: 1 },
    uPhotoOverride:{value:0},uColourGains:{value:new THREE.Vector4(1,1,1,1)},
    uSpeed: { value: 1 },
    uAuroraTime:{value:0},
    uAuroraPrevious:{value:fallback},uAuroraCurrent:{value:fallback},uAuroraBlend:{value:1},uAuroraDebug:{value:0},uHemisphere:{value:0},
  });
  auroraMaterial.transparent = true;
  auroraMaterial.depthWrite = false;
  auroraMaterial.side = THREE.DoubleSide;
  auroraMaterial.blending = THREE.AdditiveBlending;
  let curtains = new THREE.Group();
  earth.add(curtains);
  const fieldMaterial=material(auroraFieldVertex,auroraFieldFragment,auroraMaterial.uniforms);
  fieldMaterial.transparent=true;fieldMaterial.depthWrite=false;fieldMaterial.side=THREE.DoubleSide;
  const fieldMesh=new THREE.Mesh(ellipsoidShell(120),fieldMaterial);fieldMesh.layers.set(2);fieldMesh.visible=false;earth.add(fieldMesh);
  let auroraPrevious:THREE.DataTexture|null=null,auroraCurrent:THREE.DataTexture|null=null,auroraTransitionAt=-100000,appliedForecast:string|null=null,appliedObservation:string|null=null;
  let appliedAuroraSource="",appliedKp:number|null=null;
  const fieldTexture=(values:Uint8Array)=>{
    const texture=new THREE.DataTexture(values,360,181,THREE.RedFormat);
    texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.wrapS=THREE.RepeatWrapping;texture.unpackAlignment=1;texture.needsUpdate=true;return texture;
  };
  const routes = new THREE.Group(),
    traffic = new THREE.Group();
  earth.add(routes, traffic);
  const aircraft = new GlobeAircraft();
  earth.add(aircraft.group);
  const aircraftDepthMaterial=material(`
    uniform mat4 uWorldToEarth;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    out vec3 vPosition;
    void main(){
      vPosition=(uWorldToEarth*modelMatrix*vec4(position,1.0)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      #include <logdepthbuf_vertex>
    }`,terrainDepthFragment,{uWorldToEarth:{value:new THREE.Matrix4()}});
  const aircraftSun=new THREE.DirectionalLight(0xfff5df,2.4);
  earth.add(aircraftSun,aircraftSun.target,new THREE.HemisphereLight(0xeaf4ff,0x273244,1.6));
  let trafficRevision=0;
  const markerMaterials = [
    new THREE.MeshBasicMaterial({ color: 0xf2c84b }),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    new THREE.MeshBasicMaterial({ color: 0x79ddff }),
  ];
  const routeMaterials = [
    new THREE.LineDashedMaterial({
      color: 0x7acaff,
      dashSize: 70,
      gapSize: 45,
    }),
    new THREE.LineBasicMaterial({ color: 0xf1c84c }),
    new THREE.LineBasicMaterial({ color: 0xed315f }),
  ];
  const trackLineMaterial=new THREE.LineBasicMaterial({vertexColors:true,toneMapped:false});
  const trackCurtainMaterial=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const pickable: THREE.Object3D[] = [];
  const addTrack = (points: FlightTrackPoint[]) => {
    for(const {line,ribbon} of flightTrackGeometry(points)){
      routes.add(new THREE.Line(line,trackLineMaterial),new THREE.Mesh(ribbon,trackCurtainMaterial));
    }
  };
  const addRoute = (
    points: Array<{ latitude: number; longitude: number }>,
    type: number,
  ) => {
    if (points.length < 2) return;
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))
        continue;
      if (i > 0) {
        const prev = points[i - 1],
          from = new THREE.Vector3(
            ...geodeticToWorld(prev.latitude, prev.longitude, 200),
          ),
          to = new THREE.Vector3(
            ...geodeticToWorld(point.latitude, point.longitude, 200),
          );
        const steps = Math.min(30, Math.ceil(from.distanceTo(to) / 80));
        for (let step = 1; step < steps; step++) {
          const unit = from
            .clone()
            .normalize()
            .lerp(to.clone().normalize(), step / steps)
            .normalize();
          vertices.push(
            unit.multiplyScalar(
              THREE.MathUtils.lerp(from.length(), to.length(), step / steps),
            ),
          );
        }
      }
      vertices.push(
        new THREE.Vector3(
          ...geodeticToWorld(point.latitude, point.longitude, 200),
        ),
      );
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(vertices),
      routeMaterials[type],
    );
    if (type === 0) line.computeLineDistances();
    routes.add(line);
  };
  const syncTraffic = () => {
    trafficRevision++;
    clearGroup(routes);
    clearGroup(traffic);
    pickable.length = 0;
    const state = read();
    const selected = state.flights.find((f) => f.id === state.selectedId);
    addRoute(selected?.plannedRoute?.points ?? [], 0);
    const history = selected?.trackSnapshots?.length
        ? selected.trackSnapshots
        : (selected?.recentSnapshots ?? []);
    addTrack(selected?.lastSnapshot && history.at(-1)?.timestamp!==selected.lastSnapshot.timestamp ? [...history,selected.lastSnapshot] : history);
    addTrack(state.replay?.points ?? []);
    const flightModels: Parameters<GlobeAircraft["sync"]>[0]=[...state.flights];
    if (state.replay) {
      const p = state.replay.points[state.replay.activeIndex];
      if (p && typeof p.altitudeFt === "number") flightModels.push({id:`replay:${state.replay.id}`,aircraft:state.replay.aircraft??"",lastSnapshot:{...p,altitudeFt:p.altitudeFt}});
    }
    aircraft.sync(flightModels,state.replay?`replay:${state.replay.id}`:state.selectedId);
    pickable.push(...aircraft.pickable);
    for (const controller of state.controllers) {
      if (controller.latitude == null || controller.longitude == null) continue;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(18, 10, 6),
        markerMaterials[2],
      );
      marker.position.set(
        ...geodeticToWorld(controller.latitude, controller.longitude, 12000),
      );
      marker.userData = { kind: "controller", id: controller.callsign };
      traffic.add(marker);
      pickable.push(marker);
    }
  };
  let lastFlights: PublicRadarFlight[] | null = null,
    lastControllers: VatsimStation[] | null = null,
    lastSelection = "",
    lastReplay: GlobeReplay = null,
    lastData: RadarCloudData | null = null,
    lastAurora: RadarAuroraData | null = null,
    lastQuality = "";
  const weatherTextures: THREE.Texture[] = [];
  let weatherRevision = 0;
  let footprintWorker: Worker | null = null, footprintPending = false, footprintError = "", footprintLobes = 0;
  let footprintSize: [number,number] = [0,0];
  let footprintField: CloudFootprint | null = null, footprintUsesCurrentHistory = false;
  const requestFootprint = (pixels: Uint8Array, width: number, height: number) => {
    footprintPending = true; footprintError = ""; footprintLobes = 0; footprintSize = [0,0];
    try {
      if (!footprintWorker) {
        footprintWorker = new Worker(new URL("./cloud-footprint.worker.ts", import.meta.url), { type: "module" });
        footprintWorker.onmessage = (event: MessageEvent<CloudFootprintResponse>) => {
          const field = event.data;
          if (disposed || field.id !== weatherRevision) return;
          footprintPending = false;
          if (field.error) { footprintError = field.error; return; }
          const texture = new THREE.DataTexture(field.pixels,field.width,field.height,THREE.RedFormat);
          texture.minFilter = texture.magFilter = THREE.LinearFilter;
          texture.wrapS = THREE.RepeatWrapping; texture.unpackAlignment = 1; texture.needsUpdate = true;
          weatherTextures.push(texture); shared.uSatelliteFootprint.value = texture; shared.uSatelliteFootprintReady.value = 1;
          const properties = new THREE.DataTexture(field.properties,field.sourceWidth,field.sourceHeight,THREE.RGBAFormat);
          properties.minFilter = properties.magFilter = THREE.LinearFilter;
          properties.wrapS = THREE.RepeatWrapping; properties.unpackAlignment = 1; properties.needsUpdate = true;
          weatherTextures.push(properties); shared.uSatelliteShapeCurrent.value = properties;
          if (footprintUsesCurrentHistory) shared.uSatelliteShapePrevious.value = properties;
          footprintField = field;
          footprintSize = [field.width,field.height]; footprintLobes = field.lobes; cloudCache.invalidate();
        };
        footprintWorker.onerror = () => { footprintPending = false; footprintError = "Cloud formation reconstruction failed"; };
      }
      const memory = (navigator as Navigator & {deviceMemory?: number}).deviceMemory;
      const preferred=effectiveQuality === "low" || (memory !== undefined && memory <= 4)?2:4;
      const scale=[4,2,1].find(s=>s<=preferred&&width*s<=renderer.capabilities.maxTextureSize&&height*s<=renderer.capabilities.maxTextureSize)??1;
      // Structured clone preserves the live categorical texture; never detach it.
      footprintWorker.postMessage({ id: weatherRevision, pixels, width, height, scale });
    } catch (error) { footprintPending = false; footprintError = String(error); }
  };
  let satelliteReceivedAt=0,satelliteValidUntil=0,satellitePixels:Uint8Array|null=null,satelliteRevision="";
  const sync = () => {
    const state = read();
    if (
      state.flights !== lastFlights ||
      state.controllers !== lastControllers ||
      state.selectedId !== lastSelection ||
      state.replay !== lastReplay
    ) {
      lastFlights = state.flights;
      lastControllers = state.controllers;
      lastSelection = state.selectedId;
      lastReplay = state.replay;
      syncTraffic();
    }
    if (
      state.cloudData !== lastData &&
      !testProfile
    ) {
      lastData = state.cloudData;
      const d=state.cloudData,s=d?.satellite;
      const revision=s?.status==="ready"?(s.revision??`${s.current.observedAt}/${s.current.sources.map(x=>x.mask).join("/")}/${s.winds?.validAt}`):"";
      if(revision!==satelliteRevision) {
      satelliteRevision=revision;
      weatherRevision++;
      shared.uSatelliteCurrent.value=shared.uSatellitePrevious.value=shared.uSatelliteMotion.value=fallback;
      shared.uSatelliteShapeCurrent.value=shared.uSatelliteShapePrevious.value=fallback;
      shared.uSatelliteFootprint.value=fallback;shared.uSatelliteFootprintReady.value=0;
      footprintPending=false;footprintError="";footprintSize=[0,0];footprintLobes=0;
      footprintField=null;footprintUsesCurrentHistory=false;
      satellitePixels=null;satelliteValidUntil=0;
      weatherTextures.splice(0).forEach((texture) => texture.dispose());
      if(d?.source==="NOAA GOES ABI"&&d.encoding==="rgba8-base64"&&s?.status==="ready") {
        const current=decodeTexture(d,s.current.volume,true),previous=s.previous?decodeTexture(d,s.previous.volume,true):current,motion=decodeTexture(d,s.motion,true);
        // History supplies R/B properties only, never the current support.
        const shapePrevious=previous===current?null:satelliteShapeTexture(d,previous,false);
        weatherTextures.push(current,motion);if(previous!==current)weatherTextures.push(previous);
        if(shapePrevious)weatherTextures.push(shapePrevious);
        shared.uSatelliteCurrent.value=current;shared.uSatellitePrevious.value=previous;shared.uSatelliteMotion.value=motion;
        shared.uSatelliteShapePrevious.value=shapePrevious??fallback;footprintUsesCurrentHistory=previous===current;
        shared.uObservationInterval.value=s.intervalSeconds;
        satellitePixels=current.image.data as Uint8Array;
        requestFootprint(satellitePixels,d.width,d.height);
        satelliteReceivedAt=performance.now();
        satelliteValidUntil=Math.min(Date.parse(s.current.observedAt),...s.current.sources.map(source=>Date.parse(source.scanEndAt)))+SATELLITE_MAX_AGE_MS;
      }
      }
    }
    const qualityChanged=lastQuality !== `${state.auroraSettings.quality}-${effectiveQuality}`;
    const kp=auroraKpOverride(state.auroraSettings),hasAurora=kp!==null||Boolean(state.aurora?.samples.length);
    const sourceKey=kp!==null?`manual-kp:${kp}`:hasAurora?`live:${state.aurora?.forecastAt}:${state.aurora?.observedAt}`:"none";
    const forecastChanged=sourceKey!==appliedAuroraSource;
    if (forecastChanged) {
      const blend=auroraMaterial.uniforms.uAuroraBlend.value as number;
      const old=appliedAuroraSource==="none"?undefined:auroraCurrent?.image.data as Uint8Array|undefined,prev=auroraPrevious?.image.data as Uint8Array|undefined;
      const target=kp!==null?auroraKpField(kp):auroraField(state.aurora?.samples??[]);
      const source=old?Uint8Array.from(old,(v,i)=>Math.round((prev?.[i]??v)*(1-blend)+v*blend)):target;
      auroraPrevious?.dispose();auroraCurrent?.dispose();
      auroraPrevious=fieldTexture(source);auroraCurrent=fieldTexture(target);
      auroraMaterial.uniforms.uAuroraPrevious.value=auroraPrevious;auroraMaterial.uniforms.uAuroraCurrent.value=auroraCurrent;
      if(curtains.children.length&&!qualityChanged&&hasAurora) updateAuroraCurtains(curtains,state.aurora,blend,target);
      auroraTransitionAt=performance.now();appliedAuroraSource=sourceKey;appliedKp=kp;
      appliedForecast=kp===null?state.aurora?.forecastAt??null:null;appliedObservation=kp===null?state.aurora?.observedAt??null:null;
      auroraMaterial.uniforms.uAuroraBlend.value=old?0:1;
    }
    if (qualityChanged || (!curtains.children.length&&hasAurora) || (!hasAurora&&curtains.children.length)) {
      lastAurora=state.aurora;
      lastQuality = `${state.auroraSettings.quality}-${effectiveQuality}`;
      clearGroup(curtains);
      earth.remove(curtains);
      curtains = hasAurora
        ? buildAuroraCurtains(
            state.aurora,
            auroraMaterial,
            effectiveQuality === "low" || state.auroraSettings.quality === "low" ? "low" : state.auroraSettings.quality === "high" && (effectiveQuality === "high" || effectiveQuality === "ultra") ? "high" : "balanced",
            auroraCurrent?.image.data as Uint8Array|undefined,
          )
        : new THREE.Group();
      earth.add(curtains);
      curtains.traverse(object => object.layers.set(2));
    }
    if(state.aurora)lastAurora=state.aurora;
    curtains.visible = state.auroraEnabled&&hasAurora&&state.auroraSettings.debug!=="field";
    fieldMesh.visible=state.auroraEnabled&&hasAurora&&state.auroraSettings.debug==="field";
    auroraMaterial.uniforms.uAuroraBlend.value=Math.min(1,(performance.now()-auroraTransitionAt)/12000);
    auroraMaterial.uniforms.uAuroraDebug.value=state.auroraSettings.debug==="altitude"?2:0;
    auroraMaterial.uniforms.uHemisphere.value=state.auroraSettings.hemisphere==="north"?1:state.auroraSettings.hemisphere==="south"?-1:0;
    const cloudsRequested = state.cloudsEnabled && state.cloudSettings.realWorld && (!!testProfile || (satellitePixels!==null&&Date.now()<satelliteValidUntil));
    if (cloudsRequested) prepareCloudPrograms();
    cloudMesh.visible = cloudsRequested && cloudPrograms === "ready" && (!!testProfile || shared.uSatelliteFootprintReady.value > .5);
    if (cloudsRequested && (cloudPrograms !== "ready" || footprintPending || footprintError)) host.dataset.globeStatus = footprintError ? "Cloud formations could not reconstruct — reload or switch to 2D" : cloudPrograms === "failed" ? "Cloud graphics could not start — reload or switch to 2D" : footprintPending ? "Reconstructing observed cloud formations…" : "Preparing cloud graphics…";
    else if (!contextLost) delete host.dataset.globeStatus;
    shared.uObservationBlend.value=Math.min(1,Math.max(0,(performance.now()-satelliteReceivedAt)/12000));
    shared.uClouds.value = cloudMesh.visible ? 1 : 0;
    shared.uCloudOpacity.value = state.cloudSettings.opacity * 1.7;
    shared.uShadows.value = state.cloudSettings.selfShadows ? 1 : 0;
    shared.uLayers.value.set(
      Number(state.cloudSettings.low),
      Number(state.cloudSettings.middle),
      Number(state.cloudSettings.high),
    );
    shared.uDayNight.value = state.dayNightEnabled ? 1 : 0;
    shared.uDebug.value = {
      lit: 0,
      density: 1,
      coverage: 2,
      height: 3,
      lighting: 4,
      mesh: 0,
    }[state.cloudSettings.debugMode];
    if (process.env.NODE_ENV !== "production")
      for (const tile of surface.tiles.values())
        (tile.mesh.material as THREE.ShaderMaterial).wireframe =
          state.cloudSettings.debugMode === "mesh";
    cloudMaterial.uniforms.uSteps.value = profile.steps;
    cloudMaterial.uniforms.uLightSamples.value = profile.lightSamples;
    cloudMaterial.uniforms.uLightStepKm.value = { low: 0.32, medium: 0.24, high: 0.16, ultra: 0.10 }[effectiveQuality];
    shared.uAirSamples.value = profile.airSamples;
    shared.uShadowSamples.value = profile.shadowSamples;
    auroraMaterial.uniforms.uBrightness.value = state.auroraSettings.brightness*(state.auroraSettings.enhancedPresentation?1.8:1);
    auroraMaterial.uniforms.uActivity.value = state.auroraSettings.activity;
    auroraMaterial.uniforms.uSpeed.value = auroraMotionSpeed(state.auroraSettings.animationSpeed);
    const photo=auroraPhotoUniforms(state.auroraSettings);
    auroraMaterial.uniforms.uPhotoOverride.value=Number(photo.enabled);
    auroraMaterial.uniforms.uColourGains.value.set(...photo.gains);
  };
  const remember = () =>
    read().onCameraChange({
      center: [longitude, latitude],
      zoom: -Math.log((targetDistance / WGS84_A_KM - 1) / 1.7) / 0.38,
      bearing,
      pitch,
    });
  let down = false,
    dragMode: GlobeDragMode = null,
    pointerId = -1,
    lastMotionAt = -10000,
    moved = 0,
    previousX = 0,
    previousY = 0;
  const pointer = new THREE.Vector2(),
    raycaster = new THREE.Raycaster();
  const keys = new Set<string>();
  const translate = (eastKm: number, northKm: number) => {
    ({ latitude, longitude } = globePanPosition(latitude, longitude, eastKm, northKm));
    lastMotionAt = performance.now();
    orbit();
  };
  const resetView = () => { bearing = 0; pitch = 0; groundPitchTarget=null; lastMotionAt = performance.now(); remember(); };
  let groundRequested = false;
  const groundView = () => { initialDescent=false;groundRequested=true; groundPitchTarget=88;maxDescentFrameFraction=0;cameraTrace.length=0; lastMotionAt=performance.now(); };
  const aircraftView = () => {
    const state=read(),p=state.replay?.points[state.replay.activeIndex]??state.flights.find(f=>f.id===state.selectedId)?.lastSnapshot;
    const metres=p?flightAltitudeMetres(p):null;
    if(!p||metres===null)return;
    const heading=Number.isFinite(p.headingDeg)?p.headingDeg:0;
    ({latitude,longitude}=globePanPosition(p.latitude,p.longitude,-.2*Math.sin(heading*Math.PI/180),-.2*Math.cos(heading*Math.PI/180)));
    targetDistance=distance=WGS84_A_KM+metres/1000+.25;
    verticalVelocity=0;initialDescent=false;groundRequested=false;groundPitchTarget=null;
    pitch=Math.atan2(.2,.25)*180/Math.PI;bearing=heading;camera.fov=45;
    lastMotionAt=performance.now();orbit();remember();
  };
  const onDown = (event: PointerEvent) => {
    if (down) return;
    dragMode = globeDragMode(event.button, event.shiftKey);
    if (!dragMode) return;
    groundPitchTarget=null;
    event.preventDefault(); // particularly suppress middle-button autoscroll
    canvas.focus({ preventScroll: true });
    down = true;
    pointerId = event.pointerId;
    canvas.style.cursor = dragMode === "look" ? "crosshair" : "grabbing";
    moved = 0;
    previousX = event.clientX;
    previousY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent) => {
    if (!down || event.pointerId !== pointerId) return;
    const dx = event.clientX - previousX,
      dy = event.clientY - previousY;
    moved += Math.abs(dx) + Math.abs(dy);
    const sensitivity =
      0.16 * Math.min(1, (distance - WGS84_A_KM) / 3500);
    if (dragMode === "look") ({ bearing, pitch } = globeLookDrag(bearing, pitch, dx, dy));
    else if (dragMode === "pan") {
      const delta = globePanDrag(dx, dy, distance - WGS84_A_KM, camera.fov, host.clientHeight, bearing, pitch);
      translate(delta.eastKm, delta.northKm);
    } else {
      longitude = wrapLongitude(longitude - dx * sensitivity);
      latitude = THREE.MathUtils.clamp(latitude + dy * sensitivity, -90, 90);
    }
    previousX = event.clientX;
    previousY = event.clientY;
    lastMotionAt = performance.now();
    if (dragMode === "orbit") orbit();
  };
  const onUp = (event: PointerEvent) => {
    if (!down || event.pointerId !== pointerId) return;
    const maySelect = dragMode === "orbit" && event.button === 0 && event.type !== "pointercancel";
    down = false;
    dragMode = null;
    pointerId = -1;
    canvas.style.cursor = "grab";
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    remember();
    if (!maySelect || moved > 5) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickable)[0];
    if (!hit) return;
    const ground = raycaster.ray
      .clone()
      .applyMatrix4(earth.matrixWorld.clone().invert())
      .intersectSphere(
        new THREE.Sphere(new THREE.Vector3(), WGS84_B_KM),
        new THREE.Vector3(),
      );
    if (
      ground &&
      camera.position.distanceTo(ground.applyMatrix4(earth.matrixWorld)) <
        hit.distance - 60
    )
      return;
    let target: THREE.Object3D | null=hit.object;
    while(target&&!target.userData.kind)target=target.parent;
    if (target?.userData.kind === "flight") {
      if(!target.userData.id.startsWith("replay:"))read().onSelect(target.userData.id);
    } else if(target?.userData.kind==="controller")read().onSelectController(target.userData.id);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    groundRequested=false;
    initialDescent=false;
    groundPitchTarget=null;
    // A reverse gesture takes effect now, not after an old dolly completes.
    targetDistance=event.deltaY>0?Math.max(distance,targetDistance):Math.min(distance,targetDistance);
    targetDistance = globeZoomTarget(
      targetDistance,
      event.deltaY,
      event.deltaMode,
      host.clientHeight,
      surface.heightAt(latitude,longitude).heightKm,
    );
    remember();
    lastMotionAt = performance.now();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "q", "e", "shift"].includes(key)) {
      keys.add(key); event.preventDefault(); return;
    }
    if (event.key === "Home") { event.preventDefault(); resetView(); return; }
    if (event.shiftKey && event.key.startsWith("Arrow")) {
      groundPitchTarget=null;
      ({ bearing, pitch } = globeLookDrag(bearing, pitch, event.key === "ArrowLeft" ? -25 : event.key === "ArrowRight" ? 25 : 0, event.key === "ArrowUp" ? -25 : event.key === "ArrowDown" ? 25 : 0));
      lastMotionAt = performance.now(); event.preventDefault(); remember(); return;
    }
    if (event.key === "ArrowLeft") longitude -= 5;
    else if (event.key === "ArrowRight") longitude += 5;
    else if (event.key === "ArrowUp") latitude = Math.min(90, latitude + 5);
    else if (event.key === "ArrowDown") latitude = Math.max(-90, latitude - 5);
    else return;
    event.preventDefault();
    lastMotionAt = performance.now();
    orbit();
    remember();
  };
  const onKeyUp = (event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()); remember(); };
  const stopInput = () => {
    keys.clear(); down = false; dragMode = null;
    canvas.style.cursor = "grab";
    if (pointerId >= 0 && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = -1;
  };
  const onAux = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
  const onContext = (event: Event) => event.preventDefault();
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("blur", stopInput);
  canvas.addEventListener("auxclick", onAux);
  canvas.addEventListener("contextmenu", onContext);
  canvas.addEventListener("globe-reset-view", resetView);
  canvas.addEventListener("globe-ground-view", groundView);
  canvas.addEventListener("globe-aircraft-view", aircraftView);
  window.addEventListener("blur", stopInput);
  const resize = () => {
    camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
    camera.updateProjectionMatrix();
    const size = globeRenderSize(host.clientWidth, host.clientHeight, window.devicePixelRatio, effectiveQuality);
    renderer.setPixelRatio(size.ratio);
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    cloudTarget.setSize(size.cloudWidth, size.cloudHeight);
    terrainDepthTarget.setSize(size.cloudWidth,size.cloudHeight);
    shared.uTerrainDepthSize.value.set(size.cloudWidth,size.cloudHeight);
    shadowTarget.setSize(Math.max(1, Math.floor(size.cloudWidth / 2)), Math.max(1, Math.floor(size.cloudHeight / 2)));
    cloudCache.invalidate();
    shared.uGroundSize.value.set(size.groundWidth, size.groundHeight);
    shared.uPixelAngle.value =
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) /
      Math.max(1, size.cloudHeight);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  const started = performance.now();
  adaptive.reset(started);
  const localFrustum = new THREE.Frustum(), frustumMatrix = new THREE.Matrix4();
  let visible = true, contextLost = false, lastDraw = 0, nextDrawAt = 0, lastDiagnostics = 0;
  let measuredFrames = 0, measuredSince = started, measuredFps = 0, renderCpuMs = 0;
  let lastVolumeGpuMs: number | null = null, fullVolumeGpuMs: number | null = null, movingVolumeGpuMs: number | null = null;
  let volumePasses = 0, passesPerSecond = 0;
  const frameCosts: number[] = [];
  const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; });
  observer.observe(host);
  const onVisibility = () => { stopInput(); previousFrame = performance.now(); lastDraw = 0; nextDrawAt = 0; cloudCache.invalidate(); adaptive.reset(performance.now()); measuredFrames = 0; measuredSince = performance.now(); };
  const onLost = (event: Event) => { event.preventDefault(); contextLost = true; cloudPrograms = "idle"; cloudCompileRevision++; gpuTimer.dispose(); host.dataset.globeStatus = "Graphics context lost — waiting for recovery"; };
  const onRestored = () => { contextLost = false; delete host.dataset.globeStatus; onVisibility(); resize(); };
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  let frame = 0,
    disposed = false,
    lastSunUpdate = 0,
    lastLodUpdate = 0,
    previousFrame = started;
  const render = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(render);
    if (document.hidden || !visible || contextLost || !host.clientWidth || !host.clientHeight) { previousFrame = now; lastDraw = 0; nextDrawAt = 0; return; }
    // Limit battery/GPU use even on a fast display. Animated effects continue
    // at real elapsed time; there is no 144/240 Hz busy-render loop.
    const interval = 1000 / profile.fps;
    const deadline = nextGlobeFrame(now, nextDrawAt, profile.fps);
    if (deadline === null) return;
    nextDrawAt = deadline;
    const elapsed = lastDraw ? now - lastDraw : interval;
    lastDraw = now;
    const cpuStart = performance.now();
    const gpuResult = gpuTimer.poll(), gpuMs = gpuResult?.ms ?? null;
    if (gpuResult?.tag.startsWith("volume")) {
      lastVolumeGpuMs = gpuResult.ms;
      if (gpuResult.tag === "volume-moving") movingVolumeGpuMs = gpuResult.ms;
      else fullVolumeGpuMs = gpuResult.ms;
    }
    const requested = read().cloudSettings.quality;
    if (lastRequestedQuality !== requested) { adaptive.reset(now); lastRequestedQuality = requested; }
    // Cheap cache hits are not evidence that a weak GPU can march a denser
    // volume. Auto learns from complete refresh frames, not just reused ones.
    const nextQuality = requested === "auto" ? adaptive.sample(Math.max(lastVolumeGpuMs ?? gpuMs ?? 0, renderCpuMs, elapsed - interval), now, now - started > 4000) : requested;
    if (nextQuality !== effectiveQuality) {
      effectiveQuality = nextQuality;
      profile = GLOBE_PROFILES[effectiveQuality];
      surface.setQuality(effectiveQuality);
      resize(); lastLodUpdate = 0;
      frameCosts.length = 0;
      lastVolumeGpuMs = fullVolumeGpuMs = movingVolumeGpuMs = null;
    }
    const deltaSeconds = Math.min(0.1, Math.max(0, (now - previousFrame) / 1000));
    previousFrame = now;
    const testingMotion = process.env.NODE_ENV !== "production" && Boolean(read().testCameraMotion);
    const ground = surface.heightAt(latitude,longitude);
    const clearance = distance-WGS84_A_KM-ground.heightKm;
    const speed = Math.max(0.003, clearance * 0.35) * deltaSeconds * (keys.has("shift") ? 4 : 1);
    const sideways = Number(keys.has("d")) - Number(keys.has("a"));
    const forward = Number(keys.has("w")) - Number(keys.has("s"));
    if (sideways || forward || testingMotion) {
      const yaw = THREE.MathUtils.degToRad(bearing);
      const normalizer = Math.max(1, Math.hypot(sideways, forward));
      translate((sideways * Math.cos(yaw) + forward * Math.sin(yaw)) * speed / normalizer + (testingMotion ? deltaSeconds * Math.max(0.8,(distance-WGS84_A_KM)*0.012) : 0), (-sideways * Math.sin(yaw) + forward * Math.cos(yaw)) * speed / normalizer);
    }
    if (keys.has("q") || keys.has("e")) {
      groundRequested=false;
      initialDescent=false;
      groundPitchTarget=null;
      targetDistance=keys.has("e")?Math.max(targetDistance,distance):Math.min(targetDistance,distance);
      targetDistance=Math.max(targetDistance,WGS84_A_KM+ground.heightKm+TERRAIN_CLEARANCE_KM);
      targetDistance = THREE.MathUtils.clamp(targetDistance + (Number(keys.has("e")) - Number(keys.has("q"))) * speed, WGS84_A_KM + TERRAIN_CLEARANCE_KM, WGS84_A_KM + 40000);
      lastMotionAt = now;
    }
    if(groundRequested) targetDistance=WGS84_A_KM+ground.heightKm+TERRAIN_CLEARANCE_KM;
    const floor=globeDescentFloor(distance-WGS84_A_KM,ground.heightKm,ground.ready);
    // Discard blocked wheel/key debt. Only an explicit ground-view request
    // remains automatic when its DEM becomes available.
    if(!ground.ready&&!groundRequested&&!initialDescent) targetDistance=Math.max(targetDistance,WGS84_A_KM+floor);
    if(ground.ready)initialDescent=false;
    const priorHeight=distance-WGS84_A_KM;
    const vertical=globeAltitudeStep(distance-WGS84_A_KM,targetDistance-WGS84_A_KM,verticalVelocity,ground.heightKm,ground.ready,deltaSeconds);
    distance=WGS84_A_KM+vertical.heightKm; verticalVelocity=vertical.velocityKmS;
    maxDescentFrameFraction=Math.max(maxDescentFrameFraction,(priorHeight-vertical.heightKm)/Math.max(.005,priorHeight-ground.heightKm));
    if(process.env.NODE_ENV!=="production"&&now-lastCameraTrace>=100){
      lastCameraTrace=now;cameraTrace.push([Math.round(now-started),Math.round(vertical.heightKm*1e6)/1000,Math.round(verticalVelocity*1e6)/1000,ground.ready?1:0,Math.round(ground.heightKm*1e6)/1000]);
      if(cameraTrace.length>320)cameraTrace.shift();
    }
    if(groundPitchTarget!==null){pitch+=(groundPitchTarget-pitch)*(1-Math.exp(-deltaSeconds*3));if(Math.abs(pitch-groundPitchTarget)<.01)groundPitchTarget=null;}
    const height = distance - WGS84_A_KM,
      tilt = THREE.MathUtils.degToRad(pitch), yaw = THREE.MathUtils.degToRad(bearing);
    // Height means actual altitude above the selected WGS84 surface, even at
    // the poles. Tilting changes the view direction, never the camera altitude.
    // Rebase the world around the eye. Tile vertices are local offsets, so
    // GPU subtraction no longer loses metre-scale detail near Earth's radius.
    camera.position.set(0, 0, 0);
    earth.position.set(...geodeticToWorld(latitude,longitude,height*1000)).applyQuaternion(earth.quaternion).negate();
    camera.up.set(Math.sin(yaw) * Math.cos(tilt), Math.cos(yaw) * Math.cos(tilt), Math.sin(tilt));
    camera.lookAt(Math.sin(yaw) * Math.sin(tilt) * 1000, Math.cos(yaw) * Math.sin(tilt) * 1000, camera.position.z - Math.cos(tilt) * 1000);
    sync();
    auroraMaterial.uniforms.uAuroraTime.value=advanceAuroraTime(auroraMaterial.uniforms.uAuroraTime.value,deltaSeconds,read().auroraSettings.animationSpeed);
    shared.uTime.value = (now - started) / 1000;
    if (now - lastSunUpdate > 1000) {
      shared.uSun.value.set(
        ...solarDirection(new Date(read().testDate ?? Date.now())),
      );
      lastSunUpdate = now;
    }
    earth.updateMatrixWorld(true);
    // Keep the depth buffer useful at every altitude. A fixed 0.5 km near
    // plane loses tens of kilometres of depth precision from orbit.
    const clipping = globeClipRange(WGS84_A_KM + Math.max(TERRAIN_CLEARANCE_KM,height-ground.heightKm), read().auroraEnabled && height > 70 && height < 600);
    // The eye can be inside a luminous curtain. An orbit-style 25%-altitude
    // near plane visibly slices it into straight panes. Log depth preserves
    // terrain precision with a close near plane while traversing the aurora.
    shared.uCamera.value.copy(camera.position);
    earth.worldToLocal(shared.uCamera.value);
    camera.near = Math.min(clipping.near,Math.max(.0002,aircraft.closestDistance(shared.uCamera.value)*.2));
    camera.far = clipping.far;
    camera.updateProjectionMatrix();
    shared.uCamera.value.copy(camera.position);
    earth.worldToLocal(shared.uCamera.value);
    if (now - lastLodUpdate > 200) {
      camera.updateMatrixWorld(true);
      frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(earth.matrixWorld);
      localFrustum.setFromProjectionMatrix(frustumMatrix);
      // Fetch the collision tile while still approaching, not only once the
      // eye has already reached the old 9.1 km safety barrier.
      surface.update(shared.uCamera.value, host.clientHeight * renderer.getPixelRatio(), camera.fov, localFrustum, shared.uSun.value, read().dayNightEnabled, groundRequested||targetDistance-WGS84_A_KM<30||(!ground.ready&&height<80));
      lastLodUpdate = now;
    }
    aircraft.update(shared.uCamera.value,camera.fov,host.clientHeight,now,localFrustum);
    aircraftSun.position.copy(shared.uSun.value).multiplyScalar(10000);
    aircraftSun.intensity=read().dayNightEnabled?Math.max(.08,2.4*Math.max(0,shared.uSun.value.dot(shared.uCamera.value.clone().normalize()))):2.4;
    const moving = (down && moved > 2) || keys.size > 0 || testingMotion || now - lastMotionAt < 180 || Math.abs(distance - targetDistance) > 0.01;
    const cloudSize = movingCloudSize(cloudTarget.width, cloudTarget.height, moving, effectiveQuality === "low");
    const shadowWidth = Math.max(1, Math.floor(cloudSize.width / 2)), shadowHeight = Math.max(1, Math.floor(cloudSize.height / 2));
    cloudTarget.viewport.set(0, 0, cloudSize.width, cloudSize.height);
    cloudTarget.scissor.copy(cloudTarget.viewport); cloudTarget.scissorTest = true;
    terrainDepthTarget.viewport.copy(cloudTarget.viewport);terrainDepthTarget.scissor.copy(cloudTarget.scissor);terrainDepthTarget.scissorTest=true;
    shared.uTerrainDepthViewport.value.set(cloudSize.width,cloudSize.height);shared.uShadowDrawSize.value.set(shadowWidth,shadowHeight);
    shadowTarget.viewport.set(0, 0, shadowWidth, shadowHeight);
    shadowTarget.scissor.copy(shadowTarget.viewport); shadowTarget.scissorTest = true;
    compositeMaterial.uniforms.uCloudRegion.value.set(cloudSize.width / cloudTarget.width, cloudSize.height / cloudTarget.height, 1 / cloudTarget.width, 1 / cloudTarget.height);
    shared.uShadowRegion.value.set(shadowWidth / shadowTarget.width, shadowHeight / shadowTarget.height, 1 / shadowTarget.width, 1 / shadowTarget.height);
    shared.uPixelAngle.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / cloudSize.height;
    const settings = read().cloudSettings;
    const signature = [trafficRevision,aircraft.stats.loaded,aircraft.stats.detailed,distance.toFixed(7), latitude.toFixed(8), longitude.toFixed(8), bearing.toFixed(4), pitch.toFixed(4), camera.fov, cloudSize.width, cloudSize.height, weatherRevision, Math.floor(shared.uObservationBlend.value*12),surface.revision, cloudMesh.visible, settings.opacity, settings.low, settings.middle, settings.high, settings.selfShadows, settings.debugMode, shared.uDayNight.value, effectiveQuality, ...shared.uSun.value.toArray()].join("/");
    const cacheEnabled = process.env.NODE_ENV === "production" || read().testCloudCache !== false;
    const refreshClouds = cloudCache.shouldRefresh(signature, now, cacheEnabled);
    renderer.info.reset();
    gpuTimer.begin(refreshClouds && cloudMesh.visible ? (moving ? "volume-moving" : "volume-full") : "reuse");
    if (refreshClouds) {
      if(cloudMesh.visible) {
        renderer.setRenderTarget(terrainDepthTarget);renderer.setClearColor(0xffffff,1);renderer.clear();
        camera.layers.set(4);scene.overrideMaterial=terrainDepthMaterial;renderer.render(scene,camera);scene.overrideMaterial=null;
        if(aircraft.stats.detailed>0){
          // Stop the cloud ray at the aircraft too: clouds in front occlude it;
          // clouds behind/under it cannot be pasted over an above-cloud aircraft.
          aircraftDepthMaterial.uniforms.uWorldToEarth.value.copy(earth.matrixWorld).invert();
          renderer.autoClear=false;camera.layers.set(5);scene.overrideMaterial=aircraftDepthMaterial;
          renderer.render(scene,camera);scene.overrideMaterial=null;renderer.autoClear=true;
        }
      }
      renderer.setRenderTarget(shadowTarget);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      if (cloudMesh.visible && shared.uShadows.value) { camera.layers.set(3); renderer.render(scene, camera); }
      if (cloudMesh.visible) {
        renderer.setRenderTarget(cloudTarget);
        renderer.setClearColor(0x000000, 0);
        camera.layers.set(1);
        renderer.render(scene, camera);
        volumePasses++;
      }
      cloudCache.commit(signature, now);
    }
    for (const tile of surface.tiles.values()) (tile.mesh.material as THREE.ShaderMaterial).uniforms.uGroundShadow.value = shadowTarget.texture;
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x01040a, 1);
    camera.layers.set(0);
    renderer.render(scene, camera);
    const auroraBeforeClouds=height<18;
    if(auroraBeforeClouds) { renderer.autoClear=false; camera.layers.set(2); renderer.render(scene,camera); camera.layers.set(0); renderer.autoClear=true; }
    if (cloudMesh.visible) {
      renderer.autoClear = false;
      renderer.render(compositeScene, compositeCamera);
      renderer.autoClear = true;
    }
    renderer.autoClear = false;
    camera.layers.set(2);
    if(!auroraBeforeClouds) renderer.render(scene, camera);
    camera.layers.set(0);
    renderer.autoClear = true;
    renderer.setClearColor(0x01040a, 1);
    gpuTimer.end();
    renderCpuMs = performance.now() - cpuStart;
    measuredFrames++;
    if (gpuMs !== null) { frameCosts.push(gpuMs); if (frameCosts.length > 120) frameCosts.shift(); }
    if (now - measuredSince >= 1000) { measuredFps = measuredFrames * 1000 / (now - measuredSince); passesPerSecond = volumePasses * 1000 / (now - measuredSince); measuredSince = now; measuredFrames = 0; volumePasses = 0; }
    if (now - lastDiagnostics > 1000) {
      lastDiagnostics = now;
      if(process.env.NODE_ENV!=="production")host.dataset.globeCameraTrace=JSON.stringify(cameraTrace);
      const costs = [...frameCosts].sort((a, b) => a - b);
      host.dataset.globeDiagnostics = JSON.stringify({
        quality: effectiveQuality,
        mode: requested,
        fps: Math.round(measuredFps),
        frameCap: profile.fps,
        gpuMs: gpuTimer.latestMs === null ? null : Math.round(gpuTimer.latestMs * 10) / 10,
        gpuP95: costs.length ? Math.round(costs[Math.floor(costs.length * 0.95)] * 10) / 10 : null,
        cpuMs: Math.round(renderCpuMs * 10) / 10,
        ground: shared.uGroundSize.value.toArray(),
        cloud: [cloudTarget.width, cloudTarget.height],
        cloudViewport: [cloudSize.width, cloudSize.height],
        cloudRefreshesPerSecond: Math.round(passesPerSecond * 10) / 10,
        cloudCacheHits: cloudCache.hits,
        refreshFrameGpuMs: fullVolumeGpuMs === null ? null : Math.round(fullVolumeGpuMs * 10) / 10,
        movingFrameGpuMs: movingVolumeGpuMs === null ? null : Math.round(movingVolumeGpuMs * 10) / 10,
        moving,
        terrain: surface.stats,
        tiles: surface.tiles.size,
        drawCalls: renderer.info.render.calls,
        textures: renderer.info.memory.textures,
        triangles: renderer.info.render.triangles,
        traffic: aircraft.stats,
        clouds: cloudMesh.visible,
        cloudPrograms,
        cloudRenderer: ACCEPTED_CLOUD_REVISION,
        cloudSupport: "smooth-cloud-masses-v5.1-10km",
        cloudFootprint: { pending: footprintPending, error: footprintError, size: footprintSize, lobes: footprintLobes, boundaryBandKm: CLOUD_BOUNDARY_BAND_KM },
        cloudSource: testProfile?"synthetic-calibration":satellitePixels&&Date.now()<satelliteValidUntil?"satellite-observed":"unknown",
        cloudBelowCamera: testProfile?"synthetic":satellitePixels&&Date.now()<satelliteValidUntil&&read().cloudData?(()=>{const data=read().cloudData!,u=(longitude+180)/360,v=(90-latitude)/180;const flag=satellitePixels![satelliteGridIndex(latitude,longitude,data.width,data.height)*4+3]??0;const usable=((flag&7)===3||(flag&7)===4)&&!(flag&24);if(!usable&&footprintField&&sampleCloudFootprint(footprintField,u,v)>128&&observedCloudDistance(satellitePixels!,data.width,data.height,u,v)<CLOUD_BOUNDARY_BAND_KM)return "estimated boundary fringe (≤10 km); not directly observed";return (flag&7)>=3&&(flag&24)?"cloud detected; volume unknown (missing optical depth/top)":(["unknown","clear","uncertain","probably cloudy","observed cloudy"][flag&7]??"unknown");})():"unknown",
        aurora: curtains.visible,
        auroraForecast:appliedForecast,
        auroraObserved:appliedObservation,
        auroraStale:appliedKp===null&&Boolean(lastAurora?.stale),
        auroraSource:appliedAuroraSource,
        auroraKpOverride:appliedKp,
        auroraTransition:Math.round(auroraMaterial.uniforms.uAuroraBlend.value*100)/100,
        auroraMeshes:curtains.children.length,
        auroraArcs:curtains.children.reduce((n,mesh)=>n+(mesh.userData.arcs?.length??0),0),
        auroraSpeed:auroraMaterial.uniforms.uSpeed.value,
        auroraTime:Math.round(auroraMaterial.uniforms.uAuroraTime.value*1000)/1000,
        auroraPhotoOverride:Boolean(auroraMaterial.uniforms.uPhotoOverride.value),
        auroraColourGains:auroraMaterial.uniforms.uColourGains.value.toArray(),
        sun: shared.uSun.value.toArray(),
        cameraKm: Math.round(surfaceRadius+height),
        altitudeKm: Math.round(height * 1000) / 1000,
        groundMetres: Math.round(ground.heightKm*1000),
        aboveGroundMetres: Math.round((height-ground.heightKm)*1000),
        terrainReady: ground.ready,
        groundRequested,
        verticalKmS:Math.round(verticalVelocity*10000)/10000,
        maxDescentFrameFraction:Math.round(maxDescentFrameFraction*10000)/10000,
        descentFloorKm:Math.round(floor*1000)/1000,
        waitingForTerrain:!ground.ready&&(groundRequested||targetDistance-WGS84_A_KM<=floor+.01),
        pitch: Math.round(pitch),
        bearing: Math.round(bearing * 10) / 10,
        focus: [Number(longitude.toFixed(5)), Number(latitude.toFixed(5))],
        clippingKm: [camera.near, Math.round(camera.far)],
      });
    }
  };
  surface.setQuality(effectiveQuality);
  frame = requestAnimationFrame(render);
  return () => {
    disposed = true;
    cloudCompileRevision++;
    footprintWorker?.terminate();
    remember();
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("keydown", onKey);
    canvas.removeEventListener("keyup", onKeyUp);
    canvas.removeEventListener("blur", stopInput);
    canvas.removeEventListener("auxclick", onAux);
    canvas.removeEventListener("contextmenu", onContext);
    canvas.removeEventListener("globe-reset-view", resetView);
    canvas.removeEventListener("globe-ground-view", groundView);
    canvas.removeEventListener("globe-aircraft-view", aircraftView);
    window.removeEventListener("blur", stopInput);
    surface.dispose();
    clearGroup(curtains);
    clearGroup(routes);
    clearGroup(traffic);
    aircraft.dispose();
    aircraftDepthMaterial.dispose();
    markerMaterials.forEach((m) => m.dispose());
    routeMaterials.forEach((m) => m.dispose());
    trackLineMaterial.dispose();trackCurtainMaterial.dispose();
    cloudMaterial.dispose();
    cloudMesh.geometry.dispose();
    shadowMesh.geometry.dispose(); shadowMaterial.dispose();
    cloudTarget.dispose(); shadowTarget.dispose();
    terrainDepthTarget.dispose();terrainDepthMaterial.dispose();
    compositeQuad.geometry.dispose(); compositeMaterial.dispose(); gpuTimer.dispose();
    atmosphere.geometry.dispose();
    atmosphereMaterial.dispose();
    auroraMaterial.dispose();
    auroraPrevious?.dispose();auroraCurrent?.dispose();fieldMaterial.dispose();fieldMesh.geometry.dispose();
    base.dispose();
    detail.dispose();
    fallback.dispose();
    testCloudTexture?.dispose();
    weatherTextures.forEach((t) => t.dispose());
    renderer.dispose();
    canvas.remove();
  };
}
