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

require() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing: $1" >&2; exit 1; }; }
require multica
require jq

echo "==> Provisioning workspace for product: ${PRODUCT_SLUG}"

# ──────────────────────────────────────────────────────────────────────────────
# 0. Sanity
# ──────────────────────────────────────────────────────────────────────────────
echo "==> Checking multica auth..."
multica auth status >/dev/null 2>&1 || { echo "❌ multica not authenticated. Run: multica login"; exit 1; }

echo "==> Checking multica daemon..."
DAEMON_STATUS=$(multica daemon status 2>&1 || true)
if echo "$DAEMON_STATUS" | grep -qi 'stopped'; then
  echo "❌ Daemon is stopped. Start it: multica daemon start"
  exit 1
fi

# ──────────────────────────────────────────────────────────────────────────────
# 1. Resolve workspace ID by slug (workspace must already exist via UI)
# ──────────────────────────────────────────────────────────────────────────────
echo "==> Resolving workspace ID for slug '${PRODUCT_SLUG}'..."
WORKSPACE_JSON=$(multica workspace list --output json)
WORKSPACE_ID=$(echo "$WORKSPACE_JSON" | jq -r --arg slug "$PRODUCT_SLUG" '
  (.[]? // empty) | select(.slug == $slug or .name == $slug) | .id
' | head -1)

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
# 3. Create MVP project with repos attached as resources
# ──────────────────────────────────────────────────────────────────────────────
echo "==> Creating 'MVP' project with repos..."
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

declare -A SKILL_ID_BY_DIR

for skill_dir in "${SKILLS[@]}"; do
  printf "    importing %-28s ... " "${skill_dir}"
  IMPORT_OUT=$(multica skill import \
    --url "${SKILLS_REPO}/tree/${SKILLS_BRANCH}/${skill_dir}" \
    --output json 2>&1) || {
      echo "FAILED"
      echo "    Error: ${IMPORT_OUT}" >&2
      exit 1
    }
  SKILL_ID=$(echo "$IMPORT_OUT" | jq -r '.id')
  SKILL_ID_BY_DIR["${skill_dir}"]="${SKILL_ID}"
  echo "✓ (${SKILL_ID:0:8})"
done

echo "    ✓ ${#SKILLS[@]} skills imported"

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
  for s in "$@"; do
    if [[ -n "${SKILL_ID_BY_DIR[${s}]:-}" ]]; then
      result="${result}${SKILL_ID_BY_DIR[${s}]},"
    fi
  done
  echo "${result%,}"
}

declare -A AGENT_ID_BY_NAME

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

  local agent_id
  agent_id=$(echo "$AGENT_OUT" | jq -r '.id')
  AGENT_ID_BY_NAME["${name}"]="${agent_id}"
  echo "✓ (${agent_id:0:8})"

  # Mount skills (replaces all assignments — set, not add)
  if [[ -n "${skills_csv}" ]]; then
    multica agent skills set "${agent_id}" --skill-ids "${skills_csv}" >/dev/null
  fi
}

# Universal skills (all 9 agents get these)
UNIVERSAL=("01-read-product-context" "02-branch-conventions" "03-multica-handoff")

create_agent "pm-grooming"   "claude-opus-4"   3 "${UNIVERSAL[@]}" "04-bootstrap-product" "05-grill-us" "06-product-planning"
create_agent "pm-refiner"    "claude-opus-4"   3 "${UNIVERSAL[@]}" "07-refine-us"
create_agent "designer"      "claude-sonnet-4" 3 "${UNIVERSAL[@]}" "08-design-sketch"
create_agent "qa-planner"    "claude-sonnet-4" 3 "${UNIVERSAL[@]}" "09-bdd-writer"
create_agent "task-breaker"  "claude-opus-4"   2 "${UNIVERSAL[@]}" "10-break-us"
create_agent "fe-dev"        "claude-sonnet-4" 6 "${UNIVERSAL[@]}" "11-tdd-fe"
create_agent "be-dev"        "claude-sonnet-4" 6 "${UNIVERSAL[@]}" "12-tdd-be"
create_agent "code-reviewer" "claude-opus-4"   6 "${UNIVERSAL[@]}" "13-code-review"
create_agent "qa-tester"     "claude-sonnet-4" 4 "${UNIVERSAL[@]}" "14-e2e-write" "14b-playwright-smoke"

echo "    ✓ 9 agents created"

# ──────────────────────────────────────────────────────────────────────────────
# 7. Set custom env on relevant agents via stdin (avoids shell history leakage)
# ──────────────────────────────────────────────────────────────────────────────
set_env_for_agent() {
  local agent_name="$1"; shift
  local agent_id="${AGENT_ID_BY_NAME[$agent_name]:-}"
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
  for agent in task-breaker code-reviewer; do
    set_env_for_agent "$agent" "GH_TOKEN=${GH_TOKEN:-}"
  done
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
$(for k in "${!AGENT_ID_BY_NAME[@]}"; do printf "  %-16s %s\n" "$k" "${AGENT_ID_BY_NAME[$k]}"; done | sort)

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
