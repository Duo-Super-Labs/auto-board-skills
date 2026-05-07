---
name: bootstrap-product
description: One-shot Lean Inception via grilling. Populates Product/*.md (vision, personas, journeys, features, constraints, glossary) for a freshly-forked admin starter. Run once per product, in a CHAT session with pm-grooming.
---

# Bootstrap product

Runs ONCE per product, in a **chat session** with `pm-grooming` (chat is sandbox — needed because `Product/` doesn't exist yet, so issue-context tasks can't reference it).

## When to run

- Right after forking `admin` to a new product repo (e.g., `duozada`)
- Before creating the first US (Backlog phase requires `Product/`)

## How to run

1. Open Multica → Chat → New session with `pm-grooming`
2. First message: `Run skill bootstrap-product. Repo: <repo-url>. Product: <name>.`
3. Follow the grilling — answer one question at a time
4. At the end, the agent commits 6 files to the product repo's `main` branch

> **Helper script**: `scripts/bootstrap-product-chat.sh <product-slug>` opens the chat with the right context pre-filled.

## Methodology — Lean Inception (Caroli)

Six artifacts, generated in order. Each builds on the previous.

### 1. Vision (`Product/vision.md`)

Vision board template:

```markdown
# Vision — <Product>

## For (target customer)
<who this is for>

## Who (need)
<the unmet need>

## The (product name)
<one-line definition>

## Is a (product category)
<the category — e.g. "marketplace", "SaaS admin panel">

## That (key benefit)
<the single primary outcome>

## Unlike (competitor / alternative)
<what exists today and why it falls short>

## Our product (key differentiator)
<the differentiator in one sentence>
```

Grill: ask the human for each line. If unclear, propose 2 options and let them pick.

### 2. Personas (`Product/personas.md`)

3-5 personas. Per persona:

```markdown
## <Persona Name>

- **Role:** <e.g. "Casual buyer">
- **Demographics:** <age range, location, tech comfort>
- **Goals:** <what they want to accomplish>
- **Frustrations:** <what's annoying today>
- **Tech context:** <devices, network, accessibility needs>
- **Sample quote:** "<a thing they would say>"
```

Grill: anchor in real users the human knows. Avoid stock personas.

### 3. Journeys (`Product/journeys.md`)

One journey per persona's primary goal. Format:

```markdown
## <Persona> wants to <accomplish goal>

| Step | Action | Touchpoint | Pain | Opportunity |
|---|---|---|---|---|
| 1 | ... | ... | ... | ... |
```

3-7 steps per journey. Grill for at least one pain point per step.

### 4. Features (`Product/features.md`)

Feature canvas with MVP slice highlighted:

```markdown
# Features

## Must-have (MVP)
- [ ] <Feature> — <persona, why>
- [ ] ...

## Should-have (next)
- [ ] ...

## Could-have (later)
- [ ] ...

## Won't-have (out of scope)
- [ ] ...

## MVP slice (the thinnest end-to-end)
<3-7 features that, together, prove the value end-to-end>
```

Grill: enforce that MVP slice is THIN. If >7 features, push back.

### 5. Constraints (`Product/constraints.md`)

```markdown
# Constraints

## Technical
- Stack: <inherited from admin: Next.js 16 + Drizzle + oRPC + better-auth + ...>
- Multi-tenant by `organizationId` (admin invariant)
- <product-specific stack additions if any>

## Business
- <pricing model, target market, regulatory>

## Non-functional (NFR)
- Latency p95: <target>
- Availability: <target>
- i18n: <languages>
- Accessibility: <WCAG level>
- Mobile: <requirements>

## Compliance / regulatory
- <LGPD, GDPR, PCI, etc., if applicable>

## Hard "no"s
- <things this product will not do, ever>
```

### 6. Glossary (`Product/glossary.md`)

Ubiquitous language. 10-30 terms.

```markdown
# Glossary

| Term | Definition | Notes |
|---|---|---|
| **Listing** | A product offered for sale on the marketplace | Owned by a Seller; in one Category |
| **Seller** | Account-holder who creates Listings | Subset of User with role:seller |
```

Grill: any term the human says that isn't already defined → add it.

## Output

When all six are drafted:

1. `cd <product-repo-workdir>`
2. `mkdir -p Product`
3. Write all six files
4. `git checkout -b bootstrap-product`
5. `git add Product/ && git commit -m "[bootstrap] Lean Inception artifacts"`
6. `gh pr create --base main --title "Bootstrap: Lean Inception artifacts" --body "Initial Product/ folder"`
7. Comment in chat: "Done. PR <url> opened against main. Merge to enable Backlog phase."

## After merge

- `bootstrap-product` is done forever for this product
- Future updates to `Product/` happen via normal PR flow

## Hard rules

- NEVER skip the grilling — agents that fabricate personas produce stock content
- NEVER write more than 5 personas (cognitive overload downstream)
- NEVER include implementation details in `Product/` (those go in code)
- NEVER skip a chat session for this — it MUST be interactive with the human
