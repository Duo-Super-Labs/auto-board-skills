---
name: tdd-be
description: Backend TDD workflow for Drizzle + oRPC + better-auth + pg-boss + Postgres stack. 5-layer API flow strictly enforced. Real Docker Postgres for tests, no DB mocks. References .claude/skills/db-recipe/ + api-recipe/ in the repo.
---

# TDD — backend

Used by `be-dev` agent during `phase=dev` (marker `domain=be`).

## Stack-expertise lives in repo

- `.claude/skills/db-recipe/` — schema, queries, migrations, multi-tenant
- `.claude/skills/api-recipe/` — oRPC procedures, middleware, errors
- `.claude/skills/orpc-contract-first/` — contract-first methodology
- `.claude/skills/better-auth-best-practices/` — auth integration
- `.claude/rules/api-architecture.mdc`, `.claude/rules/database-patterns.mdc`
- `CLAUDE.md` — 5-Layer API Data Flow, tenant invariant, RBAC

Read those FIRST. This skill is the orchestration layer ON TOP.

## Trigger

Child issue with `domain=be` + `phase=dev` assigned to you (`be-dev`).

## The 5-Layer flow (NEVER skip a layer)

```
Layer 1: packages/database/src/schema/<feature>.ts       Drizzle table
Layer 2: packages/database/src/schema/zod.ts             drizzle-zod, omit sensitive HERE
Layer 3: packages/database/src/query/<feature>.ts        pure fn(db, input)
Layer 4: packages/contracts/src/<feature>.ts             oRPC contract
Layer 5: packages/api/modules/<feature>/procedures/*.ts  protectedProcedure.use(...).handler()
```

## Steps

### 1. Read context

```bash
cat Product/personas.md Product/constraints.md Product/glossary.md
cat .claude/skills/db-recipe/SKILL.md
cat .claude/skills/api-recipe/SKILL.md
cat .claude/skills/orpc-contract-first/SKILL.md
cat .claude/rules/api-architecture.mdc

multica issue view <child-id>
multica issue view <parent-us-id>
```

### 2. Set up branch

```bash
git fetch origin
git checkout us-DUO-12
git pull --rebase
git checkout -b be-DUO-12-14-bulk-print-procedure
```

### 3. Bring up DB (if not already)

```bash
docker compose up -d
pnpm --filter @duolabs/database migrate
```

### 4. Red — write failing tests at every layer

**Test layer order:**

1. **Query function** (Layer 3) — Vitest Node + Real Docker Postgres
2. **Contract** (Layer 4) — type checks via `pnpm typecheck`
3. **Procedure** (Layer 5) — Vitest Node + `call(procedure, input, { context })` from `@orpc/server`

```typescript
// packages/database/src/query/__tests__/non-conformities.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../client";
import { bulkPrintNonConformities } from "../non-conformities";

describe("bulkPrintNonConformities (Layer 3)", () => {
  beforeEach(async () => { /* seed real DB */ });

  it("returns NCs scoped to organizationId only", async () => {
    const result = await bulkPrintNonConformities(db, {
      organizationId: "org-acme",
      ids: ["nc-1", "nc-2"],
    });
    expect(result).toHaveLength(2);
    expect(result.every(nc => nc.organizationId === "org-acme")).toBe(true);
  });

  it("ignores IDs from other organizations (tenant isolation)", async () => {
    const result = await bulkPrintNonConformities(db, {
      organizationId: "org-acme",
      ids: ["nc-acme-1", "nc-globex-1"],  // mixed
    });
    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBe("org-acme");
  });
});
```

```typescript
// packages/api/modules/admin/procedures/__tests__/bulk-print.test.ts
import { call } from "@orpc/server";
import { bulkPrintProc } from "../bulk-print";

describe("bulkPrintProc (Layer 5)", () => {
  it("returns 403 when caller's org doesn't match any of the IDs' orgs", async () => {
    await expect(
      call(bulkPrintProc, { ids: ["nc-globex-1"] }, {
        context: { /* alice from acme */ },
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
```

Run:

```bash
pnpm --filter @duolabs/database test
pnpm --filter @duolabs/api test
```

Both fail. Good.

### 5. Green — minimum implementation per layer

Implement Layer 1 → 2 → 3 → 4 → 5 in this order.

**Layer 1** — `packages/database/src/schema/non-conformities.ts`:
```typescript
export const nonConformity = pgTable("non_conformity", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id),
  // ...
});
```

**Layer 2** — `packages/database/src/schema/zod.ts`:
```typescript
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { nonConformity } from "./non-conformities";

export const nonConformitySelect = createSelectSchema(nonConformity);
// Sensitive fields omitted ONLY here, never elsewhere
```

