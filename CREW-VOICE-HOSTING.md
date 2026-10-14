# BAV Crew Lounge voice hosting

The Crew Lounge interface is intentionally independent from any public video or voice provider. It stores staff-managed room metadata and optional crew-chat text in BAV's existing operational database. Browser camera and microphone checks run only after a pilot presses a control; those checks stay local to the browser and are stopped when the preview is closed or the page is left.

## Required production service

Before live calls are enabled, BAV needs its own WebRTC service behind a BAV-controlled subdomain, such as `voice.virtualairline.co.uk`.

1. Run a supported Jitsi deployment, or comparable BAV-operated SFU, on a maintained host in the chosen region.
2. Put the service behind TLS with a BAV-managed certificate, and publish DNS only after the security review.
3. Operate an authenticated TURN relay for restrictive home, mobile and airline networks. The browser must receive short-lived credentials; never expose a long-lived TURN password in client code.
4. Require a BAV-signed, short-lived room token. The website checks the BAV pilot session and room status before asking the BAV voice gateway for that token.
5. Keep recording disabled by default. Do not add cloud recording, transcription or analytics unless a separate policy, pilot notice and explicit consent flow are approved.
6. Load-test mobile Safari and desktop Chrome/Edge with no camera, voice-only, camera and screen-sharing cases. Verify that the layout adapts as participants join and that a stalled media stream cannot block flight-planning pages.

## Website hand-off point

When the service is available, add a server-only voice gateway that returns only a signed, short-lived join token and the BAV-owned host for an open `crew_voice_rooms` record. The browser must never be given a provider administrator key. The crew room's `meeting_key` is intentionally opaque and must not be used as a public meeting URL.

Text conversation is separate from live media. The website shows the most recent 14 days of messages from `crew_room_messages`; this display window is not a claim that media or camera data is stored.
