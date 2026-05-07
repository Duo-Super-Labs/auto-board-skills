# auto-board CLI

TypeScript CLI for the auto-board SDLC pipeline on top of Multica self-hosted.

Built with Bun + TypeScript strict. Replaces bash orchestration scripts while keeping them as fallback.

## Install

Copy the compiled binary to your PATH:

```bash
cp bin/auto-board ~/.local/bin/
# or
sudo cp bin/auto-board /usr/local/bin/
```

Verify:
```bash
auto-board --version
```

## Commands

### `auto-board doctor`

Preflight check before running any pipeline command.

```bash
auto-board doctor
```

Checks (color-coded pass/warn/fail):
- Tailscale connected
- `multica` CLI authenticated
- Online Claude runtime visible in Multica
- `gh` CLI authenticated
- `port-registry.json` valid

### `auto-board new-product <slug>`

Full orchestrator for a new product. Runs these steps with Listr2 progress:

1. Verify or create GitHub repo (`Duo-Super-Labs/<slug>`)
2. Allocate ports in `port-registry.json`
3. **Pause** — asks you to create the Multica workspace in UI (CLI gap: no `workspace create`)
4. SSH into WSL: clone admin repo, set remote, push, `pnpm install`, `product-stack.sh up`, `pnpm migrate`, `pnpm typecheck`
5. Run `provision-product-workspace.sh` (creates 9 agents, 15 skills, MVP project)
6. Print bootstrap instructions

```bash
export GH_TOKEN=ghp_...
auto-board new-product genebra

# Flags:
auto-board new-product genebra --gh-token ghp_...   # inline PAT
auto-board new-product genebra --skip-ssh            # skip WSL SSH steps
auto-board new-product genebra --skip-provision      # skip provision script
auto-board new-product genebra --database-url postgres://...  # override DB URL
```

### `auto-board provision <slug> <repo-url>`

Thin wrapper around `provision-product-workspace.sh`. Requires workspace to exist in Multica UI first.

```bash
export GH_TOKEN=ghp_...
auto-board provision genebra https://github.com/Duo-Super-Labs/genebra
auto-board provision genebra https://github.com/Duo-Super-Labs/genebra --vision-file ./vision.md
```

### `auto-board bootstrap <slug>`

Queries Multica for workspace + MVP project + product repo resource, then:
- Prints paste-ready first message for `pm-grooming` chat session
- Opens browser to workspace issues page (best-effort)

```bash
auto-board bootstrap genebra
```

Note: `multica chat` does not exist in CLI v0.2.26. Chat is a UI-only FAB overlay.

### `auto-board stack <action> <slug> [repo-path]`

Delegate to `product-stack.sh`. Actions: `up | down | nuke | status | database-url`.

```bash
auto-board stack up genebra ~/products/genebra
auto-board stack status genebra
auto-board stack down genebra ~/products/genebra
auto-board stack nuke genebra ~/products/genebra      # DESTRUCTIVE — loses DB data
auto-board stack database-url genebra
```

### `auto-board agent set-env <slug> <agent-name>`

Interactive `@clack/prompts` session to set KEY=VALUE env vars on an agent via `--custom-env-stdin` (secrets never pass through shell args or history).

```bash
auto-board agent set-env duozada fe-dev
# Prompts: KEY (blank to finish), VALUE (masked)
```

### `auto-board issue create <slug>`

Create a Multica issue. Auto-resolves workspace ID and MVP project ID.

```bash
auto-board issue create duozada --title "US-1: user registration" --assignee pm-grooming --status backlog

# Read description from stdin:
cat description.md | auto-board issue create duozada --title "US-1" --description-stdin
```

## Dev workflow

```bash
cd cli/

# Install dependencies
bun install

# Run with hot reload (dev)
bun run --hot src/index.ts <command>

# Run tests
bun run test          # vitest run
bun run test:coverage # vitest run --coverage (requires >=80% lib coverage)

# Lint
bun run lint          # biome check src tests
bun run lint:fix      # biome check --write src tests

# Type check
bun run typecheck     # tsc --noEmit

# Build binary
bun run build         # outputs bin/auto-board
```

## Architecture

```
src/
  index.ts            - commander entry, registers all commands
  log.ts              - consola + check-line helpers
  commands/
    doctor.ts         - preflight checks (parallel Promise.allSettled)
    new-product.ts    - orchestrator (Listr2 tasks, clack pauses)
    provision.ts      - thin bash delegate
    bootstrap.ts      - multica query + browser open
    stack.ts          - thin bash delegate
    agent-set-env.ts  - clack interactive prompts
    issue-create.ts   - multica issue create wrapper
  lib/
    exec.ts           - execa wrapper (run/runWithOutput/runStream)
    multica-cli.ts    - typed wrapper around multica CLI (includes workspace table parser)
    port-registry.ts  - read/write/allocate port-registry.json
    ssh.ts            - SSH session wrapper for WSL
    github.ts         - gh CLI wrapper
  types/
    multica.ts        - Zod schemas for workspace/project/agent/skill/runtime/issue
    registry.ts       - Zod schema for port-registry.json
tests/
  lib/                - unit tests (all lib modules, >=80% coverage)
  commands/           - command orchestration tests (mocked libs)
bin/
  auto-board          - compiled Bun binary
```

## Key Multica CLI quirks handled

- `workspace list` returns ASCII table only — no `--output json`. Parsed with regex in `parseWorkspaceTable()`.
- `workspace create` doesn't exist — `new-product` pauses and asks user to create in UI.
- `chat` doesn't exist — `bootstrap` prints paste-ready message instead.
- `issue create --label` doesn't exist — encode in description first line.
- `skill import --url github.com/...` rejected — `provision-product-workspace.sh` uses `skill create` + `skill files upsert`.
- `--custom-env-stdin` for secrets — JSON via stdin in `updateAgentEnv()`.
- Runtime IDs are per-workspace — always pass `MULTICA_WORKSPACE_ID` env when listing runtimes.

## Real fixtures (read-only smoke check only)

```
Workspace duozada:  523815ef-cd23-40ae-be93-ed6353b5f924
Project MVP:        2b2663c1-0e17-4775-86ec-9e6377b1cf8e
Runtime Claude WSL: bdabc495-bda5-419f-b487-741c17c721c6
Server:             https://desktop-76n2ggj.tailda7706.ts.net
```
