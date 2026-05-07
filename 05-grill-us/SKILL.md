---
name: grill-us
description: Backlog phase — produces a User Story from personas + constraints + a theme/idea. Inspired by grill-me but outputs a structured US ready for Product Planning.
---

# Grill US

Used by `pm-grooming` agent during `phase=backlog`.

## Trigger

You are assigned an issue with `phase=backlog` label. The issue typically has:
- A title or seed idea (could be vague: "Print non-conformities feature")
- Sometimes a comment from a human with rough requirements

If empty, comment asking the human for the seed idea and pause.

## Output

Update the issue's title + description to:

### Title
`US-<Issue-Num>: <one-line feature name>`

Example: `US-DUO-12: Bulk-print non-conformities from listing screen`

### Description (this exact structure — downstream skills depend on it)

```markdown
## User Story

As a **<persona name from Product/personas.md>**
I want to **<capability>**
So that **<outcome>**.

## Personas Involved
- Primary: **<persona>** (their goal: ...)
- Secondary: **<persona>** (their concern: ...)

## Why now
<1-2 sentences referencing journeys.md or constraints.md — what triggered this US>

## Out of scope
- <thing 1>
- <thing 2>
- <thing 3>

## Open questions
- [ ] <thing pm-grooming couldn't answer alone>
```

> The `## Acceptance Criteria` section is NOT filled by you — that's `phase=product-planning` (next phase).

## Grilling protocol

If the seed idea is unclear, you MUST grill via comments BEFORE writing the US. Decision tree:

1. **Persona**: Which persona is this for? If the seed mentions roles ("admin can..."), find the persona that matches. If unclear, ask.
2. **Capability**: What does the persona literally do? Replace nouns with verbs ("print" not "printing").
3. **Outcome**: Why does the persona want this? The "so that" clause is the value — if you can't fill it, the US isn't worth doing.
4. **Personas involved**: Who else interacts? (e.g., the seller who creates the listing also affects the buyer who reads it).
5. **Why now**: What triggered this — pain in journeys.md? regulatory deadline? competitor parity? If "no reason," reject.
6. **Out of scope**: At least 3 things to set boundaries (otherwise scope creeps in Product Planning).

## Grilling format

Make grilling **one question per comment** — Multica's @mention triggers per comment.

```
Hey, I'm grilling US-DUO-12 in the Backlog phase. First question:

**Which persona is the primary user here?** Looking at Product/personas.md I see:
- Casual Buyer (browses + buys)
- Seller Pro (lists + ships)
- Marketplace Admin (moderates)

Which one is bulk-printing for? @<human-handle>
```

Wait for human reply. Then ask next question. Iterate until US is complete.

## Hard rules

- NEVER write Acceptance Criteria here — that's the next phase
- NEVER reference implementation (no "we'll add a button", no API names)
- NEVER skip grilling — fabricated personas/outcomes are technical debt
- NEVER guess at "why now" — if not clear from `Product/`, ask
- ALWAYS map to an existing persona — no inline persona invention
- ALWAYS link to journey step if applicable: "Refs: journeys.md#bulk-print-pain"

## End

Once description is complete, `multica-handoff` → `phase=product-planning` (still self-assigned; same agent fills AC).
