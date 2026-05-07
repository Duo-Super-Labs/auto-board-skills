# Multica CLI reference (v0.2.26)

Everything we learned about `multica` CLI by running `--help` against every subcommand and stress-testing the actual server behavior. **This is the consolidated truth — README.md, PROVISION.md, and individual SKILL.md files reference back here.**

## Top level

```bash
multica <command> <subcommand> [flags]
```

### Core commands
- `agent` — work with agents
- `autopilot` — manage scheduled/triggered automations
- `issue` — work with issues
- `label` — work with issue labels (workspace-level entities only — see gap below)
- `project` — work with projects
- `repo` — work with repositories (only `checkout` exists; not for whitelist management)
- `skill` — work with skills
- `workspace` — work with workspaces (no `create` — UI only)

### Runtime commands
- `daemon` — control the local agent runtime daemon
- `runtime` — work with agent runtimes (per-workspace registrations)

### Additional
- `attachment` — work with attachments
- `auth` — auth state (status, logout)
- `config` — manage configuration
- `login` — authenticate
- `setup` — configure CLI + auth + start daemon (one-shot)
- `update` — update multica binary
- `version` — version info

### Global flags
- `--profile string` — config profile (isolates config, daemon state, workspaces)
- `--server-url string` — Multica server URL (env: `MULTICA_SERVER_URL`)
- `--workspace-id string` — workspace ID (env: `MULTICA_WORKSPACE_ID`)

## Auth

```bash
multica login                              # OAuth via browser
multica login --token mul_<pat>            # headless via PAT
multica auth status
multica auth logout
```

PATs: 90-day default, generated in UI under Settings → API Tokens. Format: `mul_<hex>`.

## Workspace

| Subcommand | Notes |
|---|---|
| `workspace get <id>` | Get details |
| `workspace list` | **Returns table only — `--output json` NOT supported.** Two columns: `ID  NAME`. Multi-word names possible. Parse with awk. |
| `workspace members` | List members |
| `workspace update <id>` | Update metadata. Supports `--context-stdin`, `--description-stdin`, `--name`, `--issue-prefix` |

**Gap:** No `workspace create`. Workspaces must be created via web UI.

## Project

| Subcommand | Notes |
|---|---|
| `project create` | Required: `--title`. Optional: `--description`, `--icon`, `--lead`, `--repo` (string array, repeatable!), `--status` |
| `project list` | Supports `--output json` (default table). `--status` filter |
| `project get <id>` | |
| `project update <id>` | |
| `project status <id>` | Change project status |
| `project resource list <project-id>` | List attached resources |
| `project resource add <project-id>` | Required: `--type github_repo`, `--url <url>` |
| `project resource remove <project-id>` | |
| `project delete <id>` | |

**Tip:** Pass `--repo <url>` repeatedly at create time to attach multiple repos at once. Daemon will write `.multica/project/resources.json` in agent workdir.

## Issue

| Subcommand | Notes |
|---|---|
| `issue create` | Required: `--title`. Optional: `--description`, `--description-stdin`, `--assignee` (fuzzy), `--assignee-id`, `--parent`, `--project`, `--status`, `--priority`, `--due-date` (RFC3339), `--attachment` (multi). **No `--label`. No `--depends-on`.** |
| `issue update <id>` | Same flags as create plus `--parent ""` to clear. **No `--label`.** |
| `issue get <id>` | Returns description as text — useful for handoff workflow that rewrites the marker line |
| `issue list` | Filter by `--parent`, `--project`, `--status`, `--assignee`. Supports `--output json` |
| `issue tasks <id>` | List tasks for an issue |
| `issue view <id>` | TODO: verify exact subcommand name (used in skills as documentation) |

**Gaps:**
- **No label-on-issue command.** Labels exist as workspace entities (`multica label create`, etc.) but cannot be attached to specific issues via CLI. **Workaround:** encode `phase=` and `domain=` in the first line of description as `<!-- multica-board-state: phase=X domain=Y -->`. Every skill greps this line.
- **No `--depends-on`.** Workaround: status `blocked` on dependent issue + manual unblocking when prerequisites are done.
- **`multica issue comment` may not exist.** TODO: verify with `multica issue --help` showing all subcommands. If missing, use description appends.

## Label

| Subcommand | Notes |
|---|---|
| `label create` | Workspace label entity |
| `label list` | |
| `label get <id>` | |
| `label update <id>` | |
| `label delete <id>` | |

**No subcommand to attach a label to an issue.** Labels are essentially unused in our pipeline.

## Skill

