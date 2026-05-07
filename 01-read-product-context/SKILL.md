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

## Stack expertise lives elsewhere

For HOW to implement (TypeScript patterns, oRPC contracts, Drizzle schemas, Playwright fixtures), read `.claude/skills/` and `.claude/rules/` already present in the repo — those are stack-specific and shipped with the `admin` template.
