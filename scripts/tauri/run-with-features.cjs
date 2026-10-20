#!/usr/bin/env node

/**
 * Runs `tauri <subcommand>` with the right --features for this OS.
 */

const { spawnSync } = require("child_process");
const path = require("path");
const { tauriFeatureString } = require("./features.cjs");
const { applyDevInstanceEnv } = require("./instance-profile.cjs");
const {
  applyDefaultDiagnosticsEndpoint,
} = require("./diagnostics-endpoint.cjs");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const subcommand = process.argv[2];
if (!subcommand) {
  console.error(
    "Usage: node scripts/tauri/run-with-features.cjs <dev|build|...> [extra tauri args...]"
  );
  process.exit(1);
}

const rawExtraArgs = process.argv.slice(3);
const featureString = tauriFeatureString();
const extraArgs = rawExtraArgs;
const args = [subcommand];
if (featureString.length > 0) {
  args.push("--features", featureString);
}
if (subcommand === "dev") {
  args.push(
    "--config",
    path.join(__dirname, "../../src-tauri/tauri.dev.conf.json")
  );
}
args.push(...extraArgs);

const rootDir = path.join(__dirname, "..", "..");

function findOptionValue(argv, flag) {
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === flag && argv[i + 1]) {
      return argv[i + 1];
    }
    if (typeof token === "string" && token.startsWith(`${flag}=`)) {
      const value = token.slice(flag.length + 1);
      if (value) return value;
    }
  }
  return null;
}

// `externalBin` requires the staged org2-pm sidecar to exist before the
// tauri CLI starts (dev copies it next to the debug binary; build bundles
// and signs it).
if (subcommand === "dev" || subcommand === "build") {
  const explicitTarget = findOptionValue(extraArgs, "--target");
  const explicitProfile = findOptionValue(extraArgs, "--profile");
  const sidecarProfile =
    explicitProfile ?? (subcommand === "build" ? "release" : "debug");
  const sidecarArgs = [
    path.join(__dirname, "prepare-sidecars.cjs"),
    "--profile",
    sidecarProfile,
  ];
  if (explicitTarget) {
    sidecarArgs.push("--target", explicitTarget);
  }
  const sidecarResult = spawnSync(process.execPath, sidecarArgs, {
    stdio: "inherit",
    cwd: rootDir,
  });
  if (sidecarResult.status !== 0) {
    process.exit(sidecarResult.status ?? 1);
  }
}

const result = spawnSync("tauri", args, {
  stdio: "inherit",
  shell: true,
  cwd: rootDir,
  env: applyDefaultDiagnosticsEndpoint(
    subcommand === "dev" ? applyDevInstanceEnv(process.env) : { ...process.env }
  ),
});

process.exit(result.status ?? 1);