| Subcommand | Notes |
|---|---|
| `skill create` | Required: `--name`. Optional: `--content` (SKILL.md body), `--description`, `--config` (JSON) |
| `skill import --url <url>` | **Server rejects `github.com` URLs** with `400 unsupported source: github.com (supported: clawhub.ai, skills.sh)`. Despite the help text claiming GitHub is supported — that's a docs bug. **Workaround: use `skill create` + `skill files upsert` to upload locally.** |
| `skill list` | Supports `--output json` |
| `skill get <id>` | Returns includes files |
| `skill update <id>` | |
| `skill delete <id>` | |
| `skill files list <skill-id>` | |
| `skill files upsert <skill-id>` | Required: `--path`, `--content`. Creates or updates a file inside the skill |
| `skill files delete <skill-id>` | |

Skills mount on agents via `multica agent skills set`.

## Agent

| Subcommand | Notes |
|---|---|
| `agent create` | Required: `--name`, `--runtime-id`. Optional: `--description`, `--instructions` (inline string), `--model` (e.g. `claude-sonnet-4-6`), `--custom-args` (JSON array), `--custom-env` / `--custom-env-stdin` / `--custom-env-file` (JSON object), `--max-concurrent-tasks` (default 6), `--visibility` (`private` default \| `workspace`), `--runtime-config` (JSON). **No `--skills` flag.** |
| `agent list` | Supports `--output json`. Optional `--include-archived` |
| `agent get <id>` | |
| `agent update <id>` | All create flags re-purposeable as updates. `--custom-env-stdin` for secret env vars |
| `agent skills list <agent-id>` | List mounted skills |
| `agent skills set <agent-id>` | Required: `--skill-ids` (comma-separated). **Replaces ALL assignments — there is no `add` or `remove`** |
| `agent tasks <agent-id>` | List tasks for agent |
| `agent avatar <id>` | Upload avatar |
| `agent archive <id>` | Soft delete |
| `agent restore <id>` | |

