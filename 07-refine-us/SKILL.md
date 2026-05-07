---
name: refine-us
description: Refinement phase — orchestrates multi-agent input via @-mentions in a single comment, waits for ALL replies, consolidates blockers/edge cases. The handshake between upstream (PM/QA/Design) and downstream (devs).
---

# Refine US

Used by `pm-refiner` agent during `phase:refinement`.

## Why this is the most delicate phase

Refinement is the single moment where ALL specialists weigh in before code is written. If you reassign too early, Multica cancels active tasks and you LOSE the responses. Read `03-multica-handoff/SKILL.md` "Reassign safety" before starting.

## Trigger

Issue with `phase:refinement` label, assigned to you (`pm-refiner`).

By this point the issue has:
- US (from grill-us)
- AC + Context + Objective + Edge cases (from product-planning)
- Design sketch in a comment (from designer)
- BDD scenarios in a comment (from qa-planner)

## Steps

### 1. Read everything

```bash
multica issue view <id> --include comments
```

Pay attention to:
- `## Edge cases` listed by PM
- BDD scenarios by QA — do they cover all AC?
- Design sketch — does it match AC + BDD?
- Constraints from `Product/constraints.md`

### 2. Identify gaps in your head BEFORE asking

Common gaps:
- AC missing tenant isolation check
- BDD missing negative path for permission denied
- Design missing empty/loading/error state
- Edge case unaddressed by anyone (e.g., concurrent edit)
- Stack constraint violation (e.g., AC implies streaming but stack is RSC-first)

### 3. Compose ONE comment with @-mentions

⚠️ **One comment, all mentions in it**. Mentions only fire on CREATE — if you edit later to add @s, no one is triggered.

Structure:

```markdown
## Refinement v1

@designer @qa-planner @fe-dev @be-dev — I need your input on US-DUO-12. Please reply in this issue with:

**For all of you:**
- Anything that's a blocker
- Anything you'd add as an edge case
- Estimated complexity (T-shirt: XS / S / M / L / XL)

**Specific:**

@designer — Does the sketch handle empty/loading/error states for AC-3 (bulk print empty selection)? Mobile + desktop?

@qa-planner — Are there scenarios for tenant isolation (admin from org A bulk-printing org B's data)? RBAC for member vs admin?

@fe-dev — Any hook/state concerns? Will the selection state survive page changes? URL state via nuqs?

@be-dev — Does the bulk endpoint exist or is this new? Pagination implications for "very large selection"? Rate limiting?

I'll consolidate when all four reply. Please reply in <24h.
```

### 4. Wait

Do NOT take any other action on this issue until all 4 agents have commented back.

Check status:

```bash
multica issue tasks <id> --status running,queued
# Must be empty across all 4 mentioned agents before proceeding
```

If an agent hasn't replied after 12h, @ them again with a nudge in a NEW comment (mention-on-edit doesn't fire).

### 5. Consolidate

Once all four replied, write a single comment:

```markdown
## Refinement consolidated — ready for break-down

### Blockers (resolve before dev)
- <none> | <list>

### Added edge cases
- AC-N: <new edge case from <agent>>

### Estimates (T-shirt)
| Domain | Estimate |
|---|---|
| FE | M |
| BE | S |
| QA E2E | S |

### Decisions
- <thing the team decided>

### Updates to PM/Design/QA artifacts (if any)
- <if AC needs to be edited, edit description here>
- <if sketch needs adjustment, designer agreed in comment>
- <if BDD adds scenario, qa-planner agreed in comment>

### Verdict
✅ Ready for break-down → @task-breaker

OR

🚧 Send back to <upstream agent> for revision (status stays here, not handoff)
```

### 6. Handoff (only if verdict is ✅)

`multica-handoff` → `phase:rt-dev`, reassign to `task-breaker`.

If verdict is 🚧, do NOT handoff. Instead reassign to whichever upstream agent needs to revise (designer if sketch is wrong, qa-planner if BDD is wrong, pm-grooming if AC is wrong). They re-do their phase, then send back.

## Hard rules

- NEVER reassign while any of the @-mentioned agents has an active task on this issue
- NEVER edit a comment to add @-mentions — they don't fire on edit
- NEVER consolidate before all 4 replied (silent agent = blocker, not approval)
- NEVER write code, branches, or task breakdown — that's `task-breaker`'s job
- ALWAYS update issue description if AC changes during refinement (keep stable AC IDs)
- ALWAYS time-cap: if no reply after 24h + nudge, escalate to human via @ in comment

## What this skill does NOT do

- Does NOT split US into child tasks (next skill)
- Does NOT create branches (next skill)
- Does NOT decide implementation strategy (devs decide in Dev phase)
