# Coding Brief - Kylo Note
## Objective
Build a local-only, agentic operating layer for Obsidian that clones the "Kilo Code" experience: safe, governed vault operations, multi-provider support, and MCP extensibility.

## Users & Key Scenarios
- **Knowledge Worker:** Uses "Writer" mode to draft/edit notes and "Researcher" (MCP) mode to find web connections.
- **Power User:** Uses "Architect" mode to restructure folders and generate Canvas maps.
- **Scenario 1:** User connects `brave-search` MCP server and asks agent to research a topic, then write a note.
- **Scenario 2:** User asks agent to refactor a messy meeting note; agent proposes changes; user approves; git commit created.

## Scope (In/Out)
**In:**
- Sidebar Chat & Modes
- **MCP Client Support**
- **Multi-Provider & Context Management**
- File/Folder CRUD & Content Editing
- Approval System (Strict Default)
- Local Checkpoints (`isomorphic-git`)
- Canvas Generation (`.canvas` JSON)
- Semantic Index (Local Vector DB)
- Operation Logging

**Out (V1):**
- Internal Obsidian Graph manipulation
- Bases (Database) automation
- Mobile support
- Cloud sync/backend

## Feature list (P0/P1/P2) with links
- [P0] Core Agent Interaction (`requirements/features/FEATURE-core-interaction.md`)
- [P0] Context Management (`requirements/features/FEATURE-context-management.md`)
- [P0] Approval System (`requirements/features/FEATURE-approval-safety.md`)
- [P0] Local Checkpoints (`requirements/features/FEATURE-checkpoints.md`)
- [P0] Vault Operations (`requirements/features/FEATURE-vault-ops.md`)
- [P0] Content Editing (`requirements/features/FEATURE-content-editing.md`)
- [P1] MCP Support (`requirements/features/FEATURE-mcp-support.md`)
- [P1] Provider Management (`requirements/features/FEATURE-provider-management.md`)
- [P0] Canvas Projection (`requirements/features/FEATURE-canvas-projection.md`)
- [P1] Semantic Index (`requirements/features/FEATURE-semantic-index.md`)
- [P1] Workflows (`requirements/features/FEATURE-workflows.md`)

## Acceptance criteria (top-level)
- [ ] **Safety:** Any write operation (Internal or MCP) must trigger an approval prompt UNLESS explicitly auto-approved.
- [ ] **Restore:** Every approved write must create a git commit in `.kilonote/checkpoints`.
- [ ] **Context:** Agent automatically sees the content of the active file.
- [ ] **Performance:** UI remains responsive during indexing/tool execution.

## Success criteria (aggregated)
- SC-01: 100% of write operations are approved by user.
- SC-02: Restore function works reliably for all file types.
- SC-03: Agent can successfully use external tools via MCP.

## NFRs (quantified)
- **Startup:** Plugin loads in < 1s.
- **Indexing:** Background indexing uses < 20% CPU.
- **Latency:** Tool execution overhead < 200ms.

## ASRs (critical first)
🔴 **ASR-01: Isomorphic-Git Integration** (JS implementation for checkpoints).
🔴 **ASR-02: Tool-Use Interception Layer** (Central handler for approval/logging).
🟡 **ASR-mcp-01: MCP Client Integration** (Bridge to MCP servers).
🟡 **ASR-03: Local Vector Store Abstraction** (Pluggable local embedding DB).

## Constraints / Assumptions
- Must run within Obsidian's Electron environment (Node access available).
- User provides their own API key/Local LLM URL.
- MCP servers must be compatible with local execution (stdio/SSE).

## Dependencies / Integrations
- Obsidian Plugin API.
- `isomorphic-git`.
- `@modelcontextprotocol/sdk`.
- Local Vector DB (e.g., Orama/Voy).

## Risks / Open Questions
- **MCP in Electron:** Confirm `stdio` transport viability in Obsidian's renderer process.
- **Performance:** Indexing large vaults locally.

## Ready-for-Architecture checklist
- [x] BA aligned (Scope C - MVP Code Clone)
- [x] Features have ACs
- [x] NFRs quantified
- [x] ASRs explicit
