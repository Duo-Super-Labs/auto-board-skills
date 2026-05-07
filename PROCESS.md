# Process — end-to-end lifecycle of a User Story

How a single US travels from idea to merged code. **Read this top-to-bottom once;** then refer to each phase's `SKILL.md` for the operational detail.

## The pipeline at a glance

```
phase=backlog
   ↓                                     pm-grooming runs grill-us
phase=product-planning
   ↓                                     pm-grooming runs product-planning
phase=rt-design
   ↓                                     designer pulls
phase=design-doing
   ↓                                     designer runs design-sketch
phase=rt-test-plan
   ↓                                     qa-planner pulls
phase=test-planning
   ↓                                     qa-planner runs bdd-writer
phase=rt-refinement
   ↓                                     pm-refiner pulls
phase=refinement
   ↓                                     pm-refiner runs refine-us (multi-@)
phase=rt-dev
   ↓                                     task-breaker pulls
   ↓                                     break-us creates child issues +
   ↓                                       branch us-N + child branches
parent → phase=dev      children → phase=rt-dev
                              ↓        fe-dev / be-dev pull (by domain label)
                      children → phase=dev
                              ↓        TDD red-green-refactor; PRs against us-N
                      children → phase=rt-code-review
                              ↓        code-reviewer pulls
                      children → phase=code-review
                              ↓        APPROVE → original dev merges
                      children → phase=done
                              ↓
                              ↓        last child merged → parent moves
parent → phase=rt-test
   ↓                                     qa-tester pulls
phase=test
   ↓                                     qa-tester runs e2e-write + smoke
phase=homologation
   ↓                                     HUMAN merges us-N → main
phase=done
```

## Status mapping (Multica's 7 fixed statuses ↔ our 16 phases)

| Multica status | Phase markers inside |
|---|---|
| `backlog` | `phase=backlog`, `phase=product-planning` |
| `todo` | `phase=rt-design`, `phase=rt-test-plan`, `phase=rt-refinement`, `phase=rt-dev` |
| `in_progress` | `phase=design-doing`, `phase=test-planning`, `phase=refinement`, `phase=dev` |
| `in_review` | `phase=rt-code-review`, `phase=code-review`, `phase=rt-test`, `phase=test` |
| `done` | `phase=homologation`, `phase=done` |

Phase is encoded in the first line of the issue description as an HTML comment (Multica CLI v0.2.26 has no label-on-issue command):

```html
<!-- multica-board-state: phase=<phase> domain=<fe|be|qa-e2e|none> -->
```

Every agent reads this before acting. The `multica-handoff` skill (universal, mounted on all 9 agents) atomically rewrites the marker, updates Multica status, and reassigns at end of each phase.

## The 9 agents

| # | Agent | Phases owned | Model | Skills |
|---|---|---|---|---|
| 1 | `pm-grooming` | Backlog, Product Planning | Opus | grill-us, product-planning, bootstrap-product |
| 2 | `pm-refiner` | Refinement | Opus | refine-us |
| 3 | `designer` | RtDesign, Design Doing | Sonnet | design-sketch |
| 4 | `qa-planner` | RtTestPlan, Test Planning | Sonnet | bdd-writer |
| 5 | `task-breaker` | RtDev | Opus | break-us |
| 6 | `fe-dev` | Dev (label `domain=fe`) | Sonnet | tdd-fe |
| 7 | `be-dev` | Dev (label `domain=be`) | Sonnet | tdd-be |
| 8 | `code-reviewer` | RtCodeReview, Code Review | Opus | code-review |
| 9 | `qa-tester` | RtTest, Test | Sonnet | e2e-write, playwright-smoke |

All 9 also have universal skills mounted: `read-product-context`, `branch-conventions`, `multica-handoff`.

Human is the assignee at `phase=homologation`.

## Phase-by-phase reference

For each phase: agent, what triggers it, inputs, outputs, exit criteria, hard rules. **The full operational detail lives in each phase's `SKILL.md`** — these summaries are for orientation.

---

### Phase 1 — Backlog

