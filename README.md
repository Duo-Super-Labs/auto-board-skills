# auto-board-skills

Orchestration skills for the **auto-board** pipeline — agents simulating the operation of a software company on top of [Multica](https://github.com/multica-ai/multica) self-hosted.

## What's here

These skills are **process / orchestration** only. Stack expertise (how to write code in this stack) lives **inside each product repo** under `.claude/skills/` and `.claude/rules/`. This separation is intentional:

- **Product repo** (e.g. `duozada`) — `.claude/skills/{api-recipe,db-recipe,frontend-recipe,...}` — HOW to write code
- **This repo** (`auto-board-skills`) — WHAT to do per board phase

Multica mounts skills from this repo at the workspace level. The daemon merges them into the workdir alongside the repo's own `.claude/` skills, so an agent has both at runtime.

## Skill index

| # | Skill | Who uses it |
|---|---|---|
| 01 | `read-product-context` | All 9 agents (foundation) |
| 02 | `branch-conventions` | All 9 agents |
| 03 | `multica-handoff` | All 9 agents (end of every task) |
| 04 | `bootstrap-product` | `pm-grooming` (one-shot via chat) |
| 05 | `grill-us` | `pm-grooming` |
| 06 | `product-planning` | `pm-grooming` |
| 07 | `refine-us` | `pm-refiner` |
| 08 | `design-sketch` | `designer` |
| 09 | `bdd-writer` | `qa-planner` |
| 10 | `break-us` | `task-breaker` |
| 11 | `tdd-fe` | `fe-dev` |
| 12 | `tdd-be` | `be-dev` |
| 13 | `code-review` | `code-reviewer` |
| 14 | `e2e-write` | `qa-tester` |
| 14b | `playwright-smoke` | `qa-tester` |

## Importing into Multica

```bash
# Per-skill import
multica skill import \
  --url https://github.com/Duo-Super-Labs/auto-board-skills/tree/main/01-read-product-context

# Or use the provision script (loops all 14)
./scripts/provision-product-workspace.sh <product-slug> <repo-url>
```

## The 9 agents

Instructions for each agent live in `agents/*.md`. Paste these into Multica → Settings → Agents → New (or import via the provision script).

| Agent | Phases owned | Model |
|---|---|---|
| `pm-grooming` | Backlog, Product Planning | Opus |
| `pm-refiner` | Refinement (orchestrator) | Opus |
| `designer` | RtDesign, Design Doing | Sonnet |
| `qa-planner` | RtTestPlan, Test Planning | Sonnet |
| `task-breaker` | RtDev (split + branch hierarchy) | Opus |
| `fe-dev` | Dev (marker `domain=fe`) | Sonnet |
| `be-dev` | Dev (marker `domain=be`) | Sonnet |
| `code-reviewer` | RtCodeReview, Code Review | Opus |
| `qa-tester` | RtTest, Test | Sonnet |

Human is assignee at `phase=homologation`.

## Phase-to-status mapping (Decision A)

The Multica status enum is fixed (`backlog | todo | in_progress | in_review | done | blocked | cancelled`), so the 16 board phases collapse onto 5 statuses + a label `phase=*` for fine-grained position.

| Status | Phases |
|---|---|
| `backlog` | `phase=backlog`, `phase=product-planning` |
| `todo` | `phase=rt-design`, `phase=rt-test-plan`, `phase=rt-refinement`, `phase=rt-dev` |
| `in_progress` | `phase=design-doing`, `phase=test-planning`, `phase=refinement`, `phase=dev` |
| `in_review` | `phase=rt-code-review`, `phase=code-review`, `phase=rt-test`, `phase=test` |
| `done` | `phase=homologation`, `phase=done` |

See `03-multica-handoff/SKILL.md` for the routing table.
