---
name: product-planning
description: Product Planning phase — fills Acceptance Criteria, context, objective, and details on a US that already has the persona/capability/outcome filled by grill-us.
---

# Product Planning

Used by `pm-grooming` agent during `phase=product-planning`.

## Trigger

Issue with `phase=product-planning` label. The description should already have:
- `## User Story`
- `## Personas Involved`
- `## Why now`
- `## Out of scope`
- `## Open questions` (may have unresolved items)

If the description is incomplete, run `grill-us` first.

## Output

Append (do not replace) the following sections to the issue description:

```markdown
## Acceptance Criteria

- [ ] AC-1: <criterion phrased as user-observable behavior>
- [ ] AC-2: ...
- [ ] AC-3: ...

## Context

<2-4 sentences describing the system area touched. Reference existing modules:
e.g., "Touches modules/admin/non-conformities/. Uses existing DataTable from
@duolabs/ui/components/data-table. RBAC: admin/owner can bulk-print.">

## Objective

<1 sentence: the smallest change that makes the AC pass.>

## Edge cases (initial)

- <case 1: empty selection>
- <case 2: permission denied>
- <case 3: very large selection — pagination?>

## Risks

- <thing that could go wrong>
- <dependency on external service>
```

## Acceptance Criteria — format rules

Each AC must be:

1. **User-observable** — phrased as what the user sees/does, NOT what the code does
   - ✅ "User can select multiple rows via checkbox in the listing"
   - ❌ "Add `selectedIds: string[]` state to `useNonConformitiesFilters`"

2. **Testable** — a Playwright test can verify it
   - ✅ "When 0 rows selected, the 'Print' button is disabled"
   - ❌ "The print feature works correctly"

3. **Persona-aware** — reference role when relevant
   - ✅ "When user has `admin` role, button is visible; when `member`, hidden"
   - ❌ "Permissions are checked"

4. **One assertion** — split if needed
   - ❌ "Click print → modal opens → user picks format → file downloads"
   - ✅ Three ACs: opens modal / format selection works / file downloads

5. **Numbered stable IDs** — `AC-1`, `AC-2`, ... — never reorder, only append. Used by `bdd-writer` and `e2e-write` for 1:1 mapping.

## How many ACs?

- Minimum: 3 (otherwise the US is too thin — promote to a task)
- Maximum: ~10 (if more, split into multiple US during refinement)

## Multi-tenant + RBAC checks (mandatory)

For any US touching data, ALWAYS include:

- AC: "Tenant isolation — user from org A cannot see data from org B"
- AC: "Permission required: <Resource>:<Action> — users without it see/get the right error"

Reference `packages/permissions` resources/actions table from `CLAUDE.md`.

## US text is FROZEN-scope (no scope creep at planning)

The US text was produced by `grill-us` after a deliberate interview. **You are not authorized to invent features the US doesn't mention** — even if you "obviously need them" to make the AC complete.

Examples of scope creep to refuse:

❌ "While we're at it, let's also add bulk-delete" — the US said BULK PRINT. Bulk delete is a separate US.
❌ "We should add a confirmation modal" — UNLESS the US's `## Why now` references a destructive concern.
❌ "We'll need a new `Reports` permission resource" — UNLESS already implied by the persona's role differentiation.

If you genuinely think the US is missing AC needed for the personas to succeed, **add it as a comment under `## Open questions`** and @-mention `pm-grooming`. They decide whether to update the US (frozen text) or split into a new US.

The exception: tenant isolation + RBAC checks are ALWAYS required for data features (admin invariant). Adding those is not scope creep — it's enforcing the invariant.

## Issue #1 of every product = "Project setup + smoke test"

Before any feature US, every new product needs a foundation US:

- **Title:** `US-1: Project setup + smoke test`
- **Type:** Tech debt (label `domain=infra` once available; for now use no domain)
- **AC:**
  - [ ] AC-1: `pnpm install && pnpm typecheck` clean on the product fork
  - [ ] AC-2: Docker stack up via `product-stack.sh up <slug> $PWD`
  - [ ] AC-3: Test database migrated, smoke test (login flow) passes via Playwright
  - [ ] AC-4: CI workflow green on first push (typecheck + Vitest + Playwright)
  - [ ] AC-5: `Product/` folder is committed and complete (vision/personas/journeys/features/constraints/glossary)
- **Definition of done:** developer can clone the repo, run `pnpm install && pnpm dev`, log in to the local instance, and see the seeded admin dashboard.

This US doesn't go through full Design/BDD — it's infrastructure. It DOES go through TDD (write the smoke spec first) and Code Review.

## Hard rules

- NEVER write code, JSX, or specific function names
- NEVER specify framework choices ("use TanStack" — wrong; "the listing reflects the new state without a reload" — right)
- ALWAYS preserve `## Open questions` — if any remain after Planning, they go to Refinement
- ALWAYS keep AC list immutable (only append, stable IDs) — downstream depends on it

## End

Run `multica-handoff` → `phase=rt-design`, reassign to `designer`.
