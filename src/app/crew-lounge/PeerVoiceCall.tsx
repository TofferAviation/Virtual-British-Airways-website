"use client";

import { useEffect, useMemo, useRef } from "react";
import { type VoicePilot, type VoiceRoom, useCrewVoice } from "@/components/CrewVoiceProvider";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BA";
}

function StreamVideo({ stream, className, muted = false }: { stream: MediaStream; className?: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} className={className} autoPlay muted={muted} playsInline />;
}

export function PeerVoiceCall({ room, pilot }: { room: VoiceRoom; pilot: VoicePilot }) {
  const voice = useCrewVoice();
  const { previewRoom } = voice;
  const isThisRoom = voice.activeRoom?.id === room.id;
  const otherParticipants = useMemo(() => isThisRoom ? voice.participants.filter((member) => member.pilotId !== pilot.id) : [], [isThisRoom, pilot.id, voice.participants]);
  const phase = isThisRoom ? voice.phase : "idle";

  useEffect(() => {
    if (!isThisRoom) void previewRoom(room);
  }, [isThisRoom, previewRoom, room]);

  const memberCount = phase === "connected" ? voice.participants.length : voice.waitingRoomCount;
  const localMedia = Boolean(voice.previewStream?.getVideoTracks().some((track) => track.readyState === "live"));

  if (!isThisRoom && voice.phase === "connected" && voice.activeRoom) {
    return <section className="crew-p2p-call" aria-label="Active Crew Lounge voice room"><header className="crew-p2p-call-heading"><div><span className="crew-voice-eyebrow">Voice continues</span><h3>You are still in {voice.activeRoom.name}</h3></div><span className="crew-p2p-capacity">{voice.participants.length}/4 pilots</span></header><div className="crew-p2p-intro"><p>Your call stays connected while you explore the website. Use the voice dock at the bottom of the page to manage it or leave.</p><button type="button" className="crew-voice-secondary" onClick={() => void voice.leave()}>Leave voice</button></div></section>;
  }

  return <section className="crew-p2p-call" aria-label="Private Crew Lounge voice room">
    <header className="crew-p2p-call-heading"><div><span className="crew-voice-eyebrow">Private direct call · beta</span><h3>{phase === "connected" ? "You are in the crew room" : "Join the crew voice room"}</h3></div><span className="crew-p2p-capacity">{memberCount}/4 pilots</span></header>
    {phase === "idle" || phase === "error" ? <div className="crew-p2p-intro"><p>Join muted, then decide whether to speak, turn on your camera, or share a screen. BAV does not record or retain your media.</p><button type="button" className="crew-voice-primary" onClick={() => void voice.join(room, pilot)}>Join voice</button></div> : null}
    {phase === "joining" ? <div className="crew-p2p-intro"><span className="crew-p2p-spinner" aria-hidden="true" /><p>Asking your browser for microphone permission and preparing a secure voice connection…</p></div> : null}
    {phase === "connected" ? <>
      <div className={`crew-p2p-grid crew-p2p-grid-${Math.min(Math.max(memberCount, 1), 4)}`}>
        <article className="crew-p2p-tile crew-p2p-self">{localMedia && voice.previewStream ? <StreamVideo stream={voice.previewStream} className="crew-p2p-video" muted /> : <span className="crew-p2p-avatar">{pilot.profileImage ? <img src={pilot.profileImage} alt="" /> : initials(pilot.name)}</span>}<footer><strong>You</strong><span>{voice.screenOn ? "Sharing screen" : voice.cameraOn ? "Camera on" : voice.muted ? "Muted" : "Speaking"}</span></footer></article>
        {otherParticipants.map((member) => {
          const stream = voice.remoteStreams[member.sessionId];
          const video = Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live" && !track.muted));
          return <article className="crew-p2p-tile" key={member.sessionId}>{stream && video ? <StreamVideo stream={stream} className="crew-p2p-video" muted /> : <span className="crew-p2p-avatar">{member.profileImage ? <img src={member.profileImage} alt="" /> : initials(member.name)}</span>}<footer><strong>{member.name}</strong><span>{video ? "Camera on" : stream ? "Listening" : "Connecting…"}</span></footer></article>;
        })}
      </div>
      <div className="crew-p2p-controls"><button type="button" className={voice.muted ? "active" : ""} onClick={voice.toggleMuted}>{voice.muted ? "Unmute" : "Mute"}</button><button type="button" className={voice.cameraOn ? "active" : ""} onClick={() => void voice.toggleCamera()}>{voice.cameraOn ? "Camera off" : "Camera"}</button><button type="button" className={voice.screenOn ? "active" : ""} onClick={() => void voice.toggleScreen()}>{voice.screenOn ? "Stop share" : "Share screen"}</button><button type="button" className="leave" onClick={() => void voice.leave()}>Leave voice</button></div>
      <p className="crew-p2p-privacy">Encrypted pilot-to-pilot media · no BAV recording · calls connect directly when possible and use BAV’s Cloudflare relay only when a network requires it.</p>
    </> : null}
    {isThisRoom && voice.notice ? <div className="crew-p2p-notice" role="status"><p>{voice.notice}</p>{phase === "connected" ? <button type="button" onClick={() => { void voice.leave().then(() => voice.join(room, pilot)); }}>Reconnect voice</button> : null}</div> : null}
  </section>;
}
