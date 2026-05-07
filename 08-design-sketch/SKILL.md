---
name: design-sketch
description: Design phase — produces a textual wireframe (ASCII layout + component map + states) using @duolabs/ui components. No JSX. Mobile + desktop. Empty/loading/error states mandatory.
---

# Design sketch

Used by `designer` agent during `phase:design-doing`.

## Why textual

We don't have a Figma/Penpot integration yet. Textual sketches are:
- Versionable in the issue
- Readable by downstream agents (qa-planner extracts UI element names for BDD; devs use as map)
- Diffable in comments

When Figma comes online, this skill upgrades.

## Input

- `## Acceptance Criteria` from issue description
- `Product/personas.md`, `Product/glossary.md` from workdir
- Design system: `.multica/project/resources.json` should list `Duo-Super-Labs/ai-ui` repo. Read its component inventory: `cat .multica/project/resources.json | jq '.resources[] | select(.name=="ai-ui")'` and clone if needed.
- Local: `tooling/tailwind/theme.css` for tokens

## Output — exactly this structure (one comment)

```markdown
## Design — sketch v1

### Component inventory (from @duolabs/ui)
- Layout: `PageContainer (variant=full)`, `PageHeader`, `PageToolbar`, `ContentCard`
- Data: `DataTable.Root` + `DataTable.Toolbar` + `DataTable.Search` + `DataTable.Footer`
- Action: `Button (variant=outline | default | destructive)`, `Sheet`, `Dialog`
- Form: `Form` + `FormField` + `Input` + `Checkbox`
- Feedback: `Skeleton`, `Spinner`, `Sonner toast`

### Desktop layout (≥768px)

\`\`\`
┌────────────────────────────────────────────────────────────┐
│ PageHeader                                                 │
│ ┌─────────────────────────┐  ┌──────────────┬───────────┐ │
│ │ Non-conformities        │  │ + New (admin)│ Bulk print│ │
│ │ 124 records             │  │              │  (3 sel)  │ │
│ └─────────────────────────┘  └──────────────┴───────────┘ │
├────────────────────────────────────────────────────────────┤
│ PageToolbar                                                │
│ [🔍 Search…    ]  [Status ▾] [Severity ▾]  [Filter ⚙]    │
├────────────────────────────────────────────────────────────┤
│ ContentCard (DataTable)                                    │
│ ☐ │ Code   │ Title              │ Status │ Severity │ ⋯  │
│ ☑ │ NC-001 │ Wrong label batch  │ Open   │ High     │    │
│ ☑ │ NC-002 │ Missing serial     │ Closed │ Medium   │    │
│ ☑ │ NC-003 │ Duplicate entry    │ Open   │ Low      │    │
│ ☐ │ NC-004 │ ...                │ Open   │ High     │    │
├────────────────────────────────────────────────────────────┤
│ DataTable.Footer    «  1  2  3  >    25 / page ▾          │
└────────────────────────────────────────────────────────────┘
\`\`\`

### Mobile layout (<768px)

\`\`\`
┌────────────────────────┐
│ ☰  Non-conformities    │
│ 124 records            │
├────────────────────────┤
│ [🔍 Search…         ]  │
│ [Filters ⚙ (2)      ]  │
├────────────────────────┤
│ ☑ NC-001 [High]        │
│   Wrong label batch    │
│   Open · 2d ago        │
│ ─────────────────────  │
│ ☑ NC-002 [Medium]      │
│   ...                  │
├────────────────────────┤
│ ┌──────────────────┐   │
│ │ 🖨 Print 3 sel.  │   │ ← floating button when selection > 0
│ └──────────────────┘   │
└────────────────────────┘
\`\`\`

### States (per AC)

| AC | State | Component | Behavior |
|---|---|---|---|
| AC-1 (selection) | 0 selected | `Button (disabled)` | "Bulk print" disabled, gray |
| AC-1 | ≥1 selected | `Button` + count badge | Active, label "Bulk print (3 sel)" |
| AC-2 (loading) | Loading | `Skeleton` × 5 rows | Replaces table body |
| AC-2 | Empty (no NCs) | `EmptyState` | "No records found." |
| AC-2 | Filter empty | `EmptyState` | "No matches. Clear filters." with reset button |
| AC-3 (perm) | member role | Button hidden | RBAC via `usePermission('NonConformities','BulkPrint')` |
| AC-4 (error) | API error | `toast.error(message)` | Sonner toast bottom-right |
| AC-4 | Tenant violation | `toast.error('Forbidden')` | Same toast, generic message |

### Tokens used
- `--primary` (button bg)
- `--destructive` (error toast)
- `--muted` (skeleton)
- `--header-height: 64px`, `--sidebar-width: 240px`

### URL state (nuqs)
- `?search=<q>` — search query
- `?status=<csv>` — status filter
- `?page=<n>&pageSize=<n>` — pagination
- Selection is NOT persisted in URL (transient)

### Open questions
- [ ] PDF format default — A4 portrait? User-configurable?
- [ ] Max selection — should there be a hard cap (e.g. 100)?

### Refs
- AC-1 through AC-N (issue description)
- Personas: <Persona> (Product/personas.md)
- Components: `@duolabs/ui` barrel + `@duolabs/ui/components/data-table`
```

## Hard rules

- NEVER write JSX or actual component code
- ALWAYS map to existing `@duolabs/ui` components — propose new ones in "Open questions" only
- ALWAYS include desktop AND mobile layouts (responsive is a hard requirement of the stack)
- ALWAYS include empty + loading + error states for every data-fetching AC
- ALWAYS use `tooling/tailwind/theme.css` tokens — never hex colors
- NEVER skip RBAC consideration when persona has role differentiation

## On feedback from refinement

If `pm-refiner` @-mentions you with concerns, reply with sketch v2 in a new comment. Do NOT edit the v1 comment (history matters).

## End

Run `multica-handoff` → `phase:rt-test-plan`, reassign to `qa-planner`.
