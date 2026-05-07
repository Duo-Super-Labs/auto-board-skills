#!/usr/bin/env bash
#
# provision-product-workspace.sh
# -----------------------------------------------------------------------------
# Provisions a Multica workspace for a new product:
#   1. Validates the workspace exists (created via UI — multica CLI doesn't
#      support `workspace create` as of v0.2.26)
#   2. (Optional) Sets workspace context from a vision summary file
#   3. Creates the MVP project with the product repo + design system attached
#   4. Imports all 15 skills from auto-board-skills repo
#   5. Discovers the Claude Code runtime ID
#   6. Creates the 9 agents with model, instructions, max_concurrent_tasks
#   7. Mounts skills on each agent (`agent skills set`)
#   8. Sets custom env (GH_TOKEN, DATABASE_URL) on relevant agents via stdin
#
# Calibrated against multica CLI v0.2.26.
#
# Prerequisites:
#   - multica CLI installed and authenticated (`multica auth status` returns OK)
#   - Local self-host server reachable (Tailscale up if applicable)
#   - daemon running (`multica daemon status`) with `claude` CLI detected
#   - Workspace already created in UI (e.g. `duozada`)
#   - GH_TOKEN env var set (PAT scoped to Duo-Super-Labs org)
#   - DATABASE_URL env var set (local Docker Postgres URL)
#   - jq, gh
#
# Usage:
#   ./provision-product-workspace.sh <product-slug> <repo-url> [vision-file]
#
# Example:
#   GH_TOKEN=ghp_... DATABASE_URL=postgres://... \
#     ./provision-product-workspace.sh duozada \
#       https://github.com/Duo-Super-Labs/duozada \
#       /tmp/duozada-vision.md
# -----------------------------------------------------------------------------

set -euo pipefail

PRODUCT_SLUG="${1:?Usage: $0 <product-slug> <repo-url> [vision-file]}"
PRODUCT_REPO="${2:?Usage: $0 <product-slug> <repo-url> [vision-file]}"
VISION_FILE="${3:-}"

SKILLS_REPO="https://github.com/Duo-Super-Labs/auto-board-skills"
SKILLS_BRANCH="main"
DESIGN_SYSTEM_REPO="https://github.com/Duo-Super-Labs/ai-ui"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REGISTRY_PATH="${SKILLS_DIR}/port-registry.json"

# ─── Derive DATABASE_URL from port registry (overrides any env var) ─────────
# The port registry is the single source of truth for per-product Docker
# port allocation, so multiple products can run docker-compose simultaneously
# on the same WSL host without colliding on container names + host ports.
if [[ -f "$REGISTRY_PATH" ]]; then
  REGISTRY_PORTS=$(jq --arg s "$PRODUCT_SLUG" '.products[$s] // empty' "$REGISTRY_PATH" 2>/dev/null || echo "")
  if [[ -n "$REGISTRY_PORTS" && "$REGISTRY_PORTS" != "null" ]]; then
    PRE_DB_URL="${DATABASE_URL:-}"
    REGISTRY_POSTGRES_PORT=$(echo "$REGISTRY_PORTS" | jq -r '.postgres')
    DATABASE_URL="postgresql://postgres:postgres@localhost:${REGISTRY_POSTGRES_PORT}/postgres"
    export DATABASE_URL
    if [[ -n "$PRE_DB_URL" && "$PRE_DB_URL" != "$DATABASE_URL" ]]; then
      echo "    ⚠ Overriding env DATABASE_URL=${PRE_DB_URL} with port-registry value → ${DATABASE_URL}" >&2
    fi
  else
    echo "    ⚠ Product '$PRODUCT_SLUG' not in port-registry.json — add it before running again." >&2
    echo "      The script will use whatever DATABASE_URL you pass (or none), which may collide with other products." >&2
  fi
fi

require() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing: $1" >&2; exit 1; }; }
require multica
require jq

echo "==> Provisioning workspace for product: ${PRODUCT_SLUG}"

# ──────────────────────────────────────────────────────────────────────────────
# 0. Sanity
# ──────────────────────────────────────────────────────────────────────────────
echo "==> Checking multica auth..."
multica auth status >/dev/null 2>&1 || { echo "❌ multica not authenticated. Run: multica login"; exit 1; }

