# Goals — auto-board pipeline

What we're building, why, and how we'll know it works.

## The vision

> **A software company that operates with one human and a fleet of agents.** Multica is the kanban; agents are the teammates; humans only intervene at quality gates.

A User Story enters the Backlog. It flows autonomously through 16 phases — Product Planning, Design, Test Planning, Refinement, Development, Code Review, Test — emerging at Homologation as a PR ready to merge into `main`. The human reviews and clicks merge.

## The problem we're solving

Traditional software teams are single-threaded:
- One engineer, one task, one context switch at a time
- Communication overhead grows quadratically with team size
- A small team feels small

AI coding agents change the equation, but using them today is awkward:
- Copy-paste prompt loops
- No persistent context across tasks
- No visible board where humans and agents share work
- Each agent runs in its own silo

**Multica fixes the substrate** — agents are first-class teammates with profiles, assignees, comments, mentions, skills. **Auto-board fills in the process** — a 16-phase SDLC with one specialized agent per role, choreographed via assignments and `@mention` handoffs, with humans gated only where it matters.

## What success looks like

### MVP (`duozada`, the first product)

- One US flows from `phase=backlog` → `phase=homologation` end-to-end
- Each phase produces its canonical artifact:
  - Backlog → US text
  - Product Planning → Acceptance Criteria
  - Design Doing → wireframe sketch (markdown)
  - Test Planning → Gherkin BDD scenarios
  - Refinement → consolidated comment with verdict
  - Dev → child tasks with PRs into `us-N`
  - Code Review → APPROVE comment per child
  - Test → Playwright spec + smoke screenshots
  - Homologation → human merges `us-N` → `main`
- Human only acts at Homologation
- Pipeline is repeatable for a second, third, …, Nth US

### v1 (after MVP stable)

- 5+ USs in flight simultaneously without collisions
- Homologation gate confidence > 90% (i.e., human's "merge" is a yes 9/10 times)
- Agents recover from common failures (test flakiness, dependency conflicts, lint errors) without human intervention
- New product (forked from `duo-admin` template) provisioned in <30 min via `provision-product-workspace.sh` + `bootstrap-product`

### v2 (longer-term)

- Multiple products on the same Multica server, one workspace each
- Cross-product skills shared via `auto-board-skills` repo
- A second human joins the org → invited to specific workspaces, takes over Homologation for their products
- Autopilot rules trigger weekly autonomous work (dependency audits, security scans, refactors)

## What's intentionally NOT in scope

- ❌ Replacing the human entirely — Homologation is permanent
- ❌ Self-modification of agent skills/instructions by other agents
- ❌ Cross-workspace agents (one workspace = one product)
- ❌ Multi-cloud / multi-region deployment
- ❌ Custom Multica fork — we live with v0.2.x's quirks and document workarounds
- ❌ A new IDE — agents use whatever they're configured with (Claude Code default)

## Why now

1. **Multica reached usable state** (v0.2.26 has the primitives we need: agents-as-teammates, skills-as-context, per-task isolated workdirs)
2. **Claude Code is mature** — session resumption works, MCP support is real, skills get injected reliably
3. **The `duo-admin` template is opinionated and tested** — gives agents a strong stack baseline (Next.js + RSC + Drizzle + oRPC + better-auth + Tailwind + Vitest + Playwright). Agents inherit `.claude/skills/{api,db,frontend}-recipe/` and `.claude/rules/*` automatically.
4. **`duozada` is a real product** — gamer marketplace, Renato's old idea, big enough to stress the pipeline but small enough to be the MVP

## How we measure progress

| Metric | MVP target | Source |
|---|---|---|
| Time from US assignment → Homologation | <24h | Multica activity log |
| Human interventions per US (excluding Homologation) | 0 | Comment/reassignment audit |
| % of US that pass Homologation on first try | >50% | Manual count |
| Phase failure rate (any phase looping >1 time) | <20% | Activity log |
| Multica daemon uptime | >99% | `multica daemon status` |
| Agent task success rate | >80% | `multica agent tasks` |

## Why this could fail

Honest risks:

1. **Multica CLI gaps slow us down** — labels, depends-on, chat, comment commands may all be UI-only. Workarounds (description markers, JSON polling) are brittle.
2. **Agent context window pressure** — long issues with many comments plus repo context can blow context. Mitigation: skills compress conventions.
3. **Multi-agent refinement is fragile** — `@mention` deduplication isn't guaranteed; reassign cancels active tasks.
4. **WSL daemon is single point of failure** — if the WSL host crashes, everything stops. Mitigation: daemon auto-restart, eventually a second WSL/Linux box for redundancy.
5. **Stack drift in `duo-admin`** — if the template evolves, skills referencing recipe paths may break. Mitigation: template has its own CLAUDE.md with rules; auto-board-skills only orchestrates.

## Decisions log

| Date | Decision | Rationale | Doc |
|---|---|---|---|
| 2026-05-07 | 16 phases collapsed onto 7 Multica statuses + label `phase:*` (later: description marker) | Multica status enum is fixed at 7; we need 16 columns | `03-multica-handoff/SKILL.md` |
| 2026-05-07 | 9 agents (split pm-grooming + pm-refiner from initial 8) | Refinement is a distinct discipline from grooming | `agents/pm-refiner.md` |
| 2026-05-07 | One workspace per product (not single workspace + projects) | Workspace Context becomes 1st-class product context | `TOPOLOGY.md` |
| 2026-05-07 | `Product/` folder in repo as source of truth for product context | Versioned, evolves with code | `01-read-product-context/SKILL.md` |
| 2026-05-07 | WSL Ubuntu (desktop-76n2ggj) as execution surface; Mac is access only | Unix-native, Postgres+Docker stable, always-on | `TOPOLOGY.md` |
| 2026-05-07 | Skill upload via `skill create` + `files upsert` (not `skill import --url`) | Server rejects github.com URLs at the import endpoint | `PROVISION.md` "Known CLI gaps" |
| 2026-05-07 | Phase tracked via `<!-- multica-board-state: phase=X domain=Y -->` first line of description | CLI v0.2.26 has no label-on-issue assignment | `03-multica-handoff/SKILL.md` |

When new architectural decisions are made, append to this table.
