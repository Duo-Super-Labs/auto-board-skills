---
name: e2e-write
description: Test phase — writes Playwright E2E spec from BDD scenarios with 1:1 mapping. Uses fixtures, per-role pages, isolated test data. References CLAUDE.md E2E conventions.
---

# E2E write

Used by `qa-tester` agent during `phase:test`.

## Trigger

QA child issue (created by `task-breaker` with `domain:qa-e2e`) becomes unblocked when all sibling FE/BE children reach `phase:done` — the parent US then moves to `phase:rt-test` and you (qa-tester) are reassigned.

By this point:
- All FE/BE children's PRs are merged into `us-<N>` branch
- BDD scenarios from `qa-planner` are in a comment on the parent
- AC list is stable on the parent description

## Steps

### 1. Read context

```bash
cat .claude/rules/testing-architecture.mdc
grep -A30 "E2E conventions" CLAUDE.md
cat apps/web/tests/fixtures.ts | head -100

multica issue view <parent-us-id> --include comments
```

Extract from comments:
- BDD scenarios (Gherkin block from `qa-planner`)
- Refinement decisions (any added scenarios)

### 2. Set up branch

```bash
git fetch origin
git checkout us-DUO-12
git pull --rebase
git checkout -b qa-DUO-12-e2e
```

### 3. Create spec file

Path: `apps/web/tests/e2e/admin/<feature>/us-<N>.spec.ts`

Example: `apps/web/tests/e2e/admin/non-conformities/us-DUO-12.spec.ts`

```typescript
import { expect, test } from "../../../fixtures"; // NEVER from @playwright/test

test.describe("US-DUO-12: Bulk print non-conformities", () => {

  // ===== Background setup is handled by fixtures (E2E_ORG, seeded NCs) =====

  // ===== AC-1 — selection states =====

  test("bulk-print-button-disabled-when-empty", async ({ page }) => {
    await page.goto("/app/non-conformities");
    const btn = page.getByRole("button", { name: /bulk print/i });
    await expect(btn).toBeDisabled();
  });

  test("bulk-print-button-active-when-rows-selected", async ({ page }) => {
    await page.goto("/app/non-conformities");
    const checkboxes = page.getByRole("checkbox");
    await checkboxes.nth(1).check();
    await checkboxes.nth(2).check();
    await checkboxes.nth(3).check();
    const btn = page.getByRole("button", { name: /bulk print \(3 sel\)/i });
    await expect(btn).toBeEnabled();
  });

  // ===== AC-2 — loading state =====

  test("bulk-print-loading-state", async ({ page }) => {
    await page.goto("/app/non-conformities");
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /bulk print/i }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    // ... wait for resolution, assert PDF link appears, etc.
  });

  // ===== AC-3 — RBAC: hidden for member =====

  test("bulk-print-hidden-for-member-role", async ({ memberPage }) => {
    await memberPage.goto("/app/non-conformities");
    const btn = memberPage.getByRole("button", { name: /bulk print/i });
    await expect(btn).toHaveCount(0);
  });

  // ===== AC-4 — tenant isolation (direct API) =====

  test("bulk-print-cannot-cross-tenant", async ({ request, page }) => {
    // alice from acme tries to print Globex IDs via direct API call
    const response = await request.post("/api/admin/non-conformities/bulk-print", {
      data: { ids: ["nc-globex-1", "nc-globex-2"] },
    });
    expect(response.status()).toBe(403);
  });

  // ===== Edge case: large selection =====

  test("bulk-print-very-large-selection", async ({ page }) => {
    await page.goto("/app/non-conformities");
    // ... select 101 ...
    await page.getByRole("button", { name: /bulk print/i }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText(/may take >30s/i)).toBeVisible();
  });

  // ===== Edge case: network error =====

  test("bulk-print-network-error", async ({ page, context }) => {
    await context.route("**/admin/non-conformities/bulk-print", route => route.abort());
    await page.goto("/app/non-conformities");
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /bulk print/i }).click();
    await expect(page.getByText(/could not generate report/i)).toBeVisible();
  });
});
```

### 4. Run locally

```bash
pnpm --filter @duolabs/web e2e:ci -g "US-DUO-12"
```

