# Alliance Operations implementation and release plan

## Architecture audit (6 November 2026)

- Next.js App Router; server actions authenticate pilots with `pilot-auth` and staff with `staff-auth`/existing permission IDs.
- Pilot identity, career totals, preferences, passport and bookings live in the Supabase `pilot_state` JSON document. Local JSON is development-only. Existing writes replace that document: add compare-and-swap protection before introducing transactional alliance credit.
- `pilot_pireps` is normalized PostgreSQL storage. `pilot-operations-store` owns submission/review and currently updates career stats before the review row. Alliance review must use a single database transaction instead of repeating these side effects.
- Salary already has an idempotent finance ledger. Qualifications, Fly/Career/Realistic preferences and career passport exist. Reuse these; do not introduce a second pilot identity.
- Dispatch uses saved bookings and SimBrief. Its airport/aircraft/callsign handling assumes BA; add explicit verified partner metadata without weakening BA validation.
- Ember uses the existing assignment and session endpoints. Partner assignments must not reserve or relocate a BA-owned airframe. Preserve the assignment contract and add operator/source metadata.
- vAMSYS (`src/lib/integrations/vamsys.ts`) is an unconnected boundary, not an authenticated provider. External transfer stays disabled. Export is pilot-authorized only.
- Existing `/oneworld` is an informational page, not an operations module. Existing BA catalogue and its importer remain separate.

## Phases

1. Audit and this plan; verify membership against https://www.oneworld.com/news/oneworld-welcomes-hawaiian-airlines (16 members). No branding assets or partner schedules are licensed by that fact.
2. Add normalized configuration/membership, provenance-backed schedules, booking snapshots, immutable credit/reversal/adjustment ledger and export audit. Row locks, unique keys and optimistic pilot snapshots protect concurrent review. Historic totals remain untouched.
3. Add route explorer, airline banks/logbooks, alliance career/passport and staff manager using existing authentication/style. Empty catalogues explain how Operations imports approved schedules.
4. Connect booking/SimBrief/Ember/PIREP approval and virtual finance. Snapshot policy at booking. Existing modes/qualifications remain authoritative. No automatic external credit.
5. Test credit arithmetic, concurrent/idempotent approval, rejection/reversal/adjustment, provenance/membership, ownership and historical balances. Run typecheck/build; validate migration in isolated PostgreSQL before enabling.

## Production rollout / rollback

Apply `20261106090000_alliance_operations.sql` and `20261106091000_finance_rpc_column_qualification.sql` after existing migrations using the normal Supabase migration workflow. The database setting starts disabled. Import schedules only with documented permission/source, check the imported records, then enable the system in Staff Centre. The code treats a missing migration as unavailable and does not silently use ephemeral storage.

Existing finance balance constraints remain in place. A reversal recovers available virtual salary; any already-spent amount is recorded in the private alliance withholding ledger and offset against future alliance pay. It never creates an overdraft or resets existing balances. The finance function correction qualifies ambiguous column names and restricts execution to the existing application service role.

Rollback first disables new alliance bookings in Staff Centre. Retain booking snapshots, PIREPs, ledgers and export audit. Deploy the previous website only after pending alliance reports have been reviewed/reversed using the new code; old code does not understand partner credit. Never drop financial/history tables to roll back. Re-run migrations safely without reseeding changed membership/policies.

## Data policy

No partner schedules are seeded: publicly readable timetables are not automatically reusable datasets. Staff can import licensed/permissioned current schedules, explicitly labelled historical/manual records, or clearly labelled virtual routes. Source URL, permission basis, validity, verification time, operating carrier, checked callsign, ICAO airports and aircraft are required. Affiliates need explicit approval and effective dates. Marketing codes never determine the operator's hour bank.

## Release notes and verification

- Pilot entry points: `/oneworld/operations`, `/account/alliance` and `/account/alliance/passport`; staff controls: `/staff/alliance`.
- Existing booking/SimBrief/Ember reports retain BA pilot identity and use the verified partner operator. BA-owned Fleet aircraft are excluded from partner reservations, operation completion and landing maintenance, including requests from older Ember versions.
- Approval, corrections, reversals, airline balances, virtual rewards and exports are audited and idempotent. Existing historical hours are preserved. External-provider sync stays disabled.
- 36 alliance checks pass, including actual PostgreSQL transactions, simultaneous approvals, reversals after virtual pay was spent, source/membership validation, authorization and page rendering. The 17 booking, registration and recovery regression checks also pass. Production website build succeeds; Ember 0.5.80 builds with no warnings/errors and its 54 core checks pass.
- Production database migration applied on 6 November 2026: 16 configured carriers, zero imported partner schedules, partner booking disabled. A staff member must import permissioned schedules before enabling partner booking.
