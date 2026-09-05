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

## Local setup on Windows

From PowerShell or Command Prompt:

```bash
cd /d "D:\Virtual British Airways files"
git clone https://github.com/TofferAviation/Virtual-British-Airways-website.git .
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

If the repository is already cloned locally, use:

```bash
git pull
npm install
npm run dev
```

## Useful commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
```

## Environment configuration

Copy `.env.example` to `.env.local` when real services are introduced. Never commit `.env.local`, API keys, database passwords or vAMSYS/Phoenix secrets.

## Planned backend

- PostgreSQL pilot / schedule / fleet database
- Secure application sessions
- vAMSYS-approved authentication or SSO flow
- Phoenix shared pilot statistics
- Real schedule availability and assignments
- Admin portal

## Integration principles

### vAMSYS

The website must not ask pilots to hand us their vAMSYS password. Authentication should use an approved redirect/SSO/API mechanism once vAMSYS provides the required integration details.

### Phoenix

Phoenix and the website should consume the same authoritative pilot record. A completed Phoenix flight should eventually update website flight counts, hours, landing stats, VA Points and Tier Points automatically.

## Important brand note

This project is for a virtual airline / flight-simulation community. Keep `Virtual` and the non-affiliation messaging visible in public-facing pages unless formal brand permission changes that requirement.
