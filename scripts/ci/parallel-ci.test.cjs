const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../.github/workflows/ci.yml"),
  "utf8"
);
const jobSource = source.split("\njobs:\n")[1];
assert.ok(jobSource, "CI must define jobs");
const chunks = [...jobSource.matchAll(/^  ([a-z][a-z0-9-]*):\n/gm)];
const jobs = new Map();
for (let i = 0; i < chunks.length; i += 1) {
  const current = chunks[i];
  const end = chunks[i + 1]?.index ?? jobSource.length;
  jobs.set(current[1], jobSource.slice(current.index, end));
}
function checkStatus(name, status) {
  return '"' + String.fromCharCode(36) + '{' + name + '}" == "' + status + '"';
}

test("frontend quality, build and affected tests are separate jobs", () => {
  const quality = jobs.get("frontend-quality");
  const build = jobs.get("frontend-web");
  const unit = jobs.get("frontend-tests");
  assert.ok(quality && build && unit);
  assert.match(quality, /pnpm typecheck:fast/);
  assert.match(quality, /pnpm check:i18n:contracts/);
  assert.doesNotMatch(quality, /pnpm build:web|run-unit-tests\.mjs/);
  assert.match(build, /pnpm build:web/);
  assert.match(unit, /run-unit-tests\.mjs/);
  assert.doesNotMatch(unit, /pnpm build:web/);
});

test("existing frontend required check rejects failed subjobs", () => {
  const gate = jobs.get("frontend");
  assert.ok(gate);
  assert.match(gate, /name: Frontend \(typecheck · lint · test\)/);
  assert.match(gate, /needs: \[frontend-quality, frontend-web, frontend-tests\]/);
  assert.match(gate, /if: always\(\)/);
  for (const name of ["QUALITY", "WEB", "TESTS"]) {
    assert.ok(gate.includes(checkStatus(name, "success")), name);
  }
});

test("macOS clippy and full Rust workspace tests run independently", () => {
  const lint = jobs.get("rust-clippy");
  const tests = jobs.get("rust-tests");
  assert.ok(lint && tests);
  assert.match(lint, /cargo clippy --workspace --all-targets -- -D warnings/);
  assert.doesNotMatch(lint, /cargo test --workspace/);
  assert.match(tests, /cargo test --workspace --no-fail-fast/);
  assert.doesNotMatch(tests, /cargo clippy --workspace/);
  assert.match(lint, /needs: changes/);
  assert.match(tests, /needs: changes/);
  assert.match(tests, /cache-on-failure: true/);
});

test("old Rust check passes only after full macOS checks", () => {
  const gate = jobs.get("rust");
  assert.ok(gate);
  assert.match(gate, /name: Rust \(clippy\)/);
  assert.match(gate, /needs: \[changes, rust-clippy, rust-tests\]/);
  assert.match(gate, /if: always\(\)/);
  for (const n of ["CLIPPY", "TESTS"]) {
    assert.ok(gate.includes(checkStatus(n, "success")));
    assert.ok(gate.includes(checkStatus(n, "skipped")));
  }
  assert.ok(gate.includes(checkStatus("SCOPE", "success")));
});

test("Windows Rust and existing independent security jobs still exist", () => {
  assert.match(jobs.get("rust-windows"), /cargo clippy --workspace --all-targets -- -D warnings/);
  assert.match(jobs.get("gitleaks"), /gitleaks/);
  assert.match(jobs.get("cargo-audit"), /cargo audit/);
});
