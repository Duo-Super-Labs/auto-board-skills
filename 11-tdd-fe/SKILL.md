---
name: tdd-fe
description: Frontend TDD workflow for Next.js 16 + RSC + TanStack Query + Shadcn + react-hook-form + Zod stack. Red-green-refactor with Playwright (behavior) or Vitest (helpers). References .claude/skills/frontend-recipe/ in the repo.
---

# TDD — frontend

Used by `fe-dev` agent during `phase:dev` (label `domain:fe`).

## Stack-expertise lives in repo

Stack patterns (5-layer flow, hook patterns, form patterns, DataTable, route wrappers, etc.) are in the repo itself:

- `.claude/skills/frontend-recipe/` — main recipe
- `.claude/rules/ui-and-styling.mdc`, `.claude/rules/syntax-and-formatting.mdc`, `.claude/rules/typescript-usage.mdc`
- `CLAUDE.md` — full project guidelines

Read those FIRST. This skill is the orchestration layer ON TOP.

## Trigger

Child issue with `domain:fe` + `phase:dev` assigned to you (`fe-dev`).

## Steps

### 1. Read context

```bash
# Always
cat Product/personas.md Product/glossary.md Product/constraints.md

# Stack expertise
cat .claude/skills/frontend-recipe/SKILL.md
ls .claude/skills/frontend-recipe/
cat .claude/rules/ui-and-styling.mdc
cat .claude/rules/syntax-and-formatting.mdc

# Issue context
multica issue view <child-id>
multica issue view <parent-us-id>  # for AC, BDD, sketch
```

### 2. Set up branch

```bash
git fetch origin
git checkout us-DUO-12
git pull --rebase
git checkout -b fe-DUO-12-13-bulk-print-ui
```

### 3. Red — write failing test FIRST

**Test type decision tree:**

| What you're building | Test type | Why |
|---|---|---|
| User-visible UI behavior | Playwright (E2E) | Real browser, real DB |
| Pure helper / util | Vitest Node | Fast, isolated |
| Hook with logic | Inline in Playwright | Hooks tested via behavior, not unit (per CLAUDE.md) |
| Component snapshot | NEVER | Per CLAUDE.md: no snapshot tests |
| `api.ts` hook | Inline in Playwright | Tested through component behavior |

**For UI behavior** (most cases) — write Playwright spec stub:

```typescript
// apps/web/tests/e2e/admin/non-conformities/bulk-print.spec.ts
import { test, expect } from "../../fixtures";  // NEVER from @playwright/test

test.describe("Non-conformities — bulk print", () => {
  test("bulk-print-button-disabled-when-empty", async ({ page }) => {
    await page.goto("/app/non-conformities");
    const btn = page.getByRole("button", { name: /bulk print/i });
    await expect(btn).toBeDisabled();
  });

  test("bulk-print-button-active-when-rows-selected", async ({ page }) => {
    await page.goto("/app/non-conformities");
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("checkbox").nth(2).check();
    const btn = page.getByRole("button", { name: /bulk print \(2 sel\)/i });
    await expect(btn).toBeEnabled();
  });
});
```

> **Naming:** `test()` name MUST equal the BDD scenario name verbatim (kebab-case from `qa-planner`).

Run it. It fails. Good.

```bash
pnpm --filter @duolabs/web e2e -g "bulk-print"
```

### 4. Green — minimum implementation to pass

Follow `frontend-recipe/` patterns:

- Component in `modules/admin/non-conformities/components/BulkPrintButton.tsx`
- Hook in `modules/admin/non-conformities/api.ts` (`useBulkPrint`)
- Selection state via TanStack Table (already in `useCreateTable`)
- Button uses `@duolabs/ui` `Button` + `usePermission`

Minimum viable code only. No premature optimization.

```bash
pnpm typecheck                        # must pass
pnpm --filter @duolabs/web test       # vitest helpers pass
pnpm --filter @duolabs/web e2e -g "bulk-print"  # green
```

### 5. Refactor — keep green

Now improve:
- Extract magic numbers to constants
- Move types to `lib/types.ts` if shared
- Improve a11y (`aria-label`, `role` if non-semantic)
- Apply `cn()` for class composition

After each change: re-run typecheck + tests.

### 6. Commit per phase

```bash
git add -A
git commit -m "[DUO-13] BulkPrintButton: red — failing E2E spec"
git commit -m "[DUO-13] BulkPrintButton: green — minimum implementation"
git commit -m "[DUO-13] BulkPrintButton: refactor — extract constants, a11y"
```

### 7. Push and open PR

```bash
git push -u origin fe-DUO-12-13-bulk-print-ui

gh pr create \
  --base us-DUO-12 \
  --title "FE: Bulk print button + selection UI" \
  --body "$(cat <<EOF
Refs: DUO-13, parent US-DUO-12

## Scope
- New BulkPrintButton component
- Selection state via TanStack Table
- usePermission gate for member role

## AC covered
- AC-1: selection states (disabled / active)
- AC-2: loading state via Skeleton

## Test plan
- E2E: \`bulk-print-button-disabled-when-empty\`, \`bulk-print-button-active-when-rows-selected\`
- All scenarios from BDD comment v1 mapped 1:1
EOF
)"
```

### 8. Hand off to reviewer

Run `multica-handoff` → `phase:rt-code-review`, reassign to `code-reviewer`.

## Hard rules (from CLAUDE.md)

These trigger automatic review failure if violated. Reviewer will reject.

- ❌ Business logic in `app/` routes (modules/ only)
- ❌ `console.log` (use `@duolabs/logs`)
- ❌ `any` (use `unknown` + narrowing)
- ❌ Skipping the contracts layer to call query functions from frontend
- ❌ Manual Zod schemas (derive from `drizzle-zod`)
- ❌ Cross-module imports inside `modules/admin/` (e.g., users importing roles)
- ❌ Hardcoded colors (use `tooling/tailwind/theme.css` tokens)
- ❌ `enabled: !!id` instead of `skipToken`
- ❌ `invalidateQueries` inside component callbacks (lives in `api.ts`)
- ❌ `mutate` when form needs sequential steps (use `mutateAsync` + try/catch)

## On reviewer rejection

If `code-reviewer` requests changes (you'll be @-mentioned), pull the issue context, fix in same branch, push, comment back. Do NOT close the PR.

```bash
git fetch && git checkout fe-DUO-12-13-bulk-print-ui
# ... fix ...
git commit -m "[DUO-13] Address review: <summary>"
git push
# Comment on Multica issue: "Review feedback addressed in commit <sha>. @code-reviewer please re-check."
```

## End (when reviewer approves and you've merged the PR)

```bash
gh pr merge --squash --delete-branch
```

The squash-merge into `us-DUO-12` is your final action. The card is now `phase:done` (set by `code-reviewer` on approve). When all sibling children also reach `phase:done`, `qa-tester` picks up the parent for `phase:rt-test`.
