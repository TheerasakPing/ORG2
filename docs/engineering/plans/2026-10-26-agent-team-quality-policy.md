# Checklist Planner — Mandatory Agent Team Workflow

**Date:** 2026-10-26
**Base:** `develop` at `5199a63c0`
**Branch:** `docs/agent-team-quality-policy-20261026`
**Team Lead:** ChatGPT acting as coordinator and author in the originating session
**Execution agents:** Distinct autonomous agents were not available; the
operator performed assigned tasks sequentially, not as multiple agents.
**Independent reviewer:** Not assigned; separate human review remains outstanding.
**Goal:** Establish mandatory planner, agent assignment, smoke/E2E and Team Lead
review rules for future ORG2 requests without altering production code.
**Authorization:** User authorized commit and push only; do not open or merge PR.

## Task assignments and checklist

| ID | Subtask | Assigned execution role | Reviewer role | Status |
| --- | --- | --- | --- | --- |
| T1 | Root AGENTS rule and reference | Policy editor (operator) | Team Lead | DONE |
| T2 | Detailed workflow and template | Docs author (operator) | Team Lead | DONE |
| T3 | PR rules and PR template checks | PR policy editor (operator) | Team Lead | DONE |
| T4 | Link, smoke and E2E walkthrough checks | QA role (operator) | Team Lead | DONE |

## Shared acceptance gates (T1–T4)

- [x] Scope, ownership, dependencies and acceptance criteria recorded
- [x] Work isolated from the original feature branch
- [x] Targeted verification recorded with real commands/results
- [x] Smoke check recorded with real commands/results
- [x] E2E/document-process walkthrough recorded with evidence
- [x] Team Lead diff and risk review recorded
- [x] Team Lead ACCEPTED for local documentation scope

## Verification evidence

**Targeted check:** PASS in originating local worktree — `git diff --check`,
repository Prettier `--check` across six Markdown documents after formatting,
and Python assertions for policy requirements and task template.
**Smoke check:** PASS in originating local worktree — six files read
successfully, all changed Markdown links resolved to existing targets.
**Document E2E walkthrough:** PASS — simulated a representative task from
planner to owner, targeted checks, smoke/E2E, Team Lead review and handoff.
Missing E2E yielded BLOCKED, Team Lead REWORK yielded BLOCKED, and complete
passing evidence with Team Lead ACCEPTED yielded DONE.
**Team Lead review:** ACCEPTED for documentation-only scope, after inspecting
policy diffs, test output, links and scope. No production code was modified.
**Independent agent/human review:** BLOCKED — not available.
**App GUI E2E:** NOT APPLICABLE to this documentation-only change. This does
not certify any outstanding native GUI/hardware release requirements.
**Release state:** NOT READY; this documentation policy does not change it.

## Handoff

**Changed files:** `AGENTS.md`, `.github/PR_RULES.md`,
`.github/PULL_REQUEST_TEMPLATE.md`, and the three documents in
`docs/engineering/`.
**GitHub status:** Commit and branch reference must be verified after push.
**Remaining gates:** Independent/human review and any future PR/merge approval.