If failures: STOP, investigate. There are two possibilities:
- **Test bug** — fix the test, re-run
- **Real bug in implementation** — DO NOT fix it yourself. Go to step 6 (failure path).

### 5. Smoke via Playwright MCP (manual sanity)

Use the `playwright` MCP server already in `.mcp.json`:

```
[Use playwright MCP tools to:]
1. Spawn a browser session
2. Navigate to http://localhost:3000/app/non-conformities (with seed login)
3. Walk happy path: select 3 → click Bulk print → verify download
4. Capture 1-2 screenshots
5. Attach screenshots as comment on Multica issue
```

### 6. On test failure (when it's a real bug)

Create a fix child issue on the parent US:

```bash
multica issue create \
  --title "Fix: <scenario name> failing" \
  --parent <us-id> \
  --label "domain:fe" \  # or domain:be depending on root cause
  --label "phase:rt-dev" \
  --description "$(cat <<EOF
## Scope
E2E scenario \`<scenario-name>\` is failing. Root cause appears to be in <component/file>.

Expected: <BDD then-clause>
Actual: <what happened>

Branch: \`fix-<US-N>-<NEW-CHILD-N>-<slug>\` (target: us-<N>)

## Repro
1. <step>
2. <step>

## Refs
- Failing test: apps/web/tests/e2e/admin/<feature>/us-<N>.spec.ts:<line>
- Original AC: AC-<n>
EOF
)" \
  --assignee fe-dev  # or be-dev

# Move parent BACK to dev
multica issue update <parent-us-id> \
  --remove-label "phase:test" \
  --add-label "phase:dev" \
  --status in_progress

# Comment on parent
multica issue comment <parent-us-id> "🚧 Found bug, opened DUO-XX for fix. Parent moved back to phase:dev."
```

The fix child flows back through fe-dev → reviewer → here. Do NOT fix yourself.

### 7. On all green

```bash
git add apps/web/tests/e2e/admin/<feature>/us-<N>.spec.ts
git commit -m "[DUO-15] E2E: US-DUO-12 bulk print scenarios (7/7 pass)"
git push -u origin qa-DUO-12-e2e

gh pr create \
  --base us-DUO-12 \
  --title "QA: E2E scenarios for US-DUO-12 bulk print" \
  --body "Refs: DUO-15, parent US-DUO-12

## Scope
- 7 Playwright tests, 1:1 with BDD scenarios v1
- Coverage: 4 ACs + 2 edge cases

## Test plan
- All 7 pass locally + smoke via Playwright MCP
- Screenshots attached on parent issue"
```

Then run `playwright-smoke` skill (next file) and post screenshots.

Finally:

```bash
# Squash-merge QA child into us-N
gh pr merge --squash --delete-branch
```

### 8. Hand off to homologation

```bash
multica issue update <parent-us-id> \
  --remove-label "phase:test" \
  --add-label "phase:homologation" \
  --status in_review \
  --assignee <human-handle>  # YOU, Renato

multica issue comment <parent-us-id> "$(cat <<EOF
✅ All scenarios green. Ready for homologation.

## Summary
- Children merged: DUO-13 (FE), DUO-14 (BE), DUO-15 (E2E spec)
- Branches: us-DUO-12 ready to merge into main
- Tests: 7/7 pass + smoke OK
- Screenshots: see attached

@<human> please review and merge \`us-DUO-12\` → \`main\` when ready.
EOF
)"
```

## Hard rules

- NEVER fix bugs yourself — always cycle back through dev
- NEVER skip RBAC scenarios when AC mentions roles
- NEVER skip tenant isolation E2E for data features
- ALWAYS keep `test()` name = BDD scenario name verbatim
- NEVER import `test` from `@playwright/test` — always from `../../../fixtures`
- NEVER use `E2E_USER` or system roles for mutating tests (use isolated fixtures)
- ALWAYS use per-role pages (`memberPage`, `adminPage`) for RBAC scenarios
- ALWAYS run `pnpm --filter @duolabs/web e2e:ci` locally BEFORE pushing
- NEVER reduce coverage below 1:1 BDD scenario → Playwright test

## End

Parent at `phase:homologation`, assigned to human. You're done with this US.