**Important:** `--instructions` accepts inline strings only — no file flag. To pass multi-line content, use `"$(cat file)"`. Newlines and most special chars survive (only `$`, `\`, backtick, `"` need shell escaping inside double quotes — but `$(...)` evaluates already, so file content as bytes is what reaches the API).

**Important:** `--custom-env` flags are stored in plaintext on the server. Don't use for high-value secrets (production credentials, payment keys). For dev `GH_TOKEN` and `DATABASE_URL` it's acceptable.

## Runtime

| Subcommand | Notes |
|---|---|
| `runtime list` | Supports `--output json`. Returns ID, name, mode (`local`), provider (`claude` / `gemini` / `cursor` / etc.), status (`online` / `offline`), last_seen |
| `runtime activity <id>` | Hourly task activity |
| `runtime usage <id>` | Token usage |
| `runtime update <id>` | Initiate CLI update on the runtime's daemon |

**Critical quirk: runtimes are per-workspace.** A single daemon registers a *separate* runtime ID per workspace it watches. Same physical `claude` CLI on the same machine = different IDs in different workspaces. Always set `MULTICA_WORKSPACE_ID` before listing or you'll see a different set than what your agents are bound to.

## Daemon

| Subcommand | Notes |
|---|---|
| `daemon start` | Background by default. `--foreground` for debugging |
| `daemon stop` | SIGTERM, 30s grace |
| `daemon status` | Shows pid, uptime, detected agents, watched workspaces |
| `daemon logs` | `-f` to follow, `-n N` for last N lines |

**Where to run the daemon:** the machine that should physically execute agent CLIs. For `duozada`, that's the WSL Ubuntu host (`desktop-76n2ggj`), not the Mac. See `TOPOLOGY.md`.

## Setup

| Subcommand | Notes |
|---|---|
| `setup self-host` | Configure CLI for self-hosted server, login via browser, start daemon. Supports `--server-url <url>` for non-localhost setups |
| `setup cloud` | Configure for multica.ai (cloud) |

## Autopilot

```bash
multica autopilot create --title X --assignee <agent> --schedule "<cron>"
multica autopilot trigger <id>     # manual run
multica autopilot list
```

**Limits we found:**
- Only **schedule (cron)** and **manual** triggers actually fire
- The schema reserves `webhook` and `api` types but they are NOT wired to ingress routes — UI lets you create them but they don't fire
- No event triggers on label/status/comment changes

This means orchestration *between* phases must be done by the agent finishing each phase (via `multica-handoff` skill), not by autopilot watching for state changes.

## Attachment

```bash
multica attachment add ...    # presumably exists; not yet exercised
```

Used by `qa-tester` when posting Playwright smoke screenshots.

## Common patterns we use in scripts

### Set workspace globally for a session

```bash
export MULTICA_WORKSPACE_ID=<id>
# All subsequent commands scoped to this workspace.
```

### Resolve workspace ID from name (no JSON output for `workspace list`)

```bash
WORKSPACE_ID=$(multica workspace list | awk -v target="duozada" '
  NR>1 {
    id=$1
    name=""
    for (i=2; i<=NF; i++) name = (name=="") ? $i : name " " $i
    if (tolower(name) == tolower(target)) { print id; exit }
  }
')
```

### Discover Claude runtime in current workspace

```bash
RUNTIME_ID=$(multica runtime list --output json \
  | jq -r '.[]? | select(.provider=="claude" and .status=="online") | .id' | head -1)
```

### Set custom env on agent (secret-safe)

```bash
echo '{"GH_TOKEN":"ghp_...","DATABASE_URL":"postgres://..."}' \
  | multica agent update <agent-id> --custom-env-stdin
```

### Idempotent skill upload (bypassing `import`)

```bash
multica skill list --output json | jq -r --arg n "<name>" '.[] | select(.name==$n) | .id'
# If empty:
multica skill create --name <name> --content "$(cat SKILL.md)" --description "..."
# For each non-SKILL.md file:
multica skill files upsert <skill-id> --path <relative-path> --content "$(cat file)"
```

### Atomic phase handoff

```bash
# Read current description
multica issue get <id> --output json | jq -r '.description' > /tmp/desc.md

# Rewrite first line marker
awk -v phase="<next>" -v domain="<your-or-none>" '
  NR==1 && /^<!-- multica-board-state:/ { print "<!-- multica-board-state: phase=" phase " domain=" domain " -->"; next }
  NR==1 { print "<!-- multica-board-state: phase=" phase " domain=" domain " -->"; print; next }
  { print }
' /tmp/desc.md > /tmp/desc-new.md

# Atomic update
cat /tmp/desc-new.md | multica issue update <id> \
  --description-stdin \
  --status <new-status-if-block-changes> \
  --assignee <next-agent-name>
```

### List sibling children to detect "all done"

```bash
multica issue list --parent <us-id> --output json \
  | jq '[.[] | select(.description | test("phase=done") | not)]'
# Empty array → all children done → parent moves to phase=rt-test
```

## Known CLI gaps consolidated

| Gap | Workaround | Skill that documents |
|---|---|---|
| `workspace create` doesn't exist | Create via UI before running `provision-product-workspace.sh` | `PROVISION.md` |
| `chat` command doesn't exist | UI-only; `bootstrap-product-instructions.sh` outputs paste-ready first message | `04-bootstrap-product/SKILL.md` |
| `issue create --label` doesn't exist | Encode in description marker | `10-break-us/SKILL.md` |
| `issue update --add-label` doesn't exist | Rewrite the marker on every handoff | `03-multica-handoff/SKILL.md` |
| `issue create --depends-on` doesn't exist | Status `blocked` + manual unblocking | `10-break-us/SKILL.md` |
| `issue comment` may not exist (verify) | Append to description if missing | TODO |
| `agent create --skills` doesn't exist | `agent skills set --skill-ids id1,id2,...` post-create | `provision-product-workspace.sh` |
| `skill import --url github.com/...` rejected | `skill create` + `skill files upsert` for local upload | `provision-product-workspace.sh` |
| `workspace list --output json` not supported | Awk-parse the table | `provision-product-workspace.sh` |
| `autopilot` webhook/api triggers reserved but not wired | Cron-only; orchestration via agents calling `multica-handoff` | `GOALS.md` (risk #4) |

## Anti-patterns we hit and you should avoid

1. **Don't store JSON in a bash variable with `2>&1`** — captures stderr noise that breaks downstream `jq`. Always: `var=$(cmd)` (no `2>&1`) and let stderr go to terminal.
2. **Don't use `declare -A` (associative arrays)** if the script must run on macOS default `/bin/bash` (3.2). Use parallel arrays + lookup function.
3. **Don't use `--add-label` / `--remove-label` / `--label "X"` flags** — they don't exist on issue create/update.
4. **Don't trust runtime IDs across workspaces** — same daemon, same `claude` binary, different IDs.
5. **Don't run `multica login` while another active login flow is pending** — hangs both. Ctrl+C the first one or wait for timeout.
6. **Don't reassign an issue while parallel `@mention` tasks are still `running` or `queued`** — Multica cancels ALL active tasks on reassign.
7. **Don't expect `mention` edits to fire** — only the original comment's `@`s trigger tasks. Editing to add `@` after creation does nothing.

## When the CLI gets fixed

When new flags land in a future Multica version:
1. Test the new flag against your actual server (`multica <cmd> --help`)
2. Update the relevant skill SKILL.md
3. Update `provision-product-workspace.sh` if it touches setup
4. Append a row to the `Decisions log` in `GOALS.md`
5. Remove the old workaround once you're confident the new path is stable

This file is the single place to look when something doesn't behave the way Multica's docs site claims it should.