- **Agent:** `pm-grooming`
- **Skill:** `grill-us`
- **Trigger:** Issue created with `phase=backlog` marker, assigned to `pm-grooming`
- **Input:** A seed idea (issue title or first comment). Reads `Product/personas.md` + `Product/journeys.md`.
- **Output:** Issue title becomes `US-<N>: <feature>`. Description gains `## User Story`, `## Personas Involved`, `## Why now`, `## Out of scope`, `## Open questions`.
- **Exit:** Description complete → `phase=product-planning` (self-assigned).
- **Hard rule:** No AC yet. No code references. Grill the human one question per comment if seed is unclear.

### Phase 2 — Product Planning

- **Agent:** `pm-grooming`
- **Skill:** `product-planning`
- **Trigger:** `phase=product-planning`, self.
- **Input:** US text from previous phase + `Product/constraints.md`.
- **Output:** Description appends `## Acceptance Criteria` (numbered checklist `AC-1`, `AC-2`, …), `## Context`, `## Objective`, `## Edge cases (initial)`, `## Risks`.
- **Exit:** AC list complete → `phase=rt-design`, reassign to `designer`.
- **Hard rule:** AC must be testable, persona-aware, one assertion each. Multi-tenant + RBAC scenarios mandatory for data features.

### Phase 3 — Ready to Design (RtDesign)

- **Agent:** `designer`
- **Skill:** (waits)
- **Trigger:** `phase=rt-design`, assigned to `designer`. Multica auto-claims via daemon polling.
- **Output:** None — `designer` immediately enters Design Doing.

### Phase 4 — Design Doing

- **Agent:** `designer`
- **Skill:** `design-sketch`
- **Input:** AC + sketch references from `Duo-Super-Labs/ai-ui` design system (attached as Project Resource).
- **Output:** Comment titled `## Design — sketch v1` containing component inventory (from `@duolabs/ui`), ASCII desktop layout, ASCII mobile layout, states table (loading/empty/error/RBAC), token usage, URL state plan, open questions.
- **Exit:** Sketch posted → `phase=rt-test-plan`, reassign to `qa-planner`.
- **Hard rule:** No JSX. Map only to existing `@duolabs/ui` components. Mobile + desktop both. All data-fetching ACs need empty/loading/error states.

### Phase 5 — Ready to Test Plan (RtTestPlan)

- **Agent:** `qa-planner`
- **Trigger:** `phase=rt-test-plan`. Auto-claim.

### Phase 6 — Test Planning

