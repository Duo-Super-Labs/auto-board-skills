---
name: read-product-context
description: Foundation skill — reads the product's Lean Inception artifacts from the workdir before any work. Run as your FIRST step on every task.
---

# Read product context

The first thing you do on every task in this workspace.

## What it does

Reads `Product/*.md` from the task workdir to load the product's vision, personas, constraints, and glossary into your working context.

## Steps

1. Verify `Product/` exists in the workdir root:
   ```bash
   test -d Product || echo "MISSING: Product/"
   ```

2. If `Product/` is missing, **STOP immediately** and comment on the issue:
   > 🚨 Cannot proceed. `Product/` folder is missing. Run `bootstrap-product` skill in a chat session with `pm-grooming` agent first.

3. Read all six files in this order:
   ```bash
   cat Product/vision.md      # WHY: mission, positioning
   cat Product/personas.md    # WHO: user archetypes with goals/frustrations
   cat Product/journeys.md    # WHEN: user journeys per persona
   cat Product/features.md    # WHAT: feature canvas, MVP slice
   cat Product/constraints.md # LIMITS: technical, business, regulatory
   cat Product/glossary.md    # LANGUAGE: ubiquitous domain terms
   ```

4. Internalize. These are the source of truth for:
   - Naming (always use glossary terms)
   - User-story framing (always reference a persona)
   - Acceptance criteria (must respect constraints)
   - Edge cases (derive from journeys + personas frustrations)

## When in doubt

If the issue contradicts `Product/`, prefer `Product/`. Comment on the issue noting the contradiction and @ mention `pm-refiner` for resolution.

## Stack expertise lives elsewhere — explicit delegation map

`Product/*.md` answers WHAT to build. For HOW, you delegate to the duo-admin template's `.claude/` assets, which travel with every fork. Each agent role has a different subset to consult.

### Cross-cutting (every agent)

- `CLAUDE.md` (repo root) — full project guidelines: 5-Layer API flow, multi-tenant invariant, RBAC matrix, NEVER-DO list
- `.claude/rules/about-the-project.mdc` — tenant isolation rules + organization plugin
- `.claude/rules/key-principles.mdc` — code-style invariants (no `any`, function keyword, immutables)
- `.claude/rules/naming-coventions.mdc` — file/identifier naming
- `.claude/knowledge/decisions/` — historical engineering decisions you should not relitigate
- `.claude/knowledge/assumptions/` — environment + framework assumptions

### Frontend agents (`fe-dev`, `qa-tester` for E2E, `code-reviewer` when `domain=fe`)

- `.claude/skills/frontend-recipe/` — module anatomy, api.ts pattern, mutate vs mutateAsync, route wrapper pattern, settings/listing/form templates
- `.claude/skills/data-table/` — `useCreateTable` + DataTable compound components (use this for ANY listing page)
- `.claude/skills/sidebar-navigation/` — Sidebar compound + SidebarConfig (use when adding nav items)
- `.claude/rules/ui-and-styling.mdc` — Tailwind tokens, theme.css, oklch
- `.claude/rules/syntax-and-formatting.mdc` — TypeScript style
- `.claude/rules/typescript-usage.mdc` — strict mode quirks, unknown over any

### Backend agents (`be-dev`, `code-reviewer` when `domain=be`)

- `.claude/skills/api-recipe/` — oRPC procedure layout, middleware chain, handler patterns
- `.claude/skills/db-recipe/` — Drizzle schema, drizzle-zod (sensitive field omission), pure query functions
- `.claude/skills/orpc-contract-first/` — contract-first methodology, Layer 4 disciplines
- `.claude/skills/better-auth-best-practices/` — better-auth integration patterns
- `.claude/skills/auth-feature/` — auth layer recipe (organization plugin, magicLink, passkey, openAPI, Hono handler wiring)
- `.claude/rules/api-architecture.mdc` — middleware order, ORPCError throw conventions
- `.claude/rules/database-patterns.mdc` — multi-tenant query rules
- `.claude/rules/performance.mdc` — pagination, caching, N+1 avoidance

### Test agents (`qa-planner`, `qa-tester`)

- `.claude/rules/testing-architecture.mdc` — Real Docker Postgres mandate, no DB mocks, Vitest layering
- `apps/web/tests/fixtures.ts` — per-role pages (`page`, `memberPage`, `adminPage`) + `E2E_USER` / `E2E_ORG` fixtures
- `apps/web/tests/auth.setup.ts` — storageState save/load
- `apps/web/tests/global-setup.ts` — DB migration + seed before suite

### Reviewer (`code-reviewer`)

- `.claude/agents/code-reviewer.md` — the existing local Claude Code subagent template. Multica's `code-reviewer` extends this template — read it as your base, then layer the per-domain rules above.
- `.claude/rules/project-structure.mdc` — module boundaries, directory anatomy

### When unsure of a recipe path

Run `find .claude -name 'SKILL.md' -o -name '*.mdc' | head -20` to enumerate what exists in this fork — different forks may have evolved slightly different recipes.
