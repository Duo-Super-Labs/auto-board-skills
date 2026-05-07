---
name: branch-conventions
description: Branch hierarchy, naming, and merge policy for the auto-board pipeline. Three levels — main ← us-N ← {fe,be,qa}-N-slug.
---

# Branch conventions

## Hierarchy (three levels)

```
main                          ← stable; only merged after Homologation
└── us-DUO-12                 ← User Story branch (one per US); created by task-breaker
    ├── fe-DUO-12-13          ← Frontend child task (DUO-13 is child issue)
    ├── be-DUO-12-14          ← Backend child task
    └── qa-DUO-12-e2e         ← E2E spec task
```

## Naming

| Branch | Pattern | Example |
|---|---|---|
| US parent | `us-<ISSUE-NUM>` | `us-DUO-12` |
| FE child | `fe-<US-NUM>-<CHILD-NUM>-<slug>` | `fe-DUO-12-13-login-form` |
| BE child | `be-<US-NUM>-<CHILD-NUM>-<slug>` | `be-DUO-12-14-login-procedure` |
| QA child | `qa-<US-NUM>-e2e` | `qa-DUO-12-e2e` |
| Fix from QA failure | `fix-<US-NUM>-<NEW-CHILD-NUM>-<slug>` | `fix-DUO-12-22-empty-state` |

`<slug>` is kebab-case, ≤4 words, derived from the child issue title.

## Rules (NEVER violate)

1. **Children NEVER target `main`.** Always target the parent `us-<N>` branch.
2. **Children are squash-merged into us-N.** Keep history small.
3. **`us-<N>` is rebased onto `main`** before merging when QA passes — keeps `main` linear.
4. **`us-<N>` → `main` is a merge commit** (not squash) — preserves the US-as-feature unit for revert.
5. **Only humans merge `us-<N>` into `main`** (Homologation gate). Agents never push to `main`.
6. **One branch per child issue.** No reusing branches across issues.
7. **Force-push only on YOUR own child branch** before review starts. Never force-push `us-<N>` or `main`.

## Commit messages

Every commit references its issue number:

```
[DUO-13] Add login form with validation

- React Hook Form + Zod resolver
- Email + password fields
- Maps backend ORPCError CONFLICT to field-level error

Refs: parent US-DUO-12
```

## Creating the branch (task-breaker)

```bash
git fetch origin main
git checkout main
git pull --rebase
git checkout -b us-DUO-12
git push -u origin us-DUO-12
```

## Creating a child branch (fe-dev / be-dev)

```bash
git fetch origin
git checkout us-DUO-12
git pull --rebase
git checkout -b fe-DUO-12-13-login-form
# ... do TDD ...
git push -u origin fe-DUO-12-13-login-form
gh pr create --base us-DUO-12 --title "FE: Login form" --body "Refs: DUO-13, parent US-DUO-12"
```

## Closing a child branch

After review approves and merges into `us-<N>`:

```bash
git push origin --delete fe-DUO-12-13-login-form
```

## Squash policy

- Children → us-N: **squash-merge** (single commit per child task)
- us-N → main: **merge commit** (preserves the squash-commits as US history)
