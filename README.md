# British Airways Virtual Website

Production website project for the British Airways Virtual flight-simulation community.

## Status

`v0.1.0` — production foundation established.

The project now includes:

- Next.js + TypeScript application structure
- Shared British Airways Virtual header/footer
- Immersive homepage
- Virtual flight search
- Full destination seed dataset from the prototype
- Flight-selection page
- Pilot login page
- Pilot account dashboard
- VA Points / Tier Points placeholders
- Recent pilot flight statistics
- Fleet directory
- Destination directory
- Help centre
- vAMSYS integration boundary
- Phoenix integration boundary
- Health API endpoint

## Temporary private development preview

The development site can be protected with a simple temporary password gate while it is shared through a preview tunnel.

Add these values to `.env.local`:

```env
BAV_PREVIEW_PROTECTION=true
BAV_PREVIEW_PASSWORD=replace-with-a-private-test-password
```

Restart the Next.js server after changing environment values. When the website is ready for unrestricted access, set `BAV_PREVIEW_PROTECTION=false` or remove both preview variables. This gate is separate from pilot and Staff Centre authentication.

## Clean deployment

The production account source of truth is Supabase. Run the SQL migrations in
`supabase/migrations` in timestamp order on a new Supabase project, then create
the Render service from `render.yaml` and set the two Supabase environment
variables from that new project.

Staff Centre does not use a separate password or browser cookie. A pilot signs
in once with their BAV account; an active Staff role record with the same email
grants their Staff Centre permissions.

## Local setup on Windows

Copy `.env.example` to `.env.local`, set values for a development Supabase
project, then run:

```powershell
npm install
npm run dev
```
