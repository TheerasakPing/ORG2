# Implementation Plan: P2 Runtime Dashboard, Permission Governance & Team Orchestration

- [ ] **Phase 1: Unified Runtime Dashboard & Telemetry Model**
  - [ ] Implement `src/features/RuntimeDashboard/types.ts`: Telemetry, cost pricing tables, latency metrics, and system status models.
  - [ ] Implement `src/features/RuntimeDashboard/runtimeTelemetryModel.ts`: Functional aggregators for tokens, estimated cost, tool latencies, retry reasons, and memory queue status.
  - [ ] Add comprehensive tests in `src/features/RuntimeDashboard/__tests__/runtimeTelemetryModel.test.ts`.
  - [ ] Build UI component `src/features/RuntimeDashboard/RuntimeDashboardPanel.tsx` with tabs/cards for Tokens, Costs, Tool Latencies, and Resiliency.

- [ ] **Phase 2: Permission Governance & Audit Receipts**
  - [ ] Implement `src/features/PermissionGovernance/types.ts`: Risk levels, action types, preview payload, and audit receipt interface.
  - [ ] Implement `src/features/PermissionGovernance/permissionRiskEvaluator.ts`: Static command & parameter inspection, path boundaries, destructive pattern detection (`rm -rf`, `sudo`, destructive git), and SHA-256 parameter fingerprinting.
  - [ ] Implement `src/features/PermissionGovernance/auditReceiptStore.ts`: Local memory & session persistence for audit receipts.
  - [ ] Add unit tests in `src/features/PermissionGovernance/__tests__/permissionRiskEvaluator.test.ts`.
  - [ ] Build UI component `src/features/PermissionGovernance/PermissionPreviewModal.tsx`: Visual diff/risk warning modal before execution.

- [ ] **Phase 3: Agent-Team Orchestration & Budget Governor**
  - [ ] Implement `src/features/AgentTeamOrchestration/types.ts`: Team roles, budget constraints, checkpoint states, and handoff protocols.
  - [ ] Implement `src/features/AgentTeamOrchestration/budgetGovernor.ts`: Budget threshold tracking (90% warning, 100% hard block), per-turn limits, and role capability gates.
  - [ ] Add unit tests in `src/features/AgentTeamOrchestration/__tests__/budgetGovernor.test.ts`.
  - [ ] Build UI component `src/features/AgentTeamOrchestration/AgentTeamManager.tsx`: Interactive role assignment and budget status card.

- [ ] **Phase 4: Integration, Verification & Documentation**
  - [ ] Integrate launchers/indicators into ChatPanel / Header chrome.
  - [ ] Run complete Vitest suite across all new modules and regression suites.
  - [ ] Run Oxlint and TypeScript checks.
  - [ ] Update `FORK.md` and `ROADMAP.md`.
