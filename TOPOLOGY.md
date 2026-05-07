# Topology

How the auto-board pipeline is deployed across machines.

## Machines

### `desktop-76n2ggj` (Tailscale `100.84.60.18`) — **THE BASE**

This machine is **WSL2 Ubuntu running inside Windows**. Everything runs Unix-native — same paths, same Docker, same `pnpm`, same Playwright as macOS. Treat it as a Linux box; the Windows host is irrelevant for our purposes.

Components running here:
- **Multica server** (Docker compose self-host) — REST + WebSocket on `:8080`, web UI on `:3000`, served as `https://desktop-76n2ggj.tailda7706.ts.net` via Tailscale
- **Multica daemon** — polls server, claims tasks, executes agent CLIs
- **Per-product Postgres + Minio + Mailpit Docker stacks** — one stack per product (e.g., `duozada_postgres`, `genebra_postgres`), namespaced via `COMPOSE_PROJECT_NAME` and port-shifted via `~/.auto-board-stacks/<slug>/docker-compose.override.yml`. Stack metadata managed by `~/auto-board-skills/scripts/product-stack.sh` (reads `port-registry.json`).
- **`claude` / `gemini` / `cursor` CLIs** — what the daemon spawns when an agent picks up a task. `claude` lives at `~/.local/bin/claude`; `setup-wsl-daemon.sh` symlinks it into `/usr/local/bin` so non-interactive shells (the daemon) find it.
- **`auto-board-skills` repo** at `~/auto-board-skills/` — agents reference scripts (especially `product-stack.sh`) and skills here. Auto-cloned and kept up-to-date by `setup-wsl-daemon.sh`.
- **Product repos** at `~/products/<slug>/` — canonical local checkouts used by the human for inspection/dev. Convention: every product clones into `~/products/<slug>/` (e.g. `~/products/duozada`, `~/products/genebra`). Existing entries: `~/products/{atende-ai, duo-admin, paperclip, duozada}`.
- **Agent workdirs** — `~/multica_workspaces/{ws}/{task_short_id}/workdir/` — ephemeral per-task clones managed by the Multica daemon. Separate from `~/products/` (the persistent local checkouts) so agents always start fresh.

This is the **execution surface** of the entire auto-board pipeline.

### `renatos-macbook-air` (Tailscale `100.125.74.10`) — Access only

The Mac is a **thin client**. It is NOT execution.

- `multica` CLI installed → talks to the WSL server over Tailscale
- Browser → opens `https://desktop-76n2ggj.tailda7706.ts.net`
- SSH client → `ssh renatoastra@desktop-76n2ggj` for terminal access into WSL

**Do not run a daemon on the Mac.** A Mac daemon would register a separate runtime in Multica and split execution across two machines, which is exactly what we don't want — the Mac sleeps, the battery drains, and the WSL stack is the canonical one.

> Historical note: during initial provisioning, a daemon was briefly run on the Mac to discover the runtime ID and unblock the `provision-product-workspace.sh` script. That daemon must be stopped (`multica daemon stop`) once the WSL daemon is up and the agents have been re-bound to the WSL runtime. See "Migration" below.

## ⚠ Runtime IDs are per-workspace, even for the same physical daemon

A single daemon registers a **separate runtime per workspace it watches**. So the same WSL Claude CLI shows up as different runtime IDs:

```
Duo SUPER LABS workspace: Claude (DESKTOP-76N2GGJ) = 2cce3ced-...
duozada workspace:        Claude (DESKTOP-76N2GGJ) = bdabc495-...
```

Both point to the same `claude` binary on the same WSL host. When checking which runtime an agent is bound to, **always inspect with `MULTICA_WORKSPACE_ID` set to the agent's workspace** — otherwise you'll see runtimes from the default workspace and get confused.

```bash
MULTICA_WORKSPACE_ID=<workspace> multica runtime list
```

## Migration: Mac daemon → WSL daemon

If agents are currently bound to a Mac runtime and you need to flip them to WSL:

1. **SSH into WSL and start the daemon there**:
   ```bash
   ssh renatoastra@desktop-76n2ggj
   multica daemon status
   # if stopped:
   multica daemon start
   multica daemon status   # verify "running" + agents detected
   exit
   ```

2. **From the Mac, discover the new WSL runtime ID**:
   ```bash
   multica runtime list --output json \
     | jq '.[] | select((.provider // "" | ascii_downcase | contains("claude"))) | {id, provider, status, hostname}'
   # Pick the one whose hostname matches the WSL host, NOT the Mac.
   WSL_RUNTIME_ID=<id-from-jq-output>
   ```

3. **Re-bind all 9 agents to the WSL runtime**:
   ```bash
   for agent_name in pm-grooming pm-refiner designer qa-planner task-breaker fe-dev be-dev code-reviewer qa-tester; do
     agent_id=$(multica agent list --output json | jq -r --arg n "$agent_name" '.[] | select(.name==$n) | .id')
     multica agent update "$agent_id" --runtime-id "$WSL_RUNTIME_ID"
   done
   ```

4. **Stop the Mac daemon**:
   ```bash
   multica daemon stop
   ```

5. **Verify**: assign a test issue to an agent, watch the task get picked up by the WSL daemon (check `multica daemon logs -f` over SSH).

## Where workdirs live

Per-task workdirs are on the **daemon's** filesystem. With daemon on WSL, that's `/home/renatoastra/multica_workspaces/duozada/<task-id>/workdir/`. Mac never sees these directories. If you need to inspect agent state, SSH in.

## Updating product code

- Agents push to GitHub (via `gh` CLI inside the WSL workdir, using `GH_TOKEN` from the agent's custom-env)
- Mac is just where you (the human) review PRs in browser, merge to main during Homologation, etc.

## Why WSL, not Windows-native or Mac

- WSL2 is Unix-native (POSIX paths, Linux kernel via virtualization) — the duo-admin stack assumes this
- Windows-native has filesystem perf quirks with Docker bind mounts and path separator issues
- Mac as execution surface drains battery and pauses on sleep, which kills long-running tasks
- WSL on a desktop PC is always-on and has more cores/RAM than the laptop

## Updating this doc

When the topology changes (e.g., adding a second daemon for redundancy, moving server to cloud), update this file and the related skills in this repo. This is the source of truth.
