---
name: code-review
description: Multi-domain code review router. Detects domain=* label on the issue and applies the matching rule set (FE / BE / E2E). Reuses local .claude/agents/code-reviewer.md and .claude/rules/. Outputs verdict APPROVE or CHANGES REQUESTED.
---

# Code review

Used by `code-reviewer` agent during `phase=rt-code-review` and `phase=code-review`.

## Trigger

Child issue with `phase=rt-code-review` label and an open PR (linked in PR body or auto-detected via branch name).

## Routing by domain

```bash
# Detect domain from labels
multica issue view <id> --json labels | jq -r '.labels[] | select(startswith("domain=")) | .'
```

| `domain=*` | Rule sets to apply |
|---|---|
| `domain=fe` | `.claude/skills/frontend-recipe/`, `.claude/rules/ui-and-styling.mdc`, `.claude/rules/syntax-and-formatting.mdc`, `.claude/rules/typescript-usage.mdc` |
| `domain=be` | `.claude/skills/api-recipe/`, `.claude/skills/db-recipe/`, `.claude/skills/orpc-contract-first/`, `.claude/rules/api-architecture.mdc`, `.claude/rules/database-patterns.mdc`, `.claude/rules/key-principles.mdc` |
| `domain=qa-e2e` | `apps/web/tests/fixtures.ts`, `.claude/rules/testing-architecture.mdc`, CLAUDE.md "E2E conventions" |

Always also apply universal rules: `.claude/rules/naming-coventions.mdc`, `.claude/rules/performance.mdc`, `CLAUDE.md` "NEVER DO" list.

## Steps

### 1. Get the PR

```bash
PR_NUM=$(gh pr list --head <branch-name> --json number -q '.[0].number')
gh pr view $PR_NUM --json files,additions,deletions,title,body,baseRefName
```

Verify `baseRefName` is `us-<N>`, NOT `main`. If targeting `main`, that's an automatic blocker.

### 2. Read the diff

```bash
gh pr diff $PR_NUM > /tmp/diff.patch
wc -l /tmp/diff.patch  # informational
```

### 3. Read context

```bash
multica issue view <child-id> --include comments
multica issue view <parent-us-id> --include comments  # for AC + BDD
```

### 4. Apply rule set per domain

Reuse the local agent: `.claude/agents/code-reviewer.md` is the existing template reviewer. Read it as your base. Then layer per-domain=

#### Universal checks (every domain)

- [ ] Branch targets `us-<N>` (NOT main)
- [ ] Commit messages reference `[DUO-N]`
- [ ] No `console.log`
- [ ] No `any`
- [ ] CI green (typecheck + tests)
- [ ] No new files in `app/` with business logic
- [ ] No barrel `index.ts` inside `packages/` subdirectories
- [ ] No new package created without 3+ apps needing it (per CLAUDE.md)

#### `domain=fe` checks

- [ ] Component lives in `modules/<feature>/components/`
- [ ] `api.ts` owns `invalidateQueries` (not the component)
- [ ] Conditional queries use `skipToken` (not `enabled: !!id`)
- [ ] `mutateAsync` + try/catch in form submits; `mutate` for fire-and-forget
- [ ] Forms: react-hook-form + zodResolver + `@ui/components/form` primitives
- [ ] Form schema mirrors contract schema (no manual duplication)
- [ ] List item types derived from API output (`Awaited<ReturnType<...>>["data"][number]`)
- [ ] URL state via nuqs in `hooks/use-<feature>-filters.ts`
- [ ] Search debounced with `useDebounceValue(search, 300)`
- [ ] Loading: `Skeleton` (not spinner for page content)
- [ ] Errors: `ORPCError` code check + `toast.error()` for generic
- [ ] Semantic color tokens (no hex/oklch literals in component)
- [ ] No cross-module imports inside `modules/admin/`
- [ ] Components map to `@duolabs/ui` — no parallel ones built

#### `domain=be` checks

