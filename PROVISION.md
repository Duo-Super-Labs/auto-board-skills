# Provisioning a new product

How to add a new product to the auto-board pipeline. Calibrated against multica CLI **v0.2.26**.

## Per-product Docker stack isolation

The `duo-admin` template's `docker-compose.yml` has fixed container names (`duolabs_postgres`, `duolabs_postgres_test`, `duolabs_minio`, `duolabs_mailpit`) and fixed host ports (5432, 5433, 9000, 9001, 1025, 8025). Two forks running `docker compose up -d` simultaneously would collide on container names AND ports.

We solve this with `port-registry.json` + per-product `docker-compose.override.yml`:

- **`port-registry.json`** at the repo root assigns each product a 10-port slot (offset 0 = base, offset 1 = base+10, etc.)
- **`scripts/product-stack.sh`** runs on the WSL host. Generates `~/.auto-board-stacks/<slug>/{docker-compose.override.yml,.env}` from the registry. Boots the stack with `COMPOSE_PROJECT_NAME=<slug>` so containers/networks/volumes are namespaced.

### Adding a new product to the registry

```bash
jq '.products.genebra = {
  "offset": 1,
  "postgres": 5442,
  "postgres_test": 5443,
  "minio_api": 9010,
  "minio_console": 9011,
  "mailpit_smtp": 1035,
  "mailpit_ui": 8035
} | ."$next_available_offset" = 2' port-registry.json > tmp && mv tmp port-registry.json
```

Pattern: each port = base + offset×10.

The provision script auto-derives `DATABASE_URL` for each agent from this registry — you don't pass `DATABASE_URL` manually anymore (any env var is overridden by the registry value).

### Booting/stopping a stack on the WSL host

```bash
# From inside the agent's workdir (after cloning the product repo):
~/auto-board-skills/scripts/product-stack.sh up duozada "$PWD"
~/auto-board-skills/scripts/product-stack.sh status duozada
~/auto-board-skills/scripts/product-stack.sh down duozada "$PWD"      # preserves volumes
~/auto-board-skills/scripts/product-stack.sh nuke duozada "$PWD"      # DESTRUCTIVE
```

Skills like `12-tdd-be/SKILL.md` reference this wrapper. **Agents must NEVER run `docker compose up -d` directly** — it would boot with the template's hardcoded container names and break inter-product isolation.

## Known CLI gaps (v0.2.26) — workarounds embedded in skills

| Gap | Impact | Workaround |
|---|---|---|
| `multica workspace create` doesn't exist | Workspace must be created via UI | Provision script validates workspace exists by slug before proceeding |
| `multica chat` doesn't exist | Chat sessions can't be created via CLI | `bootstrap-product-instructions.sh` outputs URL + paste-ready first message |
| `multica issue create --label` doesn't exist | Phase / domain can't be tagged as labels at creation | Encode in description first line: `<!-- multica-board-state: phase=X domain=Y -->` |
| `multica issue update --add-label` doesn't exist | Phase changes can't update labels | Same — rewrite the first-line marker on every handoff |
| `multica issue create --depends-on` doesn't exist | QA child can't declare blocker on FE+BE siblings | Use status `blocked` on QA child + qa-tester polling for `phase=rt-test` |
| `multica issue comment` may not exist (TODO verify) | Agents can't post timeline comments | Verify via `multica issue --help`; if absent, append to description |

When the CLI grows these features, the affected SKILL.md files migrate to native primitives (each has a TODO marker pointing here).

## Prerequisites

- Multica self-hosted server running (default `localhost:3000` + `:8080`, or via Tailscale)
- `multica` CLI installed + authenticated:
  ```bash
  multica auth status   # → "Authenticated as ..."
  ```
- Daemon running with `claude` CLI detected:
  ```bash
  multica daemon status
  multica runtime list --output json | jq '.[] | {id, provider, name, status}'
  # → at least one runtime with provider/name containing "claude" and status "online"
  ```
- `gh` CLI authenticated to `Duo-Super-Labs` org
- `jq` installed
- Env: `GH_TOKEN`, `DATABASE_URL` (will be passed to relevant agents via `--custom-env-stdin`)

## Step 1 — Create the empty repo on GitHub

```bash
gh repo create Duo-Super-Labs/<product-slug> --private --description "<one-line>"
```

(GitHub's `--template` flag works too, but copies admin as a tree without
preserving history. We prefer pushing admin's history to keep the audit
trail; see Step 1.5.)

## Step 1.5 — Populate the empty repo from admin (run on WSL)

All product repos live under `~/products/<slug>/` on the WSL host (the
same machine that runs the Multica daemon and the per-product Docker
stack). This is also where the human can `cd` to inspect / dev / test
manually, separate from the agent workdirs in `~/multica_workspaces/`.

```bash
ssh renatoastra@desktop-76n2ggj 'bash -s' <<'EOF'
cd ~/products
gh repo clone Duo-Super-Labs/admin <product-slug>
cd <product-slug>
git remote set-url origin git@github.com:Duo-Super-Labs/<product-slug>.git
git push -u origin main
EOF
```

This copies admin's full history into the new product repo and gives the
WSL a working checkout at `~/products/<product-slug>`.

## Step 2 — Bring up the local stack (one-time per product)

