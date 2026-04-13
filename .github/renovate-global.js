// Renovate global (self-hosted) configuration.
//
// This file is the admin-level config passed via `configurationFile` in the
// GitHub Actions workflow. Self-hosted-only options like `allowedCommands`
// MUST live here — they are silently ignored if placed in renovate.json.
//
// Per-repo config (package rules, grouping, schedules) stays in renovate.json.

module.exports = {
  platform: "github",
  repositories: ["procella-dev/procella"],

  // The repo already has renovate.json — skip onboarding PR
  onboarding: false,
  requireConfig: "optional",

  // Whitelist commands that postUpgradeTasks may run.
  // Each entry is a regex matched against the resolved command string.
  // Keep this list minimal — every entry is arbitrary code execution.
  allowedCommands: [
    "^bun install --frozen-lockfile$",
    "^bun run types:generate$",
  ],

  // Tools (bun, go) are installed by the workflow steps before Renovate runs.
  // "global" tells Renovate to use whatever is already on PATH.
  binarySource: "global",

  // Sign commits via GitHub's API so they appear as "verified".
  // Requires the token to come from a GitHub App (not a PAT).
  platformCommit: true,
};
