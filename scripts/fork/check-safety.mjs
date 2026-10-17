#!/usr/bin/env node
// Fork-specific guard. No dependencies or network access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const config = JSON.parse(read('src-tauri/tauri.conf.json'));
const rust = read('src-tauri/src/app_update.rs');
const readme = read('README.md');

assert.equal(config.plugins?.updater?.active, false,
  'Fork must not activate Tauri updater until signed fork-only channels exist');
assert.equal(config.bundle?.createUpdaterArtifacts, false,
  'Fork must not create unsigned or upstream-key updater artifacts');
assert.match(rust, /const FORK_UPDATER_READY:\s*bool\s*=\s*false\s*;/,
  'Rust custom updater must stay fail-closed until independent publishing');
assert.match(rust, /pub async fn check_app_update\([\s\S]*?require_fork_updater_ready\(\)\?;/,
  'Custom check_app_update path must enforce fork update guard');
assert.match(readme, /Independent community fork/);
process.stdout.write('Fork release-safety checks passed. Independent installation is not yet validated.\n');
