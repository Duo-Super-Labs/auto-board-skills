---
name: multica-handoff
description: End-of-phase handoff. Atomically updates Multica status, the in-description phase metadata, and assignee. ALWAYS run as the last step of every task.
---

# Multica handoff

The very last thing you do on every task. Moves the card forward in the pipeline.

## Why this exists

Multica has only 5 useful statuses for the active pipeline (`backlog`, `todo`, `in_progress`, `in_review`, `done`; plus `blocked` and `cancelled`). Our pipeline has 16 phases. We collapse them onto status + an in-description phase marker.

> **CLI limitation (v0.2.26):** `multica issue update` does not expose label-on-issue assignment. Labels can only be created/listed/updated as workspace entities — the CLI offers no way to attach them to a specific issue. Until that lands, we encode `phase` in an HTML comment in the description (invisible in rendered markdown, but readable by every agent). When the CLI grows `multica issue label add <issue-id> <label>` (or similar), this skill migrates to native labels.

## Phase → Status mapping

| Multica status | Phase markers inside |
|---|---|
| `backlog` | `phase=backlog`, `phase=product-planning` |
| `todo` | `phase=rt-design`, `phase=rt-test-plan`, `phase=rt-refinement`, `phase=rt-dev` |
| `in_progress` | `phase=design-doing`, `phase=test-planning`, `phase=refinement`, `phase=dev` |
| `in_review` | `phase=rt-code-review`, `phase=code-review`, `phase=rt-test`, `phase=test` |
| `done` | `phase=homologation`, `phase=done` |

## In-description marker format

The FIRST LINE of every issue description must be:

```html
<!-- multica-board-state: phase=<phase> domain=<fe|be|qa-e2e|none> -->
```

Examples:

```html
<!-- multica-board-state: phase=rt-design domain=none -->
<!-- multica-board-state: phase=dev domain=fe -->
<!-- multica-board-state: phase=code-review domain=be -->
```

Rendered markdown shows nothing (HTML comments are hidden); agents grep this line.

## Routing table — WHO is next

| Your exit phase (and agent) | Next phase | Next assignee |
|---|---|---|
| `phase=backlog` (pm-grooming) | `phase=product-planning` | `pm-grooming` (self) |
| `phase=product-planning` (pm-grooming) | `phase=rt-design` | `designer` |
| `phase=design-doing` (designer) | `phase=rt-test-plan` | `qa-planner` |
| `phase=test-planning` (qa-planner) | `phase=rt-refinement` | `pm-refiner` |
| `phase=refinement` (pm-refiner, ALL @s replied) | `phase=rt-dev` | `task-breaker` |
| `phase=rt-dev` (task-breaker) | parent → `phase=dev`; children dispatched | per `domain` |
| `phase=dev` (fe-dev/be-dev, child) | child → `phase=rt-code-review` | `code-reviewer` |
| `phase=code-review` APPROVE (code-reviewer) | child → `phase=done`; original dev merges PR | original dev |
| (orchestration) last child merged in us-N | parent → `phase=rt-test` | `qa-tester` |
| `phase=test` PASS (qa-tester) | parent → `phase=homologation` | **HUMAN** (you) |
| `phase=test` FAIL (qa-tester) | parent → `phase=dev`; new fix child created | new fix child → fe-dev / be-dev |

## Steps

1. **Determine `next_phase`** — look up your current phase in the routing table.
2. **Determine `next_assignee`** — same lookup.
3. **Determine if Multica status changes** — see Phase → Status mapping.
4. **Read current description** to grab existing body:

   ```bash
   multica issue get <issue-id> --output json | jq -r '.description' > /tmp/desc.md
   ```

5. **Rewrite the first line** with the new phase marker, keeping everything else:

   ```bash
   awk -v phase="<next-phase>" -v domain="<your-domain-or-none>" '
     NR==1 && /^<!-- multica-board-state:/ { print "<!-- multica-board-state: phase=" phase " domain=" domain " -->"; next }
     NR==1 { print "<!-- multica-board-state: phase=" phase " domain=" domain " -->"; print; next }
     { print }
   ' /tmp/desc.md > /tmp/desc-new.md
   ```

6. **Atomic update** — single `multica issue update` call with all three changes:

   ```bash
   cat /tmp/desc-new.md | multica issue update <issue-id> \
     --description-stdin \
     --status <new-status-if-block-changes> \
     --assignee <next-agent-name>
   ```

   - Omit `--status` if the status block doesn't change (e.g. `phase=rt-design` → `phase=design-doing` are both `todo`/`in_progress` — but actually rt-design is `todo` and design-doing is `in_progress`, so DO update). Use this rule: change status whenever crossing the table boundary.
   - Omit `--assignee` only when self-handoff (e.g., pm-grooming → pm-grooming).

7. **Comment a one-liner** confirming the handoff:

   ```bash
   echo "Handoff: phase=<current> → phase=<next>. Routed to @<next-agent>." \
     | multica issue comment <issue-id> --body-stdin   # TODO: verify exact `issue comment` syntax via `multica issue --help`
   ```

   > **TODO**: the `multica issue comment` subcommand was not in the helps we calibrated against — confirm with `multica issue --help`. If absent, comments are UI-only too. Workaround: append the handoff line to description (less ideal because of length).

## Reassign safety ⚠️

**Reassigning an issue cancels ALL active tasks on it** (Multica behavior — not just the old assignee's tasks). Implications:

- In `phase=refinement`, the `pm-refiner` orchestrates via @-mentions. NEVER reassign while any @-mentioned agent's task is still `running` or `queued`. Verify first:

  ```bash
  multica agent tasks <agent-id> --output json \
    | jq --arg iid "<issue-id>" '[.[] | select(.issue_id == $iid and (.status == "running" or .status == "queued"))]'
  # Must return [] for ALL @-mentioned agents before reassign
  ```

- If `pm-refiner` reassigns prematurely, all the parallel review tasks die and the work is lost.

## Mention-vs-reassign decision

- Use **`@mention` in comment** when you want feedback WITHOUT transferring ownership (e.g., reviewer pings dev for a fix; refiner pings designer/qa for input). Mentions only fire on CREATE — not on edit.
- Use **`reassign` (--assignee)** when ownership transfers fully (e.g., end-of-phase handoff).

## What this skill does NOT do

- It does NOT decide WHAT to write in the next phase — that's the next agent's job.
- It does NOT do mid-phase routing — only end-of-phase.
- It does NOT manage child issues — `break-us` skill owns that.