echo "==> Checking for online claude runtime (any machine)..."
# We don't care if THIS Mac has a daemon — we care that some machine
# (e.g. the WSL host) has a claude runtime online for the workspace
# we're about to provision. The local-daemon check is misleading because
# in our topology the daemon runs on WSL, not on the operator's Mac.
RUNTIME_PROBE=$(multica runtime list --output json 2>/dev/null \
  | jq -r '.[]? | select(.provider=="claude" and .status=="online") | "\(.id) \(.name)"')
if [[ -z "$RUNTIME_PROBE" ]]; then
  echo "❌ No online claude runtime found server-side."
  echo "   Start the daemon on a machine that has 'claude' on PATH (typically WSL):"
  echo "     ssh renatoastra@desktop-76n2ggj 'multica daemon start'"
  exit 1
fi
echo "    ✓ Online claude runtime(s) detected:"
echo "$RUNTIME_PROBE" | head -3 | sed 's/^/      /'

# ──────────────────────────────────────────────────────────────────────────────
# 1. Resolve workspace ID by name (multica CLI v0.2.26: workspace list returns
#     a 2-column table — `ID  NAME` — and does NOT support --output json)
# ──────────────────────────────────────────────────────────────────────────────
echo "==> Resolving workspace ID for '${PRODUCT_SLUG}'..."
WORKSPACE_ID=$(multica workspace list 2>/dev/null | awk -v target="$PRODUCT_SLUG" '
  NR>1 {
    id=$1
    name=""
    for (i=2; i<=NF; i++) name = (name=="") ? $i : name " " $i
    if (tolower(name) == tolower(target)) { print id; exit }
  }
')

if [[ -z "$WORKSPACE_ID" || "$WORKSPACE_ID" == "null" ]]; then
  echo ""
  echo "❌ Workspace '${PRODUCT_SLUG}' not found."
  echo ""
  echo "   The multica CLI v0.2.26 does NOT support 'workspace create'."
  echo "   Please create it via the UI first:"
  echo "     1. Open http://localhost:3000 (or your self-host URL)"
  echo "     2. Click '+ New Workspace'"
  echo "     3. Use slug: ${PRODUCT_SLUG}"
  echo ""
  echo "   Then re-run this script."
  exit 1
fi

echo "    ✓ Workspace ID: ${WORKSPACE_ID}"
export MULTICA_WORKSPACE_ID="$WORKSPACE_ID"

# ──────────────────────────────────────────────────────────────────────────────
# 2. (Optional) Set workspace context
# ──────────────────────────────────────────────────────────────────────────────
if [[ -n "${VISION_FILE}" && -f "${VISION_FILE}" ]]; then
  echo "==> Setting workspace context from ${VISION_FILE}..."
  multica workspace update "${WORKSPACE_ID}" --context-stdin < "${VISION_FILE}" >/dev/null
  echo "    ✓ Workspace context set"
else
  echo "    ⚠ No vision file provided. Set workspace context later in Settings if desired."
fi

# ──────────────────────────────────────────────────────────────────────────────
# 3. Create MVP project with repos attached as resources (idempotent: reuse if exists)
# ──────────────────────────────────────────────────────────────────────────────
echo "==> Resolving 'MVP' project (creating if missing)..."
PROJECT_ID=$(multica project list --output json 2>/dev/null \
  | jq -r '(.[]? // empty) | select(.title=="MVP") | .id' | head -1)

if [[ -n "$PROJECT_ID" && "$PROJECT_ID" != "null" ]]; then
  echo "    ✓ Reusing existing project: ${PROJECT_ID}"
else
  PROJECT_OUT=$(multica project create \
    --title "MVP" \
    --description "Minimum viable product slice — auto-board pipeline" \
    --status "in_progress" \
    --repo "${PRODUCT_REPO}" \
    --repo "${DESIGN_SYSTEM_REPO}" \
    --output json)
  PROJECT_ID=$(echo "$PROJECT_OUT" | jq -r '.id')
  echo "    ✓ Project created: ${PROJECT_ID}"
  echo "    ✓ Repos attached: ${PRODUCT_REPO}, ${DESIGN_SYSTEM_REPO}"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 4. Import 15 skills (in stable order)
# ──────────────────────────────────────────────────────────────────────────────
echo "==> Importing skills from ${SKILLS_REPO}..."

SKILLS=(
  "01-read-product-context"
  "02-branch-conventions"
  "03-multica-handoff"
  "04-bootstrap-product"
  "05-grill-us"
  "06-product-planning"
  "07-refine-us"
  "08-design-sketch"
  "09-bdd-writer"
  "10-break-us"
  "11-tdd-fe"
  "12-tdd-be"
  "13-code-review"
  "14-e2e-write"
  "14b-playwright-smoke"
)

# Parallel arrays (macOS bash 3.2 lacks `declare -A`)
SKILL_DIRS_ARR=()
SKILL_IDS_ARR=()

# CLI gap (v0.2.26): `multica skill import --url` rejects github.com URLs at
# the server (only clawhub.ai / skills.sh accepted). We bypass by uploading
# locally via `skill create` + `skill files upsert`.

EXISTING_SKILLS_JSON=$(multica skill list --output json 2>/dev/null || echo '[]')

for skill_dir in "${SKILLS[@]}"; do
  printf "    creating %-28s ... " "${skill_dir}"

  skill_md="${SKILLS_DIR}/${skill_dir}/SKILL.md"
  if [[ ! -f "$skill_md" ]]; then
    echo "FAILED (no SKILL.md)"
    exit 1
  fi

  # Extract name + description from YAML frontmatter (lines like "name: X" / "description: Y")
  skill_name=$(awk '/^name:[[:space:]]/ {sub(/^name:[[:space:]]+/, ""); print; exit}' "$skill_md")
  skill_desc=$(awk '/^description:[[:space:]]/ {sub(/^description:[[:space:]]+/, ""); print; exit}' "$skill_md")

  if [[ -z "$skill_name" ]]; then
    echo "FAILED (no name in frontmatter)"
    exit 1
  fi

  # Idempotent: reuse if a skill with this name already exists
  EXISTING_ID=$(echo "$EXISTING_SKILLS_JSON" | jq -r --arg n "$skill_name" '
    (.[]? // empty) | select(.name == $n) | .id
  ' | head -1)

  if [[ -n "$EXISTING_ID" && "$EXISTING_ID" != "null" ]]; then
    SKILL_DIRS_ARR+=("${skill_dir}")
    SKILL_IDS_ARR+=("${EXISTING_ID}")
    echo "↺ reused (${EXISTING_ID:0:8})"
    continue
  fi

  # Create the skill with the SKILL.md body as content
  skill_content=$(cat "$skill_md")
  CREATE_OUT=$(multica skill create \
    --name "$skill_name" \
    --content "$skill_content" \
    --description "$skill_desc" \
    --output json 2>&1) || {
      echo "FAILED"
      echo "    Error: ${CREATE_OUT}" >&2
      exit 1
    }
  SKILL_ID=$(echo "$CREATE_OUT" | jq -r '.id')

  # Upload any non-SKILL.md files (templates/, scripts/, etc.) preserving relative paths
  while IFS= read -r extra; do
    [[ -z "$extra" ]] && continue
    rel_path="${extra#${SKILLS_DIR}/${skill_dir}/}"
    extra_content=$(cat "$extra")
    multica skill files upsert "$SKILL_ID" \
      --path "$rel_path" \
      --content "$extra_content" >/dev/null 2>&1 || true
  done < <(find "${SKILLS_DIR}/${skill_dir}" -type f ! -name 'SKILL.md' 2>/dev/null)

  SKILL_DIRS_ARR+=("${skill_dir}")
  SKILL_IDS_ARR+=("${SKILL_ID}")
  echo "✓ (${SKILL_ID:0:8})"
done

echo "    ✓ ${#SKILLS[@]} skills created/reused"

lookup_skill_id() {
  local target="$1"
  local i
  for i in "${!SKILL_DIRS_ARR[@]}"; do
    if [[ "${SKILL_DIRS_ARR[$i]}" == "$target" ]]; then
      echo "${SKILL_IDS_ARR[$i]}"
      return 0
    fi
  done
}

# ──────────────────────────────────────────────────────────────────────────────
# 5. Discover Claude Code runtime ID
# ──────────────────────────────────────────────────────────────────────────────
echo "==> Discovering Claude Code runtime..."
RUNTIME_JSON=$(multica runtime list --output json)
RUNTIME_ID=$(echo "$RUNTIME_JSON" | jq -r '
  (.[]? // empty) | select(
    (.provider // "" | ascii_downcase | contains("claude")) or
    (.name // "" | ascii_downcase | contains("claude"))
  ) | .id
' | head -1)

if [[ -z "$RUNTIME_ID" || "$RUNTIME_ID" == "null" ]]; then
  echo "❌ No Claude Code runtime found. Available runtimes:"
  echo "$RUNTIME_JSON" | jq -r '.[]? | "  - \(.id) (\(.provider // "?"))"'
  echo ""
  echo "   Make sure 'claude' CLI is on PATH and the daemon detected it."
  echo "   Restart the daemon: multica daemon stop && multica daemon start"
  exit 1
fi

echo "    ✓ Runtime ID: ${RUNTIME_ID}"

# ──────────────────────────────────────────────────────────────────────────────
# 6. Create 9 agents
# ──────────────────────────────────────────────────────────────────────────────
echo "==> Creating 9 agents..."

# Helper: extract instructions from agents/<name>.md (text inside the
# triple-backtick code block — that's what gets pasted into Multica)
extract_instructions() {
  local file="$1"
  awk '/^```/{f=!f;next} f' "$file"
}

# Helper: comma-separated skill IDs from skill-dir names
ids_csv_for() {
  local result=""
  local s id
  for s in "$@"; do
    id=$(lookup_skill_id "$s")
    if [[ -n "$id" ]]; then
      result="${result}${id},"
    fi
  done
  echo "${result%,}"
}

# Parallel arrays for agent name → id (macOS bash 3.2 lacks `declare -A`)
AGENT_NAMES_ARR=()
AGENT_IDS_ARR=()

# Pre-fetch existing agents for idempotent re-runs
EXISTING_AGENTS_JSON=$(multica agent list --output json 2>/dev/null || echo '[]')

lookup_agent_id() {
  local target="$1"
  local i
  for i in "${!AGENT_NAMES_ARR[@]}"; do
    if [[ "${AGENT_NAMES_ARR[$i]}" == "$target" ]]; then
      echo "${AGENT_IDS_ARR[$i]}"
      return 0
    fi
  done
}

create_agent() {
  local name="$1"
  local model="$2"
  local max_conc="$3"
  local instructions_file="${SKILLS_DIR}/agents/${name}.md"
  shift 3
  local skills_csv
  skills_csv=$(ids_csv_for "$@")

  local instructions
  instructions=$(extract_instructions "$instructions_file")
  if [[ -z "$instructions" ]]; then
    echo "❌ Empty instructions extracted from ${instructions_file}" >&2
    exit 1
  fi

  printf "    %-16s (model: %-22s conc: %d) ... " "${name}" "${model}" "${max_conc}"

  # Idempotent: reuse if agent with this name already exists in workspace
  local agent_id
  agent_id=$(echo "$EXISTING_AGENTS_JSON" | jq -r --arg n "$name" '
    (.[]? // empty) | select(.name == $n) | .id
  ' | head -1)

  if [[ -n "$agent_id" && "$agent_id" != "null" ]]; then
    echo "↺ reused (${agent_id:0:8})"
  else
    local AGENT_OUT
    AGENT_OUT=$(multica agent create \
      --name "${name}" \
      --runtime-id "${RUNTIME_ID}" \
      --model "${model}" \
      --visibility "workspace" \
      --max-concurrent-tasks "${max_conc}" \
      --instructions "${instructions}" \
      --output json 2>&1) || {
        echo "FAILED"
        echo "    Error: ${AGENT_OUT}" >&2
        exit 1
      }
    agent_id=$(echo "$AGENT_OUT" | jq -r '.id')
    echo "✓ (${agent_id:0:8})"
  fi

  AGENT_NAMES_ARR+=("${name}")
  AGENT_IDS_ARR+=("${agent_id}")

  # Mount skills (replaces all assignments — set, not add)
  if [[ -n "${skills_csv}" ]]; then
    multica agent skills set "${agent_id}" --skill-ids "${skills_csv}" >/dev/null
  fi
}

# Universal skills (all 9 agents get these)
UNIVERSAL=("01-read-product-context" "02-branch-conventions" "03-multica-handoff")

create_agent "pm-grooming"   "claude-opus-4-7"   3 "${UNIVERSAL[@]}" "04-bootstrap-product" "05-grill-us" "06-product-planning"
create_agent "pm-refiner"    "claude-opus-4-7"   3 "${UNIVERSAL[@]}" "07-refine-us"
create_agent "designer"      "claude-sonnet-4-7" 3 "${UNIVERSAL[@]}" "08-design-sketch"
create_agent "qa-planner"    "claude-sonnet-4-7" 3 "${UNIVERSAL[@]}" "09-bdd-writer"
create_agent "task-breaker"  "claude-opus-4-7"   2 "${UNIVERSAL[@]}" "10-break-us"
create_agent "fe-dev"        "claude-sonnet-4-7" 6 "${UNIVERSAL[@]}" "11-tdd-fe"
create_agent "be-dev"        "claude-sonnet-4-7" 6 "${UNIVERSAL[@]}" "12-tdd-be"
create_agent "code-reviewer" "claude-opus-4-7"   6 "${UNIVERSAL[@]}" "13-code-review"
create_agent "qa-tester"     "claude-sonnet-4-7" 4 "${UNIVERSAL[@]}" "14-e2e-write" "14b-playwright-smoke"

echo "    ✓ 9 agents created"

# ──────────────────────────────────────────────────────────────────────────────
# 7. Set custom env on relevant agents via stdin (avoids shell history leakage)
# ──────────────────────────────────────────────────────────────────────────────
set_env_for_agent() {
  local agent_name="$1"; shift
  local agent_id
  agent_id=$(lookup_agent_id "$agent_name")
  [[ -z "$agent_id" ]] && return 0

  # Build JSON object from key=value pairs
  local json="{"
  local first=1
  for kv in "$@"; do
    local k="${kv%%=*}"
    local v="${kv#*=}"
    [[ -z "$v" ]] && continue
    [[ $first -eq 0 ]] && json+=","
    json+="\"${k}\":$(printf '%s' "$v" | jq -Rs .)"
    first=0
  done
  json+="}"

  if [[ "$json" == "{}" ]]; then
    return 0
  fi

  printf '%s' "$json" | multica agent update "${agent_id}" --custom-env-stdin >/dev/null
}

if [[ -n "${GH_TOKEN:-}${DATABASE_URL:-}" ]]; then
  echo "==> Setting custom env on relevant agents..."
  # pm-grooming needs GH_TOKEN to commit+push the bootstrap-product PR
  # task-breaker creates branches via gh; code-reviewer reads PR diffs via gh
  for agent in pm-grooming task-breaker code-reviewer; do
    set_env_for_agent "$agent" "GH_TOKEN=${GH_TOKEN:-}"
  done
  # devs/qa need both: GH_TOKEN for git/PR + DATABASE_URL for tests
  for agent in fe-dev be-dev qa-tester; do
    set_env_for_agent "$agent" "GH_TOKEN=${GH_TOKEN:-}" "DATABASE_URL=${DATABASE_URL:-}"
  done
  echo "    ✓ Env vars set"
else
  echo "    ⚠ GH_TOKEN and DATABASE_URL not set — agents will need them later via 'multica agent update --custom-env-stdin'"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 8. Done
# ──────────────────────────────────────────────────────────────────────────────
cat <<EOF

==========================================================
✅ Workspace provisioned: ${PRODUCT_SLUG}
==========================================================

Workspace ID: ${WORKSPACE_ID}
Project ID:   ${PROJECT_ID}
Runtime ID:   ${RUNTIME_ID}

Agents:
$(for i in "${!AGENT_NAMES_ARR[@]}"; do printf "  %-16s %s\n" "${AGENT_NAMES_ARR[$i]}" "${AGENT_IDS_ARR[$i]}"; done | sort)

Next steps:

1. Run bootstrap-product (one-shot Lean Inception):
   ${SCRIPT_DIR}/bootstrap-product-instructions.sh ${PRODUCT_SLUG}
   (Outputs the chat URL + first message for you to paste — chat is UI-only.)

2. After Product/ PR is merged, create your first US:
   - Manually in the UI, or
   - Via CLI:
       MULTICA_WORKSPACE_ID=${WORKSPACE_ID} multica issue create \\
         --title "US-1: <feature>" --project ${PROJECT_ID} \\
         --assignee pm-grooming --status backlog

The 9 agents are ready and waiting.

EOF
