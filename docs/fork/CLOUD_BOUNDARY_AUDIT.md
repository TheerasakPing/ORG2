# TP Agent Studio — Cloud boundary audit

**Development branch:** `feature/tp-cloud-boundary-audit` (stacked on PR #9, not on `develop`).
**Date:** 17 October 2026
**Status:** Investigation and defensive input validation. **The fork does not yet own a production Cloud backend.** Do not ship or use production accounts against a presumed independent Cloud.

## What is checked

The offline, read-only CLI `scripts/fork/audit-cloud-boundary.mjs` inspects nine source and configuration files. It never contacts an endpoint, reads keychain secrets, edits app profiles or migrates user tokens.

| Audit gate | Current evidence | Status |
| --- | --- | --- |
| Production / Dev OS deep-link schemes | `tpagentstudio://` and `tpagentstudio-dev://` configured | Source pass |
| Callback scheme matching | Runtime identity derives callback; parser matches expected protocol | Source pass (native E2E pending) |
| Default tenant | No override still falls back to the original publisher's Supabase/web service | **Blocked** |
| Shared credentials | `orgii:` auth and Supabase storage identifiers remain | **Blocked** |
| Endpoint override storage | `orgii:org2-cloud-v1:endpointOverride` retained | **Blocked** |
| Cloud links | Invite, share, reference and billing flows still depend on `orgii://` | **Blocked** |
| App updater | Disabled pending fork-owned release signing | Source pass |
| Independent Cloud backend | Tenancy/RLS, login redirect allowlist, payments and rollback unverified | **Review required** |

These checks are **source observations only**. A missing string is not evidence that a backend is safe: gates become `review` rather than automatically passing. The backend acceptance gate deliberately remains `review` until a human reviews implementation and real E2E evidence.

## Usage

From the repository root:

```bash
node scripts/fork/audit-cloud-boundary.mjs
node scripts/fork/audit-cloud-boundary.mjs --json
node --test scripts/fork/audit-cloud-boundary.test.mjs

# Manual release-preflight command; expected to exit with code 1 until
# every fork-owned Cloud and backend verification gate is resolved.
node scripts/fork/audit-cloud-boundary.mjs --release
```

This command is **not** wired into ordinary PR CI yet; the release-blocking mode is intentionally for preflight review. Enabling it as a routine test today would fail every commit because P0 infrastructure is not complete. Never bypass it in a release workflow by omitting `--release` when Cloud publishing is being enabled.

## Defensive change included on this branch

`Org2CloudEndpointOverrideSchema` now permits only endpoint **origins**:

- HTTPS for remote origins; HTTP only for local loopback hosts
- No URL username/password, path beyond `/`, query or fragment
- Normalize valid values through `new URL(value).origin`, instead of preserving arbitrary suffixes

The URL schema helps avoid ambiguous endpoint switches and unintended credential-bearing URLs, but does not establish trust in an arbitrary custom endpoint. Explicit user consent, backend identity verification, cross-origin token isolation, and security documentation remain required.

## Required implementation before Cloud release

1. Provision independently owned Supabase/web endpoints and disable implicit upstream fallback in the fork, with a readable `Cloud not configured` UI state rather than an uncaught exception.
2. Define fork-specific localStorage and native/keychain namespaces and **opt-in** migration only; never automatically copy upstream authentication.
3. Replace invite/share/reference/billing protocol construction and parsing with ownership-aware fork protocols, and reject upstream-origin tokens by default.
4. Establish exact backend redirect allowlists, CSRF state validation, auth/billing ownership, RLS/tenant isolation, endpoint switch sign-out and rollback.
5. Collect native E2E results on macOS Apple Silicon, Windows 11 and Linux; verify no cross-profile Cloud requests or token replay.
6. Review the audit gates with positive evidence and make a final, mandatory release preflight.

See [Cloud ownership audit](FORK_CLOUD_BOUNDARY.md) and [release roadmap](ROADMAP.md). This branch intentionally does not change the current default server or silently enable Cloud.

## Relationship to PR #9

The branch was created from PR #9's current integration HEAD so work can proceed without moving that head. **No pull request has been opened for this branch yet**, because an additional PR would start another large CI run while the existing integration CI is running. When the previous CI has finished, review and integrate the changes with normal quality checks before release.
