"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type VoiceRoom = { id: string; name: string; status: "scheduled" | "open" | "closed"; maxParticipants: number };
export type VoicePilot = { id: string; name: string; pilotNumber: string; profileImage: string | null };
export type VoiceParticipant = { sessionId: string; pilotId: string; pilotNumber: string; name: string; profileImage: string | null; seatIndex: number | null };
export type VoiceDevice = { id: string; label: string };
type Signal = { id: string; from: VoiceParticipant; kind: "offer" | "answer" | "candidate"; payload: Record<string, unknown> };
type JoinReply = { session: VoiceParticipant; token: string; participants: VoiceParticipant[]; maxParticipants: number; iceServers: RTCIceServer[] };
type PollReply = { participants: VoiceParticipant[]; signals: Signal[] };
type Connection = { peer: VoiceParticipant; connection: RTCPeerConnection; pendingCandidates: RTCIceCandidateInit[] };
type Session = { id: string; token: string };
export type VoicePhase = "idle" | "joining" | "connected" | "error";

type CrewVoiceContextValue = {
  activeRoom: VoiceRoom | null;
  activePilot: VoicePilot | null;
  phase: VoicePhase;
  notice: string;
  muted: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  participants: VoiceParticipant[];
  waitingRoomCount: number;
  remoteStreams: Record<string, MediaStream>;
  previewStream: MediaStream | null;
  inputDevices: VoiceDevice[];
  outputDevices: VoiceDevice[];
  cameraDevices: VoiceDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  selectedCameraId: string;
  outputSelectionSupported: boolean;
  join: (room: VoiceRoom, pilot: VoicePilot, seatIndex?: number) => Promise<void>;
  leave: () => Promise<void>;
  reconnect: () => Promise<void>;
  toggleMuted: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  selectInput: (deviceId: string) => Promise<void>;
  selectOutput: (deviceId: string) => void;
  selectCamera: (deviceId: string) => void;
  previewRoom: (room: VoiceRoom) => Promise<void>;
};

const CrewVoiceContext = createContext<CrewVoiceContextValue | null>(null);

function stop(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function deviceError(error: unknown, device: "microphone" | "camera" | "screen") {
  const name = error && typeof error === "object" && "name" in error && typeof error.name === "string" ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return `Your browser or operating system blocked ${device} access. Open this site's permissions, choose Allow, then try again.`;
  }
  if (name === "NotFoundError") return `No ${device} was found. Connect one, then refresh your device list.`;
  if (name === "NotReadableError") return `That ${device} is busy in another app or browser tab. Close it there, then try again.`;
  if (name === "OverconstrainedError") return `The selected ${device} is no longer available. Choose another one in call settings.`;
  if (name === "AbortError") return `${device[0]?.toUpperCase()}${device.slice(1)} setup was interrupted. Please try again.`;
  return `Your ${device} could not be started. Check its permission and connection, then try again.`;
}

function audioConstraints(deviceId: string): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