- [ ] 5-Layer flow respected (no skipping)
- [ ] Layer 1 (schema) — uses `pgTable`, FKs to `organization` where multi-tenant
- [ ] Layer 2 (zod.ts) — sensitive fields omitted ONLY here
- [ ] Layer 3 (query) — pure function `(db, input)`, no business logic, scoped by `organizationId`
- [ ] Layer 4 (contract) — Zod input/output, no server imports
- [ ] Layer 5 (procedure) — chain: `protectedProcedure.use(tenantMiddleware).use(permissionMiddleware(R, A))`
- [ ] Permission middleware is in chain (not in handler body)
- [ ] `ORPCError` thrown (never returned, never caught + re-thrown)
- [ ] Tests use Real Docker Postgres (no DB mocks)
- [ ] Procedure tests use `call(procedure, input, { context })`
- [ ] No `enums` (use `as const` maps)
- [ ] If new resource: added to `packages/permissions` with role matrix updated
- [ ] If new endpoint: tenant isolation test included
- [ ] Migration file present and applied locally without errors

#### `domain=qa-e2e` checks

- [ ] Spec lives in `apps/web/tests/e2e/admin/<feature>/`
- [ ] Imports `test, expect` from `../../fixtures` (NOT `@playwright/test`)
- [ ] `test()` names match BDD scenarios verbatim (kebab-case)
- [ ] Per-role pages used for RBAC scenarios (`page`, `memberPage`, `adminPage`)
- [ ] Mutating tests target ISOLATED fixtures (never `E2E_USER` or system roles)
- [ ] Feature-flagged tests call `test.skip()` when flag is off
- [ ] All BDD scenarios from upstream comment are covered (1:1)
- [ ] Tenant isolation test present for any data feature

### 5. Classify findings

For each finding:
- **🚨 BLOCKER** — must fix before merge (correctness, security, multi-tenant, RBAC, missing tests)
- **⚠️ SUGGESTION** — should fix; would improve code (refactor, naming, performance)
- **💡 NIT** — optional polish (whitespace, comment, var name)

### 6. Comment on Multica issue (NOT GitHub PR)

```markdown
## Review v1 — <APPROVE | CHANGES REQUESTED>

PR: #<num>  •  Domain: `domain=fe`  •  Diff: +<N> -<N> across <K> files

### 🚨 Blockers
- `apps/web/modules/admin/non-conformities/components/BulkPrintButton.tsx:42` — `console.log` left in. Remove (or use `@duolabs/logs`).
- `apps/web/modules/admin/non-conformities/api.ts:18` — `enabled: !!id` should be `skipToken`. See CLAUDE.md "Conditional queries".

### ⚠️ Suggestions
- `BulkPrintButton.tsx:60` — magic number `100` (max selection). Extract to `MAX_BULK_PRINT_SELECTION` constant.

### 💡 Nits
- `api.ts:25` — query key array could include only `debouncedSearch` (not raw `search`).

### Test coverage
- ✅ All 7 BDD scenarios mapped to Playwright tests
- ✅ RBAC scenario present
- ⚠️ Missing tenant isolation E2E (data feature requires it per CLAUDE.md)

### Verdict
🚧 **CHANGES REQUESTED** — 2 blockers, 1 missing test scenario. @<original-dev> please address.

OR

✅ **APPROVE** — all checks pass. @<original-dev> you may squash-merge into us-<N>.
```

### 7. Trigger fix or close

**If CHANGES REQUESTED:**
- Card stays at `phase=code-review` (do NOT handoff)
- Comment includes `@fe-dev` (or `@be-dev`) to trigger fix task on the same agent
- They fix and re-comment when done; you re-review (Review v2 in a new comment)

**If APPROVE:**
- Run `multica-handoff` → `phase=done` for the child
- Reassign back to original dev (`fe-dev` or `be-dev`) — they merge the PR
- Comment: `Approved. @<dev> please squash-merge.`

### 8. Watch for last-sibling

After child merges and reaches `phase=done`, check siblings:

```bash
multica issue list --parent <us-id> --output json \
  | jq '[.[] | select(.description | test("phase=done") | not)]'
```

If empty, the parent US is ready for `phase=rt-test`. Update the parent:

```bash
multica issue update <us-id> \
  --remove-label "phase=dev" \
  --add-label "phase=rt-test" \
  --status in_review \
  --assignee qa-tester
```

Comment on parent: `All children merged. → @qa-tester for E2E.`

## Hard rules

- NEVER push commits — only comment
- NEVER merge PRs — only the original dev (or human) merges
- NEVER approve your own code — by design you're separated from `fe-dev`/`be-dev`
- ALWAYS verify CI is green before approving (re-run if stale)
- ALWAYS re-check after CHANGES REQUESTED — don't approve based on dev's word, verify the diff

## What this skill does NOT do

- Does NOT write or modify code
- Does NOT run tests (CI does that)
- Does NOT decide product/design — that's frozen by the time you see it
