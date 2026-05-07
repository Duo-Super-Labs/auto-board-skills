---
name: multica-handoff
description: End-of-phase handoff. Updates labels, status, assignee atomically. ALWAYS run as the last step of every task.
---

# Multica handoff

The very last thing you do on every task. Moves the card forward in the pipeline.

## Why this exists

Multica has only 7 fixed statuses (`backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`). Our pipeline has 16 phases. We collapse them onto status + a `phase:*` label.

## Phase → Status mapping (memorize)

| Multica status | Phase labels inside |
|---|---|
| `backlog` | `phase:backlog`, `phase:product-planning` |
| `todo` | `phase:rt-design`, `phase:rt-test-plan`, `phase:rt-refinement`, `phase:rt-dev` |
| `in_progress` | `phase:design-doing`, `phase:test-planning`, `phase:refinement`, `phase:dev` |
| `in_review` | `phase:rt-code-review`, `phase:code-review`, `phase:rt-test`, `phase:test` |
| `done` | `phase:homologation`, `phase:done` |

## Routing table — WHO is next

| Your exit phase (and agent) | Next phase | Next assignee |
|---|---|---|
| `phase:backlog` (pm-grooming) | `phase:product-planning` | `pm-grooming` (self) |
| `phase:product-planning` (pm-grooming) | `phase:rt-design` | `designer` |
| `phase:design-doing` (designer) | `phase:rt-test-plan` | `qa-planner` |
| `phase:test-planning` (qa-planner) | `phase:rt-refinement` | `pm-refiner` |
| `phase:refinement` (pm-refiner, ALL @s replied) | `phase:rt-dev` | `task-breaker` |
| `phase:rt-dev` (task-breaker) | parent → `phase:dev`; children dispatched | per `domain:*` |
| `phase:dev` (fe-dev/be-dev, child) | child → `phase:rt-code-review` | `code-reviewer` |
| `phase:code-review` APPROVE (code-reviewer) | child → `phase:done`; original dev merges PR | original dev |
| (orchestration) last child merged in us-N | parent → `phase:rt-test` | `qa-tester` |
| `phase:test` PASS (qa-tester) | parent → `phase:homologation` | **HUMAN** (you) |
| `phase:test` FAIL (qa-tester) | parent → `phase:dev`; new fix child created | new fix child → fe-dev / be-dev |

## Steps

1. **Determine `next_phase`** — look up your current `phase:*` label in the routing table.
2. **Determine `next_assignee`** — same lookup.
3. **Determine if status block changes** — if so, update Multica status.
4. **Run the update**:

```bash
multica issue update <issue-id> \
  --remove-label "phase:<current>" \
  --add-label "phase:<next>" \
  --status <new-status-if-block-changes> \
  --assignee <next-agent-name-or-handle>
```

5. **Comment a one-liner** confirming the handoff (so timeline is readable):

```
Handoff: phase:<current> → phase:<next>. Routed to @<next-agent>.
```

## Reassign safety ⚠️

**Reassigning an issue cancels ALL active tasks on it** (Multica behavior — not just the old assignee's tasks). Implications:

- In `phase:refinement`, the `pm-refiner` orchestrates via @-mentions. NEVER reassign while any @-mentioned agent's task is still `running` or `queued`. Verify first:

```bash
multica issue tasks <issue-id> --status running,queued
# Must return empty before reassign
```

- If `pm-refiner` reassigns prematurely, all the parallel review tasks die and the work is lost.

## Status update rule

Only change Multica status when crossing a status block boundary. Within a block (e.g., `phase:rt-design` → `phase:design-doing` are both `todo`/`in_progress`), label change alone is enough. Don't churn status unnecessarily — it's noisy on the activity log.

## Mention-vs-reassign decision

- Use **`@mention` in comment** when you want feedback WITHOUT transferring ownership (e.g., reviewer pings dev for a fix; refiner pings designer/qa for input).
- Use **`reassign`** when ownership transfers fully (e.g., end-of-phase handoff).

## What this skill does NOT do

- It does NOT decide WHAT to write in the next phase — that's the next agent's job.
- It does NOT do mid-phase routing — only end-of-phase.
- It does NOT manage child issues — `break-us` skill owns that.
