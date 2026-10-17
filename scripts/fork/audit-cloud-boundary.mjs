#!/usr/bin/env node
/**
 * TP Agent Studio Cloud ownership audit. No external dependencies or network.
 *
 * Intentionally separate from routine compile CI: the fork's Cloud backend is
 * NOT owned yet. `--release` fails closed until source + infrastructure prove
 * each release condition; a missing string never establishes safety.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const CLOUD_AUDIT_INPUTS = Object.freeze([
  'src/features/Org2Cloud/config.ts',
  'src/features/Org2Cloud/authCallback.ts',
  'src/features/Org2Cloud/org2CloudOrgManagement.ts',
  'src/features/Org2Cloud/cloudSessionReference.ts',
  'src/features/Org2Cloud/billingComplete.ts',
  'src/api/http/auth/sharedAuthStorage.ts',
  'src/config/runtimeInstance.ts',
  'src-tauri/tauri.conf.json',
  'src-tauri/tauri.dev.conf.json',
]);

function check(id, state, description, evidence, nextAction) {
  return { id, state, description, evidence, nextAction };
}

/**
 * Report based on positive source evidence, NOT optimistic string absence.
 * A missing/changed source requires re-review; it is never a green gate.
 * `files` is a map from repo-relative path to the file's UTF-8 content.
 */
export function auditCloudBoundary(files) {
  const source = (path) => files[path] ?? '';
  const config = source('src/features/Org2Cloud/config.ts');
  const callbacks = source('src/features/Org2Cloud/authCallback.ts');
  const invites = source('src/features/Org2Cloud/org2CloudOrgManagement.ts');
  const references = source('src/features/Org2Cloud/cloudSessionReference.ts');
  const billing = source('src/features/Org2Cloud/billingComplete.ts');
  const authStore = source('src/api/http/auth/sharedAuthStorage.ts');
  const runtime = source('src/config/runtimeInstance.ts');
  let app = {}, dev = {};
  try {
    app = JSON.parse(source('src-tauri/tauri.conf.json'));
    dev = JSON.parse(source('src-tauri/tauri.dev.conf.json'));
  } catch { /* A malformed or missing configuration always fails closed. */ }

  const ownedSchemes =
    app.identifier === 'com.theerasakping.tpagentstudio' &&
    dev.identifier === 'com.theerasakping.tpagentstudio.dev' &&
    JSON.stringify(app.plugins?.['deep-link']?.desktop?.schemes) === '["tpagentstudio"]' &&
    JSON.stringify(dev.plugins?.['deep-link']?.desktop?.schemes) === '["tpagentstudio-dev"]';
  const callbackConstrained =
    callbacks.includes('parsed.protocol.toLowerCase() === expected.protocol.toLowerCase()') &&
    config.includes('configureCloudAuthCallbackForIdentifier') &&
    runtime.includes('tpagentstudio-instance');
  const fallbacksUpstream =
    config.includes('https://fpdyejwbiriliuqqcjoy.supabase.co') &&
    config.includes('https://org2-cloud-infra.vercel.app') &&
    /if\s*\(\s*!override\s*\)\s*return\s+OFFICIAL_ENDPOINT/.test(config);
  const credentialNamespaceUpstream =
    authStore.includes('"orgii:org2-cloud-v1:auth"') &&
    authStore.includes('"orgii.supabase.auth"');
  const overrideNamespaceUpstream = config.includes('orgii:org2-cloud-v1:endpointOverride');
  const legacyCloudLinkFormats =
    invites.includes('startsWith("orgii://")') &&
    references.includes('CLOUD_SESSION_REFERENCE_SCHEME = "orgii:"') &&
    billing.includes('startsWith("orgii://")');
  const updaterIsDisabled = app.plugins?.updater?.active === false &&
    app.bundle?.createUpdaterArtifacts === false;

  const findings = [
    check('desktop-schemes', ownedSchemes ? 'passed' : 'blocked',
      'Fork-owned production and development Tauri deep-link schemes',
      'src-tauri/tauri{,.dev}.conf.json',
      'Ensure no upstream or third-party scheme is registered by the fork.'),
    check('oauth-callback-parser', callbackConstrained ? 'passed' : 'review',
      'OAuth callback scheme must match the runtime identity',
      'src/features/Org2Cloud/authCallback.ts + config.ts + runtimeInstance.ts',
      'Verify backend-owned redirect allowlist and native callback handling on every OS.'),
    check('cloud-default-endpoint', fallbacksUpstream ? 'blocked' : 'review',
      'Fork must not silently default to an upstream-managed Cloud tenant',
      'src/features/Org2Cloud/config.ts',
      'Provide an independently owned backend; fail closed without verified configuration.'),
    check('cloud-auth-namespace', credentialNamespaceUpstream ? 'blocked' : 'review',
      'Fork Cloud credentials require a distinct ownership/migration policy',
      'src/api/http/auth/sharedAuthStorage.ts',
      'Specify fork-owned storage and keychain keys; do not auto-copy upstream tokens.'),
    check('cloud-override-namespace', overrideNamespaceUpstream ? 'blocked' : 'review',
      'Endpoint overrides must be isolated from upstream keys',
      'src/features/Org2Cloud/config.ts',
      'Use fork namespace and explicit consent for migration and endpoint switching.'),
    check('cloud-links', legacyCloudLinkFormats ? 'blocked' : 'review',
      'Invite/share/reference/billing deep links must have verified fork ownership',
      'org2CloudOrgManagement.ts + cloudSessionReference.ts + billingComplete.ts',
      'Use fork-owned URI generation and an explicit provenance-aware parser; do not loosen legacy matches.'),
    check('release-updater', updaterIsDisabled ? 'passed' : 'blocked',
      'Unsigned upstream updater must remain disabled',
      'src-tauri/tauri.conf.json',
      'Keep disabled until independent signing, publishing and rollback are tested.'),
    check('fork-backend-acceptance', 'review',
      'Independent tenants, redirect allowlists, RLS, billing and token isolation require E2E evidence',
      'docs/fork/FORK_CLOUD_BOUNDARY.md',
      'Record backend identifiers and passing tests before removing the release block.'),
  ];
  const counts = {
    passed: findings.filter((f) => f.state === 'passed').length,
    blocked: findings.filter((f) => f.state === 'blocked').length,
    review: findings.filter((f) => f.state === 'review').length,
  };
  return { project: 'TP Agent Studio', releaseReady: counts.blocked === 0 && counts.review === 0,
    counts, findings };
}

