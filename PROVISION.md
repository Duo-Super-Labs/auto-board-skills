# Provisioning a new product

How to add a new product to the auto-board pipeline.

## Prerequisites

- Multica self-hosted running locally (default `localhost:3000` + `:8080`)
- `multica` CLI installed + authenticated (`multica auth status` OK)
- Daemon running (`multica daemon status` OK) with `claude` CLI detected
- `gh` CLI authenticated to `Duo-Super-Labs` org
- `jq` installed
- Env: `GH_TOKEN`, `DATABASE_URL` (will be passed to relevant agents)

## Step 1 — Fork `admin` to your new product

```bash
gh repo create Duo-Super-Labs/<product-slug> --template Duo-Super-Labs/admin --private
```

Clone it and `pnpm install` once locally to make sure it's healthy:

```bash
gh repo clone Duo-Super-Labs/<product-slug>
cd <product-slug>
pnpm install
docker compose up -d
pnpm --filter @duolabs/database migrate
pnpm typecheck
```

If green, you're ready.

## Step 2 — Provision the Multica workspace

From the `auto-board-skills` repo:

```bash
cd /path/to/auto-board-skills
./scripts/provision-product-workspace.sh \
  <product-slug> \
  https://github.com/Duo-Super-Labs/<product-slug>
```

Optionally pass a vision-summary file (≤500 words) as the third arg — it becomes the workspace context (visible to all agents).

```bash
./scripts/provision-product-workspace.sh duozada \
  https://github.com/Duo-Super-Labs/duozada \
  ./drafts/duozada-vision-summary.md
```

This creates:
- Multica workspace `<product-slug>`
- Project `MVP` with the product repo as a `github_repo` resource
- Whitelist of 3 repos (product fork + ai-ui + admin)
- 15 skill imports (14 + the playwright-smoke split-out)
- 9 agents with instructions, models, concurrency, and skill mounts
- Custom env (`GH_TOKEN`, `DATABASE_URL`) on relevant agents

Total time: ~30s.

## Step 3 — Bootstrap the product (one-shot)

Open a chat session with `pm-grooming`:

```bash
./scripts/bootstrap-product-chat.sh <product-slug>
```

This opens the Multica chat URL in your browser with a pre-filled message that triggers `bootstrap-product` skill. Answer the grilling questions. The agent will produce six `Product/*.md` files and open a PR.

Merge the PR → bootstrap is done forever for this product.

## Step 4 — First US

Two options:

**Option A — chat with pm-grooming**
```
Run skill grill-us. Seed: I want admins to be able to bulk-print non-conformities.
```

The agent grills you, produces a US, opens an issue with `phase:backlog`, then `phase:product-planning`. After Product Planning is done, it auto-handoffs to `designer`.

**Option B — manual issue creation**
Create an issue in Multica UI with `phase:backlog` label and assign to `pm-grooming`. They'll pick it up.

## Step 5 — Watch the flow

The pipeline is event-driven from here on. Cards move through:

```
phase:backlog
  → phase:product-planning      (pm-grooming)
  → phase:rt-design             (designer)
  → phase:design-doing          (designer)
  → phase:rt-test-plan          (qa-planner)
  → phase:test-planning         (qa-planner)
  → phase:rt-refinement         (pm-refiner)
  → phase:refinement            (pm-refiner)
  → phase:rt-dev                (task-breaker)
  → phase:dev                   (children: fe-dev, be-dev)
  → phase:rt-code-review        (children → code-reviewer)
  → phase:code-review           (code-reviewer)
  → phase:rt-test               (parent → qa-tester)
  → phase:test                  (qa-tester)
  → phase:homologation          (HUMAN — you)
  → phase:done                  (after you merge us-N → main)
```

You only act at `phase:homologation`.

## Tearing down

```bash
multica workspace delete <product-slug>
```

Removes workspace, agents, skills imports, projects, and all issues. Local Docker DB and the product repo are untouched.

## Troubleshooting

### Agent stuck on a task

```bash
multica issue tasks <issue-id> --status running,queued
multica issue tasks <issue-id> --cancel <task-id>
```

### Skills not appearing in workdir

The daemon writes them to `.claude/skills/<name>/SKILL.md` per task. If missing, check daemon logs:

```bash
multica daemon logs -f
```

### Reassign cancelled work

Multica cancels ALL active tasks on reassign. Always verify no running tasks before reassigning (especially in Refinement). See `03-multica-handoff/SKILL.md` "Reassign safety".
