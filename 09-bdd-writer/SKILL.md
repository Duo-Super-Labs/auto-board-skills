---
name: bdd-writer
description: Test Planning phase — writes Given/When/Then scenarios from AC + design sketch. One scenario per AC + edge cases + RBAC + tenant isolation. Output is the source of truth for downstream Playwright tests.
---

# BDD writer

Used by `qa-planner` agent during `phase=test-planning`.

## Input

- `## Acceptance Criteria` (from issue description)
- Design sketch comment from `designer`
- `Product/personas.md` (for persona-driven negative paths)
- `CLAUDE.md` testing conventions (per the template)

## Output — single comment with this structure

```markdown
## BDD — scenarios v1

\`\`\`gherkin
Feature: <feature name from US title>

  Background:
    Given an organization "Acme" with super-admin "alice"
    And the database is seeded with 10 non-conformities owned by Acme

  # ===== AC-1 =====
  Scenario: bulk-print-button-disabled-when-empty
    Given alice is on the non-conformities listing
    And no rows are selected
    Then the "Bulk print" button is disabled

  Scenario: bulk-print-button-active-when-rows-selected
    Given alice is on the non-conformities listing
    When she selects 3 rows via checkbox
    Then the "Bulk print" button shows "Bulk print (3 sel)"
    And the button is enabled

  # ===== AC-2 =====
  Scenario: bulk-print-loading-state
    Given alice has 3 rows selected
    When she clicks "Bulk print"
    Then a loading skeleton appears in place of the action area
    And the button is replaced by a spinner

  # ===== AC-3 (RBAC) =====
  Scenario: bulk-print-hidden-for-member-role
    Given a user "bob" with role "member" in organization "Acme"
    When bob views the non-conformities listing
    Then the "Bulk print" button is not visible

  # ===== AC-4 (tenant isolation) =====
  Scenario: bulk-print-cannot-cross-tenant
    Given alice is super-admin of "Acme"
    And there are 5 non-conformities in organization "Globex"
    When alice attempts to bulk-print non-conformities by Globex IDs via direct API call
    Then the response status is 403
    And no PDF is generated

  # ===== Edge cases =====
  Scenario: bulk-print-very-large-selection
    Given alice has 101 rows selected
    When she clicks "Bulk print"
    Then a confirmation dialog appears warning "Large selection — may take >30s"
    And alice can cancel or proceed

  Scenario: bulk-print-network-error
    Given alice has 3 rows selected
    And the network is unstable
    When she clicks "Bulk print"
    Then a toast error appears: "Could not generate report. Try again."
    And the selection is preserved
\`\`\`

### Coverage map

| AC | Scenarios | Notes |
|---|---|---|
| AC-1 | 2 | Disabled / active states |
| AC-2 | 1 | Loading |
| AC-3 | 1 | RBAC member |
| AC-4 | 1 | Tenant isolation (direct API) |
| Edge | 2 | Large selection, network error |

### Open questions for refinement
- [ ] Should the network error scenario distinguish 4xx vs 5xx?
- [ ] Is there a mid-print "cancel" UX, or fire-and-forget?
```

## Naming rules

Each scenario name MUST be:
- **Stable kebab-case** — never reorder; renaming requires explicit migration
- **Self-explanatory** — readable as a Playwright `test()` name without context
- **Anchored to behavior** — verb in middle (`bulk-print-button-disabled-when-empty`, NOT `test-disabled-button`)

Downstream `e2e-write` skill maps 1:1: scenario name → `test()` name.

## Mandatory scenarios (per US)

For ANY US touching data, you MUST include scenarios for:

1. **Happy path** (1 per AC)
2. **RBAC** — at minimum one scenario per role differentiation in personas
3. **Tenant isolation** — for ANY data-touching feature (admin invariant)
4. **Empty state** — what users see with zero records
5. **Loading state** — what users see while data fetches
6. **Error state** — at least one network/API error scenario

If any of these can't apply, write a one-liner explaining why under "Coverage map" Notes.

## Minimums per issue type

| Issue type | Minimum scenarios | Required mix |
|---|---|---|
| Story (new feature) | **3** | happy path + RBAC negative + edge case (empty/error/limit) |
| Bug fix | **2** | regression test that proves the fix + adjacent-functionality check |
| Improvement (existing feature) | **2** | new behavior + same-behavior preservation |
| Tech debt / refactor | **0–1** | only if user-visible; otherwise typecheck + existing tests are enough |

If you can't write the minimum mix, the issue is under-spec'd — push back to `pm-grooming` instead of fabricating scenarios.

## Gherkin anti-patterns (these get rejected at refinement)

These patterns leak through often. Refuse to write them; rewrite when you see them:

❌ **Abstract checkboxes** — Acceptance Criteria written as `- [ ] Funciona corretamente` is unverifiable. Rewrite as `Then the user sees <observable thing>`.

❌ **Implementation leak** — `Given that useState is true` / `Given the API returns 200`. Scenarios describe USER-OBSERVABLE behavior, not internals. Rewrite as `Given the user has just toggled the filter` / `When the request completes successfully`.

❌ **One-scenario stories** — A story with 1 happy-path scenario and nothing else WILL hit a bug in production within a week. Always include at least one negative path (RBAC denied, validation error, or limit case).

❌ **Bug fix without regression test** — A bug scenario that doesn't exercise the exact failing path is theatre. The scenario must, with the bug present, FAIL — and with the fix, PASS.

❌ **Persona-less subject** — `Given a user is on the page`. Always reference a named persona from `Product/personas.md` so RBAC-relevant scenarios pick up role automatically.

❌ **`Given the database has X records`** — agent doesn't seed the DB; the test fixture does. Phrase as `Given organization "Acme" has 10 non-conformities` (matches Background block fixture pattern).

❌ **Untestable temporal language** — `Eventually`, `quickly`, `as fast as possible`. If timing matters, give a specific bound: `within 2 seconds`.

## Hard rules

- NEVER write Playwright code (.spec.ts) — that's `qa-tester` in the Test phase
- NEVER skip tenant isolation for data features
- ALWAYS use exact names from glossary (`Product/glossary.md`) — "Non-conformity" not "NC record"
- ALWAYS reference persona names from `Product/personas.md`
- ALWAYS put each Scenario inside a Feature block at the top
- ALWAYS use Background block for shared setup (org, seed data) — DRY across scenarios

## End

Run `multica-handoff` → `phase=rt-refinement`, reassign to `pm-refiner` (orchestrator).