- **Agent:** `qa-planner`
- **Skill:** `bdd-writer`
- **Input:** AC + design sketch comment.
- **Output:** Comment titled `## BDD — scenarios v1` with one `Feature:` block, a `Background:` block, one `Scenario:` per AC (1:1 mapping) + edge cases + RBAC + tenant isolation. Each scenario has a stable kebab-case name (becomes the Playwright `test()` name later).
- **Exit:** Scenarios posted → `phase=rt-refinement`, reassign to `pm-refiner`.
- **Hard rule:** No Playwright code yet (that's qa-tester downstream). Tenant isolation scenario mandatory for any data feature.

### Phase 7 — Ready to Refinement (RtRefinement)

- **Agent:** `pm-refiner`
- **Trigger:** `phase=rt-refinement`. Auto-claim.

### Phase 8 — Refinement

- **Agent:** `pm-refiner`
- **Skill:** `refine-us`
- **Input:** Everything: US, AC, sketch, BDD scenarios, refinement context.
- **Process:** ONE comment with `@designer @qa-planner @fe-dev @be-dev` — each `@` triggers a parallel task in that agent. They reply individually with blockers, edge cases, T-shirt estimates. `pm-refiner` waits for all 4 replies, consolidates.
- **Output:** Single consolidated comment with verdict ✅ ready or 🚧 send-back.
- **Exit:** Verdict ✅ → `phase=rt-dev`, reassign to `task-breaker`. Verdict 🚧 → reassign to whichever upstream agent needs revision (no handoff).
- **Hard rule:** ⚠ NEVER reassign while any @-mentioned agent has a `running` or `queued` task on the issue — Multica cancels ALL active tasks on reassign.

### Phase 9 — Ready to Dev (RtDev)

- **Agent:** `task-breaker`
- **Trigger:** `phase=rt-dev`. Auto-claim.
- **Skill:** `break-us`
- **Process:**
  1. Create branch `us-<N>` from `main`
  2. Decide split: typically 1 BE child + 1 FE child + 1 QA-E2E child (max 6 total)
  3. Create child Multica issues with `parent_id`, marker `domain=fe|be|qa-e2e`, assigned to matching agent (status `todo` for FE/BE, `blocked` for QA waiting siblings)
  4. Cross-link in parent comment with break-down table
  5. Update parent: `phase=dev`, status `in_progress`, stays assigned to `pm-refiner`
- **Exit:** Children dispatched. Parent moves to Dev (orchestration phase).

### Phase 10 — Dev (parent + children)

The parent stays at `phase=dev` while children run in parallel. Each child has its own micro-pipeline:

#### 10a — Dev (child, `domain=fe`)

- **Agent:** `fe-dev`
- **Skill:** `tdd-fe`
- **Input:** Parent's AC + BDD + sketch. Child's scope/branch/refs/DoD.
- **Process:**
  1. `git checkout us-<N> && git checkout -b fe-<N>-<child-id>-<slug>`
  2. **Red** — write failing Playwright spec (E2E behavior) or Vitest test (helpers only)
  3. **Green** — minimum implementation. Follow `frontend-recipe/` from the repo
  4. **Refactor** — keep green
  5. `pnpm typecheck && pnpm test && pnpm e2e -g <scenario>`
  6. Commit per phase, push, `gh pr create --base us-<N>`
- **Exit:** PR open → `phase=rt-code-review`, reassign to `code-reviewer`.

#### 10b — Dev (child, `domain=be`)

- **Agent:** `be-dev`
- **Skill:** `tdd-be`
- **Input:** Same as 10a.
- **Process:**
  1. `docker compose up -d` (Real Docker Postgres for tests)
  2. Branch as 10a but `be-` prefix
  3. **Red** — write failing tests at Layer 3 (query) AND Layer 5 (procedure)
  4. **Green** — implement layers 1→2→3→4→5 in order (schema → drizzle-zod → query → contract → procedure)
  5. Migration if schema changed; permissions matrix update if new resource
  6. `pnpm typecheck && pnpm --filter @duolabs/database test && pnpm --filter @duolabs/api test`
  7. PR `--base us-<N>`
- **Exit:** PR open → `phase=rt-code-review`, reassign to `code-reviewer`.

### Phase 11 — Ready to Code Review (RtCodeReview, child)

- **Agent:** `code-reviewer`
- **Trigger:** Child enters this phase. Auto-claim.

### Phase 12 — Code Review (child)

- **Agent:** `code-reviewer`
- **Skill:** `code-review`
- **Input:** PR diff (`gh pr view`, `gh pr diff`). Child's `domain=*` selects rule set: FE rules / BE rules / E2E rules.
- **Output:** Comment on Multica issue (NOT GitHub PR) with verdict APPROVE or CHANGES REQUESTED, classified findings (🚨 BLOCKER / ⚠ SUGGESTION / 💡 NIT).
- **On CHANGES REQUESTED:** Card stays at `phase=code-review`. `@<original-dev>` triggers fix task. Dev fixes in same branch, pushes, comments back. Reviewer re-reviews (Review v2).
- **On APPROVE:** Run `multica-handoff` → child reaches `phase=done`. Reassign back to original dev so they squash-merge into `us-<N>`.
- **Hard rule:** Never approve own code. Never push commits. Never merge PRs.

### Phase 13 — Ready to Test (parent, RtTest)

- **Triggered by:** `code-reviewer` after detecting all sibling children reached `phase=done`. Parent moves to `phase=rt-test`, reassign to `qa-tester`.

### Phase 14 — Test (parent)

- **Agent:** `qa-tester`
- **Skills:** `e2e-write` + `playwright-smoke`
- **Process:**
  1. `git checkout us-<N> && git checkout -b qa-<N>-e2e`
  2. Write spec at `apps/web/tests/e2e/admin/<feature>/us-<N>.spec.ts`. One `test()` per BDD scenario, name = scenario kebab-name verbatim. Use per-role pages for RBAC. Isolated fixtures.
  3. `pnpm --filter @duolabs/web e2e:ci -g "US-DUO-<N>"`
  4. **If green** — run `playwright-smoke` via Playwright MCP. Walk happy path + RBAC. Capture screenshots. Attach to Multica issue.
  5. PR `--base us-<N>`, squash-merge
- **On test failure** (real bug): Create new fix child issue at `phase=rt-dev`, marker `domain=fe|be`. Move parent BACK to `phase=dev`. Comment on parent. Cycle through fe-dev/be-dev → reviewer → here again.
- **On all green:** `multica-handoff` → `phase=homologation`, reassign to **HUMAN**.
- **Hard rule:** Never fix bugs yourself — always cycle through dev. Never skip RBAC or tenant isolation scenarios. Never use `E2E_USER` for mutating tests.

### Phase 15 — Homologation

- **Agent:** HUMAN (you, Renato)
- **Process:**
  1. Read summary comment from `qa-tester`
  2. Inspect screenshots
  3. Pull `us-<N>` branch locally if you want to poke at it
  4. Click "Merge" on the GitHub PR for `us-<N>` → `main`
- **Exit:** PR merged → `phase=done`. Comment on Multica.
- **Hard rule:** Don't merge if anything looks off. Send back to `qa-tester` (who reopens fix cycle) by reassigning + status update.

### Phase 16 — Done

Terminal state. The card sits in `phase=done`. Inform stakeholders if you want; otherwise move on.

## Branch hierarchy

```
main                               ← only merged at Homologation
└── us-DUO-<N>                     ← created by task-breaker; one per US
    ├── fe-DUO-<N>-<id>-<slug>     ← FE child branches
    ├── be-DUO-<N>-<id>-<slug>     ← BE child branches
    ├── qa-DUO-<N>-e2e             ← QA E2E spec branch
    └── fix-DUO-<N>-<id>-<slug>    ← bug fix children (after QA failure)
```

Children PRs target `us-<N>` (squash-merged). `us-<N>` PR targets `main` (merge commit, preserves child squashes as US history). See `02-branch-conventions/SKILL.md`.

## When a phase fails

Recovery patterns by phase:

| Phase | Failure mode | Recovery |
|---|---|---|
| Backlog | Vague seed, missing personas | `pm-grooming` grills via comments; if persona missing, escalate via @-mention to human |
| Product Planning | AC too vague / not testable | Stay in phase, iterate description |
| Design Doing | Conflicts with constraints | Sketch v2 in new comment (don't edit v1) |
| Test Planning | BDD missing scenario | Add scenarios; coverage map updated |
| Refinement | Agent doesn't reply within 24h | Nudge via NEW comment with @ (edits don't fire mentions); after 48h, escalate to human |
| Refinement (verdict 🚧) | Upstream needs revision | Reassign to specific upstream agent (designer / qa-planner / pm-grooming); they re-do their phase |
| Dev (child) | Tests can't pass | Comment back asking for refinement re-open; tasks pause |
| Code Review | Reviewer + dev disagree | Human escalation via @ in comment |
| Test | Real bug found | New fix child at `phase=rt-dev` with `domain=fe|be`. Parent moves back to `phase=dev`. Cycle. |
| Homologation | Human says no | Reassign to `qa-tester` with explanation; they triage and either re-test or open fix child |

## Multica primitives we rely on

- **issue** with `parent_id` + Tiptap-rich description (we put HTML comments + structured headings)
- **issue assignee** (member or agent) — primary trigger
- **comment** with `@mention` — secondary trigger (parallel multi-agent)
- **agent** with `runtime_id`, `instructions`, `model`, `max_concurrent_tasks`
- **skill** mounted on agent; injected into workdir at task spawn
- **project** with `github_repo` resources — daemon writes `.multica/project/resources.json` in workdir
- **runtime** = daemon + CLI binding (per-machine, per-workspace)
- **activity_log** — full audit trail of who did what when

What we don't rely on (because CLI v0.2.26 doesn't expose them):
- Issue labels (we use description marker instead)
- Issue dependencies (we use `status=blocked` + manual unblocking)
- Chat sessions via CLI (UI-only)
- Issue comment via CLI (TODO verify)

## See also

- `GOALS.md` — why we're doing this
- `TOPOLOGY.md` — where everything physically runs
- `PROVISION.md` — how to set up a new product
- `MULTICA-CLI-REFERENCE.md` — command reference + gaps + workarounds
- `agents/*.md` — instructions per agent
- `0?-*/SKILL.md` and `1?-*/SKILL.md` — full operational detail per skill