**Layer 3** — `packages/database/src/query/non-conformities.ts`:
```typescript
export async function bulkPrintNonConformities(
  db: Database,
  { organizationId, ids }: { organizationId: string; ids: string[] }
) {
  return db.query.nonConformity.findMany({
    where: (nc, { and, eq, inArray }) =>
      and(eq(nc.organizationId, organizationId), inArray(nc.id, ids)),
  });
}
```

**Layer 4** — `packages/contracts/src/non-conformities.ts`:
```typescript
export const nonConformitiesContract = {
  bulkPrint: os
    .route({ method: "POST", path: "/admin/non-conformities/bulk-print" })
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .output(z.object({ url: z.string().url() })),
};
```

**Layer 5** — `packages/api/modules/admin/procedures/bulk-print.ts`:
```typescript
import { ORPCError } from "@orpc/server";
import { tenantMiddleware } from "../../../orpc/middleware/tenant-middleware";
import { permissionMiddleware } from "../../../orpc/middleware/permission-middleware";
import { protectedProcedure } from "../../../orpc/procedures";

export const bulkPrintProc = protectedProcedure
  .use(tenantMiddleware)
  .use(permissionMiddleware("NonConformities", "BulkPrint"))
  .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
  .handler(async ({ input, context }) => {
    const ncs = await bulkPrintNonConformities(db, {
      organizationId: context.orgId,
      ids: input.ids,
    });
    if (ncs.length !== input.ids.length) {
      throw new ORPCError("FORBIDDEN", { message: "Some IDs are not in your organization" });
    }
    const url = await generatePdf(ncs);
    return { url };
  });
```

### 6. Migration

If schema changed:

```bash
pnpm --filter @duolabs/database generate  # Drizzle generates migration
pnpm --filter @duolabs/database migrate    # apply locally
```

Commit the migration file.

### 7. Permission setup (if new resource/action)

Add to `packages/permissions`:

```typescript
// packages/permissions/src/resources.ts
export const RESOURCES = {
  // ...
  NonConformities: ["View", "Create", "Edit", "Delete", "BulkPrint"],
} as const;
```

Update role matrix accordingly. RBAC is COMPILE-TIME enforced — TS will fail if you reference an undefined resource:action.

### 8. Verify

```bash
pnpm typecheck                                 # all packages
pnpm --filter @duolabs/database test           # query layer
pnpm --filter @duolabs/api test                # procedure layer
pnpm --filter @duolabs/permissions test        # if matrix changed
```

All green.

### 9. Commit + push + PR

```bash
git add -A
git commit -m "[DUO-14] bulk-print: schema + zod + query (red-green)"
git commit -m "[DUO-14] bulk-print: contract + procedure with RBAC (red-green)"
git commit -m "[DUO-14] bulk-print: migration + permissions matrix"
git push -u origin be-DUO-12-14-bulk-print-procedure

gh pr create \
  --base us-DUO-12 \
  --title "BE: Bulk print procedure + PDF generation" \
  --body "$(cat <<EOF
Refs: DUO-14, parent US-DUO-12

## Scope
- New \`bulkPrint\` procedure (Layer 5)
- Tenant-scoped query (Layer 3)
- Permission: NonConformities:BulkPrint (member denied, admin/owner allowed)
- Migration: nothing schema-changing (uses existing nonConformity table)

## AC covered
- AC-3 (RBAC): permission middleware enforces
- AC-4 (tenant isolation): query scoped + handler verifies count match

## Test plan
- Layer 3: 2 query tests (happy + tenant isolation)
- Layer 5: 4 procedure tests (happy / FORBIDDEN tenant / FORBIDDEN role / validation)
EOF
)"
```

### 10. Hand off to reviewer

Run `multica-handoff` → `phase=rt-code-review`, reassign to `code-reviewer`.

## Hard rules (from CLAUDE.md — auto-fail at review)

- ❌ Skipping a layer (no calling query directly from procedure without contract)
- ❌ `permissionMiddleware` inside handler (must be in chain)
- ❌ Manual Zod schemas (derive from drizzle-zod)
- ❌ Catching and re-throwing `ORPCError` (let it propagate)
- ❌ Returning error objects from handlers (always `throw`)
- ❌ Sensitive field omission outside `schema/zod.ts`
- ❌ Queries without `organizationId` scope (multi-tenant invariant)
- ❌ Mocking the DB in tests (Real Docker Postgres only)
- ❌ `enums` (use `as const` maps)

## On reviewer rejection

Same flow as fe-dev: fix in same branch, push, @ reviewer to re-check.

## End

PR merged into `us-DUO-12` (squash-merge). Card → `phase=done` (set by reviewer).
