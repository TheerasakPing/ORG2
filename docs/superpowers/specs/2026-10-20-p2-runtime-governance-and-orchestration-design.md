# P2 Unified Runtime Dashboard, Permission Governance & Agent-Team Orchestration Specification

## 1. Overview & Objective

Building upon the core stability fixes and chat UI enhancements in PR #23 and PR #24, this specification delivers the three core capabilities of the P2 Unified Agent Experience roadmap:

1. **Unified Runtime Dashboard (`RuntimeDashboard`)**:
   Real-time observability into token consumption, cost breakdown, tool execution latency, retry causes, memory queue depth, process resource usage (CPU/RAM), and pending approval counters.
2. **Permissions Preview & Audit Receipts (`PermissionGovernance`)**:
   Risk assessment and interactive preview before high-impact tool executions (CLI shell commands, destructive file operations, MCP tool invocations, browser automation), along with immutable, tamper-evident audit receipts.
3. **Agent-Team Orchestration & Budget Controls (`AgentTeamOrchestration`)**:
   Role capability matrix (Architect, Implementer, Reviewer, QA, Research), turn/session token & cost budget governors, structured task handoffs, and human-in-the-loop approval checkpoints.

---

## 2. Architecture & Subsystems

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   TP Agent Studio UI                                    │
│                                                                                         │
│  ┌───────────────────────┐  ┌───────────────────────────────┐  ┌─────────────────────┐  │
│  │   Runtime Dashboard   │  │     Permission Governance     │  │ Team Orchestration  │  │
│  │  - Tokens & Cost ($)  │  │  - Impact Preview & Risk      │  │  - Role Matrix      │  │
│  │  - Tool Latency (ms)  │  │  - Destructive Op Guard       │  │  - Budget Governor  │  │
│  │  - Retry & Resiliency │  │  - Immutable Audit Receipts   │  │  - Approval Checkpt │  │
│  └───────────┬───────────┘  └───────────────┬───────────────┘  └──────────┬──────────┘  │
│              │                              │                             │             │
└──────────────┼──────────────────────────────┼─────────────────────────────┼─────────────┘
               ▼                              ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           Core Engine & Shared State Layer                              │
│                                                                                         │
│  • SessionCore EventStore & Transcript Projection                                       │
│  • DialogScheduler Workers & Auxiliary Usage Provider (Rust agent-core)                 │
│  • Tool Policy Engine & Execution Guard Rails                                           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Component Specifications

### 3.1 Unified Runtime Dashboard (`src/features/RuntimeDashboard`)

#### Key Telemetry Metrics:

- **Tokens**: Input tokens, Output tokens, Cached tokens, Context Window utilization (%).
- **Costs**: Estimated session cost calculated per provider/model pricing tier (e.g. GPT-6.1, Claude 3.5/Opus, Gemini 2.5/3.8).
- **Tool Latency**: Per-tool execution duration histogram (min, avg, p95, max in milliseconds).
- **Resilience / Retry Reasons**: Provider stream disconnects, rate limits, schema validation failures, tool retry attempts.
- **System Footprint**: Session memory queue backlog, estimated worker CPU% and RSS memory.
- **Pending Approvals**: Badge indicator for commands awaiting human sign-off.

### 3.2 Permission Governance & Audit Receipts (`src/features/PermissionGovernance`)

#### Risk Assessment Matrix:

- **Low Risk**: Read-only queries, file reads, grep, directory listings.
- **Medium Risk**: Package installs, build commands, file creation in untracked workspace paths.
- **High Risk**: File modifications, git resets, network downloads, modifying project configs.
- **Critical Risk**: Shell execution with `sudo`, deleting directories (`rm -rf`), modifying system roots, sensitive env var access.

#### Audit Receipt Schema:

```typescript
export interface AuditReceipt {
  receiptId: string; // uuid v4
  timestamp: string; // ISO 8601
  sessionId: string;
  turnId?: string;
  actionType:
    | "shell_exec"
    | "file_write"
    | "file_delete"
    | "mcp_call"
    | "browser_action";
  target: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  status: "approved" | "rejected" | "auto_approved" | "timeout";
  approver: "user" | "policy_rule";
  parametersHash: string; // SHA-256 digest of execution arguments
}
```

### 3.3 Agent-Team Orchestration (`src/features/AgentTeamOrchestration`)

#### Role Capabilities:

1. **Architect**: Plan creation, spec design, dependency analysis (Read-only + Plan tools).
2. **Implementer**: Code modifications, command execution, local build verification (Full workspace write).
3. **Reviewer**: Diff review, policy compliance check, code quality analysis (Read + Review tools).
4. **QA / Tester**: Test execution, regression check, coverage verification (Test execution only).
5. **Research / Specialist**: Documentation reading, web exploration, context gathering.

#### Budget Governor:

- Per-turn token ceiling (default: 50,000 tokens)
- Per-session cost ceiling (default: $5.00 USD, configurable)
- Auto-pause when budget reaches 90% threshold, prompting user confirmation to continue.

---

## 4. Verification & Testing Strategy

1. **Unit Testing**:
   - `runtimeTelemetryModel.test.ts`: 100% logic coverage of token accumulation, cost estimation, and latency math.
   - `permissionRiskEvaluator.test.ts`: Validation of risk rating for commands, path sanitization, and audit hashing.
   - `budgetGovernor.test.ts`: Budget limit breaches, warning thresholds, and role capability matching.
2. **Typecheck & Linter**: Oxlint and `tsc --noEmit` validation.
3. **Fork Safety & Consistency**: Ensure zero regression across existing 88 tests and safety gates.