function RemoteAudio({ stream, outputDeviceId, onPlaybackBlocked }: { stream: MediaStream; outputDeviceId: string; onPlaybackBlocked: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.srcObject = stream;
    const output = audio as HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };
    const start = async () => {
      try {
        if (outputDeviceId && output.setSinkId) await output.setSinkId(outputDeviceId);
        await audio.play();
      } catch {
        onPlaybackBlocked();
      }
    };
    void start();
  }, [onPlaybackBlocked, outputDeviceId, stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

export function CrewVoiceProvider({ children }: { children: ReactNode }) {
  const [activeRoom, setActiveRoom] = useState<VoiceRoom | null>(null);
  const [activePilot, setActivePilot] = useState<VoicePilot | null>(null);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [notice, setNotice] = useState("");
  const [muted, setMuted] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [waitingRoomCount, setWaitingRoomCount] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [inputDevices, setInputDevices] = useState<VoiceDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<VoiceDevice[]>([]);
  const [cameraDevices, setCameraDevices] = useState<VoiceDevice[]>([]);
  const [selectedInputId, setSelectedInputId] = useState("");
  const [selectedOutputId, setSelectedOutputId] = useState("");
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [outputSelectionSupported, setOutputSelectionSupported] = useState(false);

  const mounted = useRef(true);
  const activeRoomRef = useRef<VoiceRoom | null>(null);
  const activePilotRef = useRef<VoicePilot | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef<Map<string, Connection>>(new Map());
  const pollingRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);

  const request = useCallback(async (body: Record<string, unknown>) => {
    const room = activeRoomRef.current;
    if (!room) throw new Error("Choose an open crew room before joining voice.");
    const response = await fetch(`/api/crew-lounge/rooms/${room.id}`, {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null) as { error?: string } | Record<string, unknown> | null;
    if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "The voice room could not complete that request.");
    return data as Record<string, unknown>;
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!mounted.current) return;
      const toList = (kind: MediaDeviceKind, fallback: string) => devices
        .filter((device) => device.kind === kind)
        .map((device, index) => ({ id: device.deviceId, label: device.label || `${fallback} ${index + 1}` }));
      setInputDevices(toList("audioinput", "Microphone"));
      setOutputDevices(toList("audiooutput", "Speaker"));
      setCameraDevices(toList("videoinput", "Camera"));
      setOutputSelectionSupported(typeof (HTMLMediaElement.prototype as HTMLMediaElement & { setSinkId?: unknown }).setSinkId === "function");
    } catch {
      // Device discovery is optional; joining with the browser default remains available.
    }
  }, []);

  const selectOutput = useCallback((deviceId: string) => {
    setSelectedOutputId(deviceId);
    if (deviceId && !outputSelectionSupported) {
      setNotice("This browser uses its system-selected speaker for calls. Choose a different output in your device or browser settings.");
    } else if (deviceId) {
      setNotice("Speaker output updated for incoming call audio.");
    }
  }, [outputSelectionSupported]);

  const selectCamera = useCallback((deviceId: string) => {
    setSelectedCameraId(deviceId);
    if (cameraOn) setNotice("Camera selection saved. Turn your camera off, then on again to use it.");
  }, [cameraOn]);

  const previewRoom = useCallback(async (room: VoiceRoom) => {
    try {
      const response = await fetch(`/api/crew-lounge/rooms/${room.id}`, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ action: "preview" }),
      });
      const data = await response.json().catch(() => null) as { participantCount?: unknown } | null;
      if (response.ok && typeof data?.participantCount === "number" && mounted.current) setWaitingRoomCount(data.participantCount);
    } catch {
      // The count is only a friendly preview. Joining remains available.
    }
  }, []);

  const sendSignal = useCallback(async (targetSessionId: string, kind: Signal["kind"], payload: Record<string, unknown>) => {
    const session = sessionRef.current;
    if (!session) return;
    await request({ action: "signal", sessionId: session.id, token: session.token, targetSessionId, kind, payload });
  }, [request]);

  const refreshRemoteStream = useCallback((sessionId: string, stream: MediaStream) => {
    if (mounted.current) setRemoteStreams((current) => ({ ...current, [sessionId]: stream }));
  }, []);

  const sendOffer = useCallback(async (entry: Connection) => {
    if (entry.connection.signalingState !== "stable") return;
    const offer = await entry.connection.createOffer();
    await entry.connection.setLocalDescription(offer);
    if (entry.connection.localDescription) await sendSignal(entry.peer.sessionId, "offer", { description: { type: entry.connection.localDescription.type, sdp: entry.connection.localDescription.sdp } });
  }, [sendSignal]);

  const ensureConnection = useCallback((peer: VoiceParticipant) => {
    const existing = connectionsRef.current.get(peer.sessionId);
    if (existing) return existing;
    const connection = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const entry: Connection = { peer, connection, pendingCandidates: [] };
    const microphone = microphoneStreamRef.current;
    if (microphone) microphone.getTracks().forEach((track) => connection.addTrack(track, microphone));
    const activeVideo = screenStreamRef.current ?? cameraStreamRef.current;
    if (activeVideo) activeVideo.getVideoTracks().forEach((track) => connection.addTrack(track, activeVideo));
    connection.onicecandidate = (event) => { if (event.candidate) void sendSignal(peer.sessionId, "candidate", { candidate: event.candidate.toJSON() }).catch(() => undefined); };
    connection.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      event.track.addEventListener("mute", () => refreshRemoteStream(peer.sessionId, stream));
      event.track.addEventListener("unmute", () => refreshRemoteStream(peer.sessionId, stream));
      event.track.addEventListener("ended", () => refreshRemoteStream(peer.sessionId, stream));
      refreshRemoteStream(peer.sessionId, stream);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        connectionsRef.current.delete(peer.sessionId);
        if (mounted.current) setRemoteStreams((current) => { const next = { ...current }; delete next[peer.sessionId]; return next; });
        if (connection.connectionState === "failed" && mounted.current) {
          setNotice("Your call route could not be completed on this network. Reconnect voice will rebuild the room session and ask the relay for a fresh route.");
        }
      }
    };
    connectionsRef.current.set(peer.sessionId, entry);
    return entry;
  }, [refreshRemoteStream, sendSignal]);

  const negotiateVideo = useCallback(async (track: MediaStreamTrack | null, stream: MediaStream | null) => {
    for (const entry of connectionsRef.current.values()) {
      const sender = entry.connection.getSenders().find((candidate) => candidate.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      else if (track && stream) entry.connection.addTrack(track, stream);
      await sendOffer(entry);
    }
  }, [sendOffer]);

  const processSignal = useCallback(async (signal: Signal) => {
    const entry = ensureConnection(signal.from);
    if (signal.kind === "candidate") {
      const candidate = jsonObject(signal.payload.candidate);
      if (!candidate) return;
      if (entry.connection.remoteDescription) await entry.connection.addIceCandidate(candidate as RTCIceCandidateInit).catch(() => undefined);
      else entry.pendingCandidates.push(candidate as RTCIceCandidateInit);
      return;
    }
    const description = jsonObject(signal.payload.description);
    if (!description || (description.type !== "offer" && description.type !== "answer") || typeof description.sdp !== "string") return;
    if (signal.kind === "offer") {
      if (entry.connection.signalingState !== "stable") return;
      await entry.connection.setRemoteDescription(description as unknown as RTCSessionDescriptionInit);
      for (const candidate of entry.pendingCandidates.splice(0)) await entry.connection.addIceCandidate(candidate).catch(() => undefined);
      const answer = await entry.connection.createAnswer();
      await entry.connection.setLocalDescription(answer);
      if (entry.connection.localDescription) await sendSignal(entry.peer.sessionId, "answer", { description: { type: entry.connection.localDescription.type, sdp: entry.connection.localDescription.sdp } });
      return;
    }
    if (entry.connection.signalingState === "have-local-offer") {
      await entry.connection.setRemoteDescription(description as unknown as RTCSessionDescriptionInit);
      for (const candidate of entry.pendingCandidates.splice(0)) await entry.connection.addIceCandidate(candidate).catch(() => undefined);
    }
  }, [ensureConnection, sendSignal]);

  const synchroniseParticipants = useCallback(async (next: VoiceParticipant[]) => {
    if (!mounted.current) return;
    setParticipants(next);
    const ours = sessionRef.current?.id;
    if (!ours) return;
    const available = new Set(next.map((member) => member.sessionId));
    for (const [peerId, entry] of connectionsRef.current) {
      if (!available.has(peerId)) {
        entry.connection.close(); connectionsRef.current.delete(peerId);
        setRemoteStreams((current) => { const updated = { ...current }; delete updated[peerId]; return updated; });
      }
    }
    for (const peer of next) if (peer.sessionId !== ours && !connectionsRef.current.has(peer.sessionId) && ours > peer.sessionId) await sendOffer(ensureConnection(peer));
  }, [ensureConnection, sendOffer]);

  const poll = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const reply = await request({ action: "poll", sessionId: session.id, token: session.token }) as PollReply;
      for (const signal of reply.signals ?? []) await processSignal(signal);
      await synchroniseParticipants(reply.participants ?? []);
    } catch (error) {
      if (mounted.current) setNotice(error instanceof Error ? error.message : "The voice call lost its connection.");
    } finally { pollingRef.current = false; }
  }, [processSignal, request, synchroniseParticipants]);

  const closeConnections = useCallback(() => {
    for (const entry of connectionsRef.current.values()) entry.connection.close();
    connectionsRef.current.clear();
    if (mounted.current) setRemoteStreams({});
  }, []);

  const leave = useCallback(async (quiet = false) => {
    if (pollTimerRef.current) { window.clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    const session = sessionRef.current;
    if (session) {
      try {
        await request({ action: "leave", sessionId: session.id, token: session.token });
      } catch {
        // A stale server session expires quickly. Local media must still be released.
      }
    }
    sessionRef.current = null;
    closeConnections();
    stop(microphoneStreamRef.current); stop(cameraStreamRef.current); stop(screenStreamRef.current);
    microphoneStreamRef.current = null; cameraStreamRef.current = null; screenStreamRef.current = null;
    activeRoomRef.current = null; activePilotRef.current = null;
    if (mounted.current) {
      setActiveRoom(null); setActivePilot(null); setPreviewStream(null); setParticipants([]); setMuted(true); setCameraOn(false); setScreenOn(false);
      if (!quiet) { setPhase("idle"); setNotice(""); }
    }
  }, [closeConnections, request]);

  const join = useCallback(async (room: VoiceRoom, pilot: VoicePilot, seatIndex?: number) => {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setPhase("error"); setNotice("This browser cannot make a direct voice call. Try the latest Safari, Chrome, Edge or Firefox."); return;
    }
    if (sessionRef.current && activeRoomRef.current?.id === room.id) return;
    if (sessionRef.current) await leave();
    activeRoomRef.current = room;
    activePilotRef.current = pilot;
    setActiveRoom(room); setActivePilot(pilot); setPhase("joining"); setNotice("");
    let microphoneReady = false;
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(selectedInputId), video: false });
      microphone.getAudioTracks().forEach((track) => { track.enabled = false; });
      microphoneStreamRef.current = microphone;
      microphoneReady = true;
      void refreshDevices();
      const reply = await request({ action: "join", seatIndex }) as JoinReply;
      sessionRef.current = { id: reply.session.sessionId, token: reply.token };
      iceServersRef.current = reply.iceServers;
      await synchroniseParticipants(reply.participants);
      if (!mounted.current) return;
      setPhase("connected");
      pollTimerRef.current = window.setInterval(() => void poll(), 2_500);
      void poll();
    } catch (error) {
      stop(microphoneStreamRef.current); microphoneStreamRef.current = null;
      if (mounted.current) setPhase("error");
      if (mounted.current) {
        setNotice(microphoneReady ? (error instanceof Error ? error.message : "Your voice call could not be connected.") : deviceError(error, "microphone"));
      }
    }
  }, [leave, poll, refreshDevices, request, selectedInputId, synchroniseParticipants]);

  const reconnect = useCallback(async () => {
    const room = activeRoomRef.current;
    const pilot = activePilotRef.current;
    if (!room || !pilot) return;
    setPhase("joining");
    setNotice("Rebuilding your secure call route…");
    await leave(true);
    await join(room, pilot);
  }, [join, leave]);

  const toggleMuted = useCallback(() => {
    const next = !muted;
    microphoneStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const selectInput = useCallback(async (deviceId: string) => {
    setSelectedInputId(deviceId);
    if (!sessionRef.current || !microphoneStreamRef.current) return;
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId), video: false });
      next.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      const previous = microphoneStreamRef.current;
      microphoneStreamRef.current = next;
      let needsNegotiation = false;
      for (const entry of connectionsRef.current.values()) {
        const sender = entry.connection.getSenders().find((candidate) => candidate.track?.kind === "audio");
        const track = next.getAudioTracks()[0] ?? null;
        if (sender) await sender.replaceTrack(track);
        else if (track) { entry.connection.addTrack(track, next); needsNegotiation = true; }
      }
      if (needsNegotiation) {
        for (const entry of connectionsRef.current.values()) await sendOffer(entry);
      }
      stop(previous);
      void refreshDevices();
      setNotice("Microphone updated for this call.");
    } catch (error) {
      setNotice(deviceError(error, "microphone"));
    }
  }, [muted, refreshDevices, sendOffer]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      const previous = cameraStreamRef.current; cameraStreamRef.current = null; stop(previous);
      if (!screenOn) { await negotiateVideo(null, null); setPreviewStream(null); }
      setCameraOn(false); return;
    }
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true });
      cameraStreamRef.current = camera;
      void refreshDevices();
      if (!screenOn) { setPreviewStream(camera); await negotiateVideo(camera.getVideoTracks()[0] ?? null, camera); }
      setCameraOn(true);
    } catch (error) { setNotice(deviceError(error, "camera")); }
  }, [cameraOn, negotiateVideo, refreshDevices, screenOn, selectedCameraId]);

  const stopScreenShare = useCallback(async () => {
    const previous = screenStreamRef.current; screenStreamRef.current = null; stop(previous);
    const camera = cameraStreamRef.current;
    await negotiateVideo(camera?.getVideoTracks()[0] ?? null, camera ?? null);
    if (mounted.current) { setPreviewStream(camera); setScreenOn(false); }
  }, [negotiateVideo]);

  const toggleScreen = useCallback(async () => {
    if (screenOn) { await stopScreenShare(); return; }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = screen.getVideoTracks()[0];
      if (!track) { stop(screen); return; }
      screenStreamRef.current = screen;
      track.addEventListener("ended", () => { void stopScreenShare(); }, { once: true });
      setPreviewStream(screen); await negotiateVideo(track, screen); setScreenOn(true);
    } catch (error) { setNotice(deviceError(error, "screen")); }
  }, [negotiateVideo, screenOn, stopScreenShare]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void leave(true); };
  }, [leave]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const handleChange = () => { void refreshDevices(); };
    mediaDevices.addEventListener("devicechange", handleChange);
    return () => mediaDevices.removeEventListener("devicechange", handleChange);
  }, [refreshDevices]);

  const value = useMemo<CrewVoiceContextValue>(() => ({ activeRoom, activePilot, phase, notice, muted, cameraOn, screenOn, participants, waitingRoomCount, remoteStreams, previewStream, inputDevices, outputDevices, cameraDevices, selectedInputId, selectedOutputId, selectedCameraId, outputSelectionSupported, join, leave: () => leave(), reconnect, toggleMuted, toggleCamera, toggleScreen, refreshDevices, selectInput, selectOutput, selectCamera, previewRoom }), [activePilot, activeRoom, cameraDevices, cameraOn, inputDevices, join, leave, muted, notice, outputDevices, outputSelectionSupported, participants, phase, previewRoom, previewStream, reconnect, refreshDevices, remoteStreams, screenOn, selectCamera, selectInput, selectOutput, selectedCameraId, selectedInputId, selectedOutputId, toggleCamera, toggleMuted, toggleScreen, waitingRoomCount]);

  return <CrewVoiceContext.Provider value={value}>{children}{phase === "connected" && activeRoom && activePilot ? <aside className="crew-voice-dock" aria-label="Active Crew Lounge voice call"><div className="crew-voice-dock-summary"><span className="crew-voice-dock-dot" aria-hidden="true" /><span><strong>In voice · {activeRoom.name}</strong><small>{participants.length}/{activeRoom.maxParticipants} pilots · {muted ? "Muted" : "Microphone on"}</small></span></div><div className="crew-voice-dock-actions"><button type="button" onClick={toggleMuted}>{muted ? "Unmute" : "Mute"}</button><button type="button" onClick={() => void toggleCamera()}>{cameraOn ? "Camera off" : "Camera"}</button><button type="button" onClick={() => void toggleScreen()}>{screenOn ? "Stop share" : "Share"}</button><button type="button" className="leave" onClick={() => void leave()}>Leave</button></div>{Object.entries(remoteStreams).map(([sessionId, stream]) => <RemoteAudio key={sessionId} stream={stream} outputDeviceId={selectedOutputId} onPlaybackBlocked={() => setNotice("Your browser paused incoming call audio. Interact with this page, then press Reconnect voice or check your selected speaker.")} />)}</aside> : null}</CrewVoiceContext.Provider>;
}

export function useCrewVoice() {
  const context = useContext(CrewVoiceContext);
  if (!context) throw new Error("Crew voice controls must be used within CrewVoiceProvider.");
  return context;
}