export function readCloudAuditInputs(root = DEFAULT_ROOT) {
  const files = {};
  for (const path of CLOUD_AUDIT_INPUTS) {
    try { files[path] = readFileSync(resolve(root, path), 'utf8'); }
    catch { files[path] = ''; }
  }
  return files;
}

function runCli(args) {
  const json = args.includes('--json');
  const strict = args.includes('--release');
  const rootPos = args.indexOf('--root');
  if (rootPos >= 0 && !args[rootPos + 1]) {
    process.stderr.write('--root requires a directory\n');
    process.exitCode = 2;
    return;
  }
  const root = rootPos >= 0 ? resolve(args[rootPos + 1]) : DEFAULT_ROOT;
  const result = auditCloudBoundary(readCloudAuditInputs(root));
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(`TP Agent Studio Cloud boundary: ${result.counts.passed} passed, ${result.counts.blocked} blocked, ${result.counts.review} review required\n`);
    for (const finding of result.findings) {
      process.stdout.write(`- ${finding.state.toUpperCase()} ${finding.id}: ${finding.description}\n  Evidence: ${finding.evidence}\n  Next: ${finding.nextAction}\n`);
    }
  }
  if (strict && !result.releaseReady) {
    process.stderr.write('Fork Cloud release NOT authorized: blockers or missing evidence remain.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2));
}
