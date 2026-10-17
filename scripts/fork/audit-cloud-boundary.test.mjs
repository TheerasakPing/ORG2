import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLOUD_AUDIT_INPUTS,
  auditCloudBoundary,
  readCloudAuditInputs,
} from './audit-cloud-boundary.mjs';

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), 'audit-cloud-boundary.mjs');

function fixture() {
  return {
    'src-tauri/tauri.conf.json': JSON.stringify({
      identifier: 'com.theerasakping.tpagentstudio',
      bundle: { createUpdaterArtifacts: false },
      plugins: { updater: { active: false }, 'deep-link': { desktop: { schemes: ['tpagentstudio'] } } },
    }),
    'src-tauri/tauri.dev.conf.json': JSON.stringify({
      identifier: 'com.theerasakping.tpagentstudio.dev',
      plugins: { 'deep-link': { desktop: { schemes: ['tpagentstudio-dev'] } } },
    }),
    'src/features/Org2Cloud/config.ts': "const up='https://fpdyejwbiriliuqqcjoy.supabase.co'; const web='https://org2-cloud-infra.vercel.app'; if (!override) return OFFICIAL_ENDPOINT; configureCloudAuthCallbackForIdentifier; const storage='orgii:org2-cloud-v1:endpointOverride';",
    'src/features/Org2Cloud/authCallback.ts': 'parsed.protocol.toLowerCase() === expected.protocol.toLowerCase()',
    'src/config/runtimeInstance.ts': 'tpagentstudio-instance',
    'src/api/http/auth/sharedAuthStorage.ts': '"orgii:org2-cloud-v1:auth" and "orgii.supabase.auth"',
    'src/features/Org2Cloud/org2CloudOrgManagement.ts': 'trimmed.startsWith("orgii://")',
    'src/features/Org2Cloud/cloudSessionReference.ts': 'CLOUD_SESSION_REFERENCE_SCHEME = "orgii:"',
    'src/features/Org2Cloud/billingComplete.ts': 'trimmed.startsWith("orgii://")',
  };
}

describe('TP Agent Studio Cloud release boundary', () => {
  it('inventory input paths remain unique and narrow', () => {
    assert.equal(new Set(CLOUD_AUDIT_INPUTS).size, CLOUD_AUDIT_INPUTS.length);
    assert.ok(CLOUD_AUDIT_INPUTS.every((path) => !path.includes('..')));
  });

  it('recognizes existing P0 blockers without mutating any auth storage', () => {
    const report = auditCloudBoundary(fixture());
    assert.deepEqual(report.counts, { passed: 3, blocked: 4, review: 1 });
    assert.equal(report.releaseReady, false);
    assert.equal(report.findings.find((f) => f.id === 'cloud-default-endpoint')?.state, 'blocked');
    assert.equal(report.findings.find((f) => f.id === 'cloud-auth-namespace')?.state, 'blocked');
    assert.equal(report.findings.find((f) => f.id === 'cloud-override-namespace')?.state, 'blocked');
    assert.equal(report.findings.find((f) => f.id === 'cloud-links')?.state, 'blocked');
  });

  it('fails closed on missing or changed evidence, including malformed config', () => {
    const broken = fixture();
    delete broken['src/features/Org2Cloud/authCallback.ts'];
    broken['src-tauri/tauri.dev.conf.json'] = '{not-json';
    const report = auditCloudBoundary(broken);
    assert.equal(report.releaseReady, false);
    assert.equal(report.findings.find((f) => f.id === 'desktop-schemes')?.state, 'blocked');
    assert.equal(report.findings.find((f) => f.id === 'oauth-callback-parser')?.state, 'review');
  });

  it('does not turn missing known-problem strings into a false green release', () => {
    const changed = fixture();
    changed['src/features/Org2Cloud/config.ts'] = 'a new implementation';
    changed['src/api/http/auth/sharedAuthStorage.ts'] = 'a new implementation';
    changed['src/features/Org2Cloud/org2CloudOrgManagement.ts'] = 'a new implementation';
    const report = auditCloudBoundary(changed);
    assert.equal(report.releaseReady, false);
    for (const id of ['cloud-default-endpoint', 'cloud-auth-namespace', 'cloud-override-namespace', 'cloud-links']) {
      assert.equal(report.findings.find((f) => f.id === id)?.state, 'review');
    }
  });

  it('normal mode reports without failing, release mode blocks with JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'tp-cloud-audit-'));
    try {
      for (const [path, value] of Object.entries(fixture())) {
        const file = join(root, path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, value);
      }
      assert.deepEqual(readCloudAuditInputs(root), fixture());
      const normal = spawnSync(process.execPath, [scriptPath, '--root', root], { encoding: 'utf8' });
      assert.equal(normal.status, 0);
      assert.match(normal.stdout, /4 blocked/);
      const strict = spawnSync(process.execPath, [scriptPath, '--root', root, '--release', '--json'], { encoding: 'utf8' });
      assert.equal(strict.status, 1);
      assert.equal(JSON.parse(strict.stdout).releaseReady, false);
      assert.match(strict.stderr, /NOT authorized/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
