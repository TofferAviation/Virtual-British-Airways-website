# BAV Crew Lounge voice

## Day-one pilot-to-pilot beta

The first Crew Lounge release deliberately keeps the service inside BAV's existing footprint:

- **Supabase** stores staff-managed room metadata and the separate room-chat history.
- **The BAV website on Render** verifies each pilot's signed BAV session, keeps a short-lived in-memory list of people in an open room, and relays only WebRTC connection invitations.
- **Participating browsers** send microphone, camera and screen media directly to one another. BAV does not record, relay or persist that media.

A browser asks for microphone access only after a pilot presses **Join voice**. It begins muted. Camera and screen-sharing permissions are requested only when that pilot selects the relevant control. Leaving the room stops all local media tracks.

The beta is capped at four pilots in each open room. Its signals expire after 90 seconds without a heartbeat and are held only in the running website process; a deploy or service restart simply ends the call and pilots can reconnect. Connection setup uses STUN, which may expose normal network-routing metadata such as an IP address to the STUN operator, but it never carries the call's audio, video or shared screen.

This is an intentionally modest, no-extra-cost starting point. It is suitable for route planning, an event briefing and a small social call. It is not a replacement for a hosted Discord-scale service: pilots behind restrictive or symmetric-NAT networks can fail to connect because there is no TURN relay.

## Future BAV-hosted service

When consistent larger rooms are worth funding, replace the in-memory setup layer with a BAV-operated WebRTC service behind a BAV-owned hostname such as `voice.virtualairline.co.uk`.

1. Run a maintained SFU and authenticated TURN relay in the selected region.
2. Have the website issue a short-lived BAV-signed room token only after it verifies both the pilot session and the room status.
3. Keep recording, transcription and analytics disabled until BAV has a separate policy and explicit pilot consent.
4. Test desktop and mobile Safari with voice-only, camera and screen-sharing before lifting the four-pilot limit.

Text conversation is separate from media. The website currently displays the most recent 14 days of messages from `crew_room_messages`; that display window is not a claim that audio, camera or screen data is stored.
