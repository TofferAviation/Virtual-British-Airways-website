# BAV Crew Lounge voice

## Pilot privacy and room scope

Crew Lounge voice is for small, staff-managed rooms of up to four pilots. A browser asks for microphone access only after a pilot presses **Join voice**, and starts muted. Camera and screen-share access are requested only when that pilot selects the relevant control. Leaving the room stops local media tracks.

BAV does not record or retain voice, camera, or screen-share content. Text chat is separate from media and the lounge displays the most recent 14 days of messages from `crew_room_messages`.

## Reliable connection routing

The BAV website verifies a pilot's signed session, room access, and signalling messages. Browsers try to connect directly first. When their networks cannot make a direct WebRTC connection, the configured Cloudflare Realtime TURN relay carries the encrypted audio, video, or shared screen between participants. This is routing only: it does not add recording or transcription.

The browser never receives BAV's long-lived Cloudflare secret. For every room join, the website asks Cloudflare for short-lived ICE credentials that expire after two hours.

## One-time production setup

1. Apply both Crew Lounge voice migrations in Supabase, including `20261016195000_crew_voice_peer_signalling.sql`. This stores only short-lived encrypted-call setup messages; it does not store media.
2. In Cloudflare, create a **Realtime TURN** key named `bav-crew-lounge-production`.
3. Give the key an API token permitted to generate TURN credentials.
4. In Render, add these encrypted environment variables to the BAV website service:
   - `BAV_CLOUDFLARE_TURN_KEY_ID`
   - `BAV_CLOUDFLARE_TURN_KEY_TOKEN`
5. Redeploy the service after saving the values.
6. Test with two signed-in pilot accounts on separate networks, first voice-only and then camera and screen share. In **Call settings**, test switching microphone, speaker (on supported browsers), and camera.

Without these settings, the beta uses direct peer-to-peer routing with a STUN service. That can fail on restrictive or symmetric-NAT networks and should only be used as a development fallback.

## Operational boundary

Cloudflare TURN keeps small rooms dependable, but it is not a Discord-scale media platform. A future larger-room service should use an authenticated SFU, BAV-owned room tokens, an explicit retention policy, and mobile Safari testing before the four-pilot cap is raised.
