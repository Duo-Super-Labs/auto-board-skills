---
name: break-us
description: RtDev phase — splits a refined US into FE/BE/QA child issues with branch hierarchy. Creates the us-N parent branch, then child issues with parent_id linkage, domain encoded in description metadata (CLI gap), per-child branch names, and assignment to the matching dev agent.
---

# Break US

Used by `task-breaker` agent during `phase=rt-dev`.

## Trigger

US has `phase=rt-dev` marker (in description first line) and verdict ✅ from `pm-refiner` (in last comment).

By now the issue has:
- US text
- AC (stable IDs)
- Design sketch
- BDD scenarios
- Refinement consolidated comment with estimates + decisions

## Steps

### 1. Read everything

```bash
multica issue get <us-id> --output json | jq '{title, description, comments}'
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

For each planned child, write a description file then create the issue:

```bash
cat > /tmp/fe-DUO-12-13-spec.md <<'EOF'
<!-- multica-board-state: phase=rt-dev domain=fe -->

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

## Out of scope

- Backend endpoint (separate child DUO-14)
- E2E tests (separate child DUO-15)

## Definition of done

- [ ] Component built per sketch
- [ ] All Vitest unit tests for helpers pass (if any)
- [ ] `pnpm typecheck` clean
- [ ] PR opened against `us-DUO-12`
EOF

cat /tmp/fe-DUO-12-13-spec.md | multica issue create \
  --title "FE: Bulk print button + selection UI" \
  --parent DUO-12 \
  --project <project-id> \
  --assignee fe-dev \
  --status todo \
  --description-stdin \
  --output json
```

> **CLI gap (v0.2.26):** `multica issue create` has no `--label` flag, so we cannot attach `domain=fe` as a Multica label. Instead, the **first line of description** carries the state marker `<!-- multica-board-state: phase=rt-dev domain=fe -->`. Every downstream skill greps this line. When CLI grows label-on-issue support, this migrates to native labels.

Repeat for BE child, QA child:

```bash
# BE child — domain=be
cat /tmp/be-DUO-12-14-spec.md | multica issue create \
  --title "BE: Bulk print procedure + PDF generation" \
  --parent DUO-12 \
  --project <project-id> \
  --assignee be-dev \
  --status todo \
  --description-stdin --output json

# QA-E2E child — domain=qa-e2e, status=blocked (until siblings done)
cat /tmp/qa-DUO-12-e2e-spec.md | multica issue create \
  --title "E2E: bulk print scenarios" \
  --parent DUO-12 \
  --project <project-id> \
  --assignee qa-tester \
  --status blocked \
  --description-stdin --output json
```

> **CLI gap (v0.2.26):** `multica issue create` has no `--depends-on` flag. We can't express the dependency QA-child blocked-by FE+BE-children declaratively. Workaround: status `blocked` on the QA child + the qa-tester skill polls/waits for parent to reach `phase=rt-test` (which only happens after FE+BE children close).

### 5. Cross-link children in parent comment

```bash
cat <<'EOF' | multica issue comment <us-id> --body-stdin   # TODO: verify exact comment syntax
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

Parent moves to phase=dev. Children dispatched.
EOF
```

> If `multica issue comment` doesn't exist (verify with `multica issue --help`), append the break-down to the parent description instead.

### 6. Update parent state marker + status

```bash
multica issue get DUO-12 --output json | jq -r '.description' > /tmp/parent.md

awk '
  NR==1 && /^<!-- multica-board-state:/ { print "<!-- multica-board-state: phase=dev domain=none -->"; next }
  NR==1 { print "<!-- multica-board-state: phase=dev domain=none -->"; print; next }
  { print }
' /tmp/parent.md > /tmp/parent-new.md

cat /tmp/parent-new.md | multica issue update DUO-12 \
  --description-stdin \
  --status in_progress
```

Parent stays assigned to `pm-refiner` (so they monitor progress). Don't reassign.

### 7. Children are auto-dispatched

Each child was created with `--assignee fe-dev` (or `be-dev`), so Multica enqueues their tasks immediately. The QA-E2E child stays `blocked` until manually unblocked when parent reaches `phase=rt-test`.

## Hard rules

- NEVER create more than 6 children per US — push back to `pm-refiner` instead.
- ALWAYS create the `us-N` branch BEFORE creating child issues.
- ALWAYS use stable Multica issue numbers in branch names.
- ALWAYS write child description with the `<!-- multica-board-state: ... -->` first line — agents depend on it.
- ALWAYS write child description with: scope / branch / refs / module / out-of-scope / DoD — these 6 sections, in order.
- NEVER reassign the parent — it stays with `pm-refiner` until QA reaches Homologation.

## End

You don't run `multica-handoff` for the parent here (it stays at `phase=dev` while children execute). You DO mark the children's initial state. Comment the break-down on the parent and stop.

The next handoff happens when the LAST child PR is merged into `us-N` — that triggers parent → `phase=rt-test`. That orchestration is owned by `qa-tester` (it watches for "all siblings done").
