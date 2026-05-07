---
name: break-us
description: RtDev phase — splits a refined US into FE/BE/QA child issues with branch hierarchy. Creates the us-N parent branch, then child issues with parent_id linkage, domain labels, and per-child branch names.
---

# Break US

Used by `task-breaker` agent during `phase:rt-dev`.

## Trigger

US has `phase:rt-dev` label and verdict ✅ from `pm-refiner` (in last comment).

By now the issue has:
- US text
- AC (stable IDs)
- Design sketch
- BDD scenarios
- Refinement consolidated comment with estimates + decisions

## Steps

### 1. Read everything

```bash
multica issue view <id> --include comments
```

### 2. Decide split strategy

Default heuristic per AC:

| AC type | BE child | FE child | QA child |
|---|---|---|---|
| New API endpoint + UI | yes (1) | yes (1) | shared (1, end of US) |
| UI-only change | no | yes (1) | shared (1) |
| Data migration only | yes (1) | no | shared (1) if user-visible |
| Permission/RBAC | no (uses existing middleware) | yes if visibility changes | shared (1) |

**Max 6 children total per US.** If you'd need more, comment back to `pm-refiner` requesting US split.

### 3. Create the US parent branch

```bash
cd <product-repo-workdir>
git fetch origin main
git checkout main
git pull --rebase
git checkout -b us-DUO-12
git push -u origin us-DUO-12
```

If `us-DUO-12` already exists (re-running break-us after rejection), skip this step.

### 4. Create child issues in Multica

For each planned child, create a Multica issue:

```bash
multica issue create \
  --title "FE: <descriptive title>" \
  --parent DUO-12 \
  --label "domain:fe" \
  --label "phase:rt-dev" \
  --description-from-file fe-DUO-12-13-spec.md \
  --assignee fe-dev
```

Description template (`<domain>-DUO-12-<N>-spec.md`):

```markdown
## Scope

<1-2 sentences: what this child does in service of the US>

## Branch

- Source: `us-DUO-12` (parent)
- This task: `fe-DUO-12-13-<slug>`
- Target PR: `fe-DUO-12-13-<slug>` → `us-DUO-12` (NOT main)

## References

- Parent US: DUO-12
- AC covered: AC-1, AC-2 (visual selection states)
- BDD scenarios covered:
  - bulk-print-button-disabled-when-empty
  - bulk-print-button-active-when-rows-selected
  - bulk-print-loading-state
- Design sketch: see DUO-12 comment "Design — sketch v1"

## Module touched

`apps/web/modules/admin/non-conformities/`
- New: `components/BulkPrintButton.tsx`
- Edit: `api.ts` (add `useBulkPrint` mutation)
- Edit: `lib/columns.tsx` (add selection column)
- Edit: `hooks/use-non-conformity-filters.ts` (no change — selection is component state)

## Out of scope

- Backend endpoint (separate child DUO-14)
- E2E tests (separate child DUO-15)

## Definition of done

- [ ] Component built per sketch
- [ ] All Vitest unit tests for helpers pass (if any)
- [ ] `pnpm typecheck` clean
- [ ] PR opened against `us-DUO-12`
```

### 5. Cross-link children in parent comment

Append to parent US comment:

```markdown
## Break-down v1

| Child | Domain | Title | Branch |
|---|---|---|---|
| DUO-13 | FE | Bulk print button + selection UI | `fe-DUO-12-13-bulk-print-ui` |
| DUO-14 | BE | Bulk print procedure + PDF generation | `be-DUO-12-14-bulk-print-procedure` |
| DUO-15 | QA-E2E | E2E spec for bulk print | `qa-DUO-12-e2e` |

Branch hierarchy:
\`\`\`
main
└── us-DUO-12
    ├── fe-DUO-12-13-bulk-print-ui    (DUO-13 → fe-dev)
    ├── be-DUO-12-14-bulk-print-procedure  (DUO-14 → be-dev)
    └── qa-DUO-12-e2e                  (DUO-15 → qa-tester, when parent reaches RtTest)
\`\`\`

Parent moves to `phase:dev`. Children dispatched.
```

### 6. Update parent labels

```bash
multica issue update DUO-12 \
  --remove-label "phase:rt-dev" \
  --add-label "phase:dev" \
  --status in_progress
```

Parent stays assigned to `pm-refiner` (so they monitor progress and intervene if children stall).

### 7. Children are auto-dispatched

Because each child was created with `--assignee fe-dev` (or `be-dev`), Multica enqueues their tasks immediately. The QA-E2E child is created but kept at `phase:rt-dev` — it activates when the parent reaches `phase:rt-test`.

Actually correction: create the QA child but with `phase:waiting-parent` (use status `blocked` for clarity) and add dependency: child blocked by all FE/BE children. Multica supports `issue_dependency` per docs.

```bash
multica issue create \
  --title "E2E: bulk print scenarios" \
  --parent DUO-12 \
  --label "domain:qa-e2e" \
  --label "phase:waiting-parent" \
  --status blocked \
  --depends-on DUO-13,DUO-14 \
  --assignee qa-tester
```

When DUO-13 and DUO-14 both close, the QA child auto-unblocks.

## Hard rules

- NEVER create more than 6 children per US — push back to `pm-refiner` instead
- ALWAYS create the `us-N` branch BEFORE creating child issues (prevents children pointing to non-existent branch)
- ALWAYS use stable Multica issue numbers in branch names
- NEVER create a child with `phase:dev` directly — go through `phase:rt-dev` even if it auto-progresses fast (consistency)
- ALWAYS write child description with: scope / branch / refs / module / out-of-scope / DoD — these 6 sections, in order
- NEVER reassign the parent — it stays with `pm-refiner` until QA reaches Homologation

## End

You don't run `multica-handoff` for the parent here (it stays at `phase:dev` while children execute). You DO mark the children's initial state. Comment the break-down on the parent and stop.

The next handoff happens when the LAST child PR is merged into `us-N` — that triggers parent → `phase:rt-test`. That orchestration is owned by `qa-tester` (it watches for "all siblings done").