```bash
# Still on WSL, in the new product checkout:
ssh renatoastra@desktop-76n2ggj 'bash -s' <<'EOF'
cd ~/products/<product-slug>
pnpm install
~/auto-board-skills/scripts/product-stack.sh up <product-slug> "$PWD"
pnpm --filter @duolabs/database migrate
pnpm typecheck
EOF
```

If green, you're ready.

## Step 2 — Create the workspace via UI

CLI v0.2.26 does not support `workspace create`. So:

1. Open `http://<your-multica-host>` (or `http://localhost:3000` for self-host on this machine)
2. Click "+ New Workspace"
3. Name: `<product-slug>` (e.g., `duozada`)
4. Slug: `<product-slug>` (same)
5. Save

## Step 3 — Provision agents, skills, and project

```bash
cd /path/to/auto-board-skills

export GH_TOKEN=ghp_...                    # PAT scoped to Duo-Super-Labs
export DATABASE_URL=postgres://...         # local Docker Postgres

./scripts/provision-product-workspace.sh \
  <product-slug> \
  https://github.com/Duo-Super-Labs/<product-slug>
```

Optionally pass a vision-summary file as the third arg — it becomes the workspace context (≤500 words recommended):

```bash
./scripts/provision-product-workspace.sh duozada \
  https://github.com/Duo-Super-Labs/duozada \
  ./drafts/duozada-vision-summary.md
```

The script:
- Validates the workspace exists (created in Step 2)
- (Optional) Sets workspace context from your vision file
- Creates the `MVP` project with the product repo + design system attached as resources
- Imports 15 skills from this repo
- Discovers the Claude Code runtime ID
- Creates 9 agents with model + instructions + max_concurrent_tasks
- Mounts skills on each agent (`agent skills set`)
- Sets `GH_TOKEN` / `DATABASE_URL` on relevant agents via `--custom-env-stdin`

Total time: ~30s.

## Step 4 — Bootstrap the product (one-shot, via UI chat)

```bash
./scripts/bootstrap-product-instructions.sh <product-slug>
```

Outputs the chat URL + paste-ready first message. Open URL, select `pm-grooming` agent, paste message, answer the grilling questions. The agent will produce six `Product/*.md` files and open a PR. Merge the PR → bootstrap is done forever for this product.

## Step 5 — First US

Two options:

**Option A — chat with pm-grooming**
```
Run skill grill-us. Seed: <your idea>
```

**Option B — CLI**
```bash
export MULTICA_WORKSPACE_ID=<workspace-id>   # from Step 3 output

cat > /tmp/us-1-desc.md <<'EOF'
<!-- multica-board-state: phase=backlog domain=none -->

(Empty — pm-grooming will populate via grill-us)
EOF

cat /tmp/us-1-desc.md | multica issue create \
  --title "US-1: <feature>" \
  --project <project-id> \
  --assignee pm-grooming \
  --status backlog \
  --description-stdin
```

## Step 6 — Watch the pipeline flow

The pipeline is event-driven from here on. Cards move through:

```
phase=backlog
  → phase=product-planning      (pm-grooming)
  → phase=rt-design             (designer)
  → phase=design-doing          (designer)
  → phase=rt-test-plan          (qa-planner)
  → phase=test-planning         (qa-planner)
  → phase=rt-refinement         (pm-refiner)
  → phase=refinement            (pm-refiner)
  → phase=rt-dev                (task-breaker)
  → phase=dev                   (children: fe-dev, be-dev)
  → phase=rt-code-review        (children → code-reviewer)
  → phase=code-review           (code-reviewer)
  → phase=rt-test               (parent → qa-tester)
  → phase=test                  (qa-tester)
  → phase=homologation          (HUMAN — you)
  → phase=done                  (after you merge us-N → main)
```

You only act at `phase=homologation`.

Inspect any time:
```bash
MULTICA_WORKSPACE_ID=<id> multica issue list --output json \
  | jq '.[] | {num: .number, title, status, assignee: .assignee.name, phase= (.description | match("phase=([a-z-]+)") | .captures[0].string)}'
```

## Tearing down

```bash
# Delete project (removes resources binding, doesn't touch repos)
multica project delete <project-id>

# Delete workspace via UI (or CLI if/when it lands)
# Local Docker DB and product repos are untouched.
```

## Troubleshooting

### Agent stuck on a task

```bash
multica agent tasks <agent-id> --output json
# Cancel a stuck task (verify via `multica issue tasks --help` or `agent tasks --help`)
```

### Skills not appearing in workdir

Daemon writes them to `.claude/skills/<name>/SKILL.md` per task. If missing:

```bash
multica daemon logs -f
```

Look for skill injection lines.

### Reassign cancelled work

Multica cancels ALL active tasks on reassign. Always verify no running tasks before reassigning (especially in Refinement).

### Provision script errors

Most likely causes:
1. Workspace doesn't exist → create via UI (Step 2)
2. Daemon stopped or no claude runtime → `multica daemon start`
3. `agent skills set` fails → verify the import returned valid IDs (`multica skill list`)
4. Custom-env stdin fails → verify `GH_TOKEN` and `DATABASE_URL` are set in the shell before running

If something else fails, capture the failing command + error and adjust the script (it's small enough to read end-to-end).
