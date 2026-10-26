# Task Checklist Planner — <task name>

**Date:** YYYY-MM-DD
**Target branch / worktree:** <branch / path>
**Request and expected user outcome:** <clear acceptance goal>
**Team Lead:** <actual responsible person or operator>
**Available implementation agents:** <actual agents or "none — sequential role-based">
**QA Agent / independent reviewer:** <actual identity or "unavailable">
**Environment / constraints:** <OS, hardware, provider, permissions>
**Scope exclusions / safety restrictions:** <what must not be touched>

## Plan and delegation

- [ ] Confirm scope, impacted files and acceptance criteria
- [ ] Define atomic tasks, dependencies, risks and rollback strategy
- [ ] Assign an execution owner and reviewer to **each** task
- [ ] Identify and isolate tasks safe for parallel execution
- [ ] Identify the smoke and E2E entry points for **each** task
- [ ] Update this checklist when scope or test constraints change

| ID | Subtask / expected result | Execution agent | Reviewer | Dependency | Status |
| --- | --- | --- | --- | --- | --- |
| T1 | <atomic task> | <agent or operator> | <reviewer> | none | TODO |
| T2 | <atomic task> | <agent or operator> | <reviewer> | T1 | TODO |

## Per-subtask acceptance record (copy for each task)

### T1 — <subtask>

- [ ] Implementation and source-boundary regression coverage completed
- [ ] Targeted/static/unit/integration checks recorded
- [ ] Smoke test executed and outcome recorded
- [ ] End-to-end test/workflow executed and outcome recorded
- [ ] Failure/recovery, security, data safety and rollback considered
- [ ] Team Lead inspected exact changes and verification evidence
- [ ] Team Lead decision recorded: ACCEPTED / REWORK / BLOCKED
- [ ] Mark DONE **only** when every mandatory gate has PASS and lead ACCEPTED

**Execution agent:** <actual person/agent or operator>
**Changed files:** <paths>
**Targeted checks:** <command/steps, environment, PASS/FAIL/BLOCKED, logs>
**Smoke test:** <entrypoint/command, result, evidence>
**E2E test:** <entrypoint/steps, result, evidence and limitations>
**Team Lead reviewer:** <identity>
**Review decision / findings:** <ACCEPTED, REWORK or BLOCKED; findings>
**Remaining blockers / follow-up:** <none or exact next action>

## Integration and final lead sign-off

- [ ] All subtasks are ACCEPTED and marked DONE
- [ ] Final integration diff reviewed for scope and secrets
- [ ] Integration smoke test passed on the final candidate
- [ ] Integration E2E passed on the final candidate
- [ ] Required CI, security and platform checks passed
- [ ] Independent/human review completed where required
- [ ] README, docs and release implications verified

**Final Team Lead decision:** ACCEPTED / REWORK / BLOCKED
**Final verification commands / artifacts:** <real evidence only>
**Unrun tests and reasons:** <explicit BLOCKED list>
**Handoff / next action:** <status and accountable owner>
