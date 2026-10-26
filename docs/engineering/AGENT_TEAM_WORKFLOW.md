# Mandatory Agent Team Workflow

This is the delivery contract for **every user-requested task** in this repository:
features, fixes, documentation, refactors, tests, urgent work, and follow-ups.
Read it before making changes. `AGENTS.md` routes all coding agents here.
The repository's safety, permission, and [PR rules](../../.github/PR_RULES.md)
remain binding. This workflow never authorizes commits, pushes, merges or releases.

## 1. Create a checklist planner before implementation

- Create or update `docs/engineering/plans/YYYY-MM-DD-<task>.md` using
  [the task template](TASK_CHECKLIST_TEMPLATE.md), before editing the solution.
- Record the request, scope, acceptance criteria, risk, dependencies,
  platform/test environment, and explicit out-of-scope items.
- Break work into **small, verifiable subtasks** with stable IDs and checkpoints.
  Each subtask needs a named execution agent, designated Team Lead and reviewer.
- Record status explicitly: `TODO`, `IN_PROGRESS`, `BLOCKED`, `FAIL`,
  `READY_FOR_LEAD_REVIEW`, or `DONE`. Do not infer DONE from code being written.
- Update the plan after each subtask and after scope, dependency or risk changes.

## 2. Team Lead owns assignment and integration

- The **Team Lead** is accountable for planning, ownership, cross-task contracts,
  task boundaries, integration order, quality gates and the final handoff.
- Assign every atomic task to an **Implementation Agent**; assign a QA/Test Agent
  and separate Reviewer Agent where available. Tasks may run in parallel only
  when files, branches, state and acceptance boundaries do not conflict.
- Use isolated branches/worktrees where parallel writes might collide.
  Do not override another agent's changes or discard work without approval.
- Every agent reports the changed files, precise commands/results, remaining
  concerns and evidence links to the Team Lead.
- If actual agent delegation is not available, the operator may execute tasks
  sequentially under named roles, but MUST label delegation and independent
  review as **not performed**. Never claim fictitious agent activity.

## 3. Mandatory verification for EVERY subtask

The executing agent MUST produce a verification record for EACH subtask:

1. **Targeted checks:** matching unit/integration tests, formatting, lint,
   typecheck/build or other risk-specific source-boundary verification.
2. **Smoke test:** verify the changed component's minimal operational path.
   For app changes, exercise launch/load and the affected primary action;
   for documentation/policy, check file access, internal links and examples.
3. **End-to-end (E2E) test:** execute the user-visible workflow from its real
   entry point through the expected result. Test errors and recovery when
   applicable. For docs-only/process-only changes, walk through a complete
   representative process using the written checklist, and record the result.
   A document walkthrough does **not** certify native GUI/hardware E2E.
4. **Evidence:** record test type, exact command or manual steps, environment,
   real outcome (`PASS`, `FAIL`, `BLOCKED`), and log/artifact reference.

A test that cannot run (missing OS, hardware, credentials, runner, live provider
or tooling) is `BLOCKED`, never `PASS`. Do not silently skip E2E or smoke.
Provide the reason and the exact required follow-up; work with unmet mandatory
acceptance checks cannot be reported as DONE or release-ready.
Do not bypass sandboxing, approvals, data protection, or cost controls to test.

## 4. Lead review of every subtask (mandatory)

The Team Lead checks the complete diff, acceptance criteria, targeted checks,
smoke/E2E evidence, regression risk, security, performance, compatibility,
data migration and rollback as applicable. Reject missing or unverifiable claims.
Record one of:

- `ACCEPTED`: all applicable checks passed with evidence; no blocking gaps.
- `REWORK`: changes/test failures must be corrected and retested.
- `BLOCKED`: mandatory verification or approval cannot yet be performed.

**Only an ACCEPTED lead review can mark a subtask DONE.** A Team Lead review
does not substitute for independent/human reviewer authorization, CI or
platform-specific release acceptance. Where an independent reviewer is required
but unavailable, record that as an outstanding gate.

## 5. Release and handoff

- The Team Lead integrates only accepted subtasks and reruns affected smoke,
  E2E, security and regression checks on the integration HEAD.
- Before claiming completion, inspect the entire checklist, CI, docs and
  platform coverage. List the precise release blockers instead of a guessed %.
- Delivery must include planner location, scope, agent owners, Lead verdicts,
  changed files, exact verification outcomes and remaining blockers.
- Never conflate **implemented**, **tested**, **built**, **installed** and
  **release-ready**. Respect existing [roadmap definitions](../fork/ROADMAP.md).
- Existing [PR review and authorization boundaries](../../.github/PR_RULES.md)
  remain in force. No handoff bypasses signing, live-provider, migration or
  independent reviewer gates.

## 6. Completion rule

No subtask is DONE unless its targeted checks, smoke, E2E and Team Lead review
are explicitly recorded PASS/ACCEPTED. No project release is READY while a
required integration or independent approval gate is FAIL/BLOCKED.
