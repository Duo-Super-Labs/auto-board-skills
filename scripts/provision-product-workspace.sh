#!/usr/bin/env bash
#
# provision-product-workspace.sh
# -----------------------------------------------------------------------------
# Creates a Multica workspace for a new product, imports all 14 skills from
# auto-board-skills repo, and creates the 9 agents with their instructions.
#
# Run AFTER you've forked Duo-Super-Labs/admin to a new product repo
# (e.g., Duo-Super-Labs/duozada). Run BEFORE you start the bootstrap-product
# chat session.
#
# Prerequisites:
#   - multica CLI installed and authenticated (`multica auth status` returns OK)
#   - daemon running (`multica daemon status` returns OK)
#   - claude CLI on PATH (the daemon detects it)
#   - GH_TOKEN env var set (PAT scoped to the Duo-Super-Labs org)
#   - jq, gh
#
# Usage:
#   ./provision-product-workspace.sh <product-slug> <repo-url> [vision-file]
#
# Example:
#   ./provision-product-workspace.sh duozada \
#       https://github.com/Duo-Super-Labs/duozada \
#       /tmp/duozada-vision.md
# -----------------------------------------------------------------------------

set -euo pipefail

PRODUCT_SLUG="${1:?Usage: $0 <product-slug> <repo-url> [vision-file]}"
PRODUCT_REPO="${2:?Usage: $0 <product-slug> <repo-url> [vision-file]}"
VISION_FILE="${3:-}"

SKILLS_REPO="https://github.com/Duo-Super-Labs/auto-board-skills"
SKILLS_BRANCH="main"

# Cross-platform: where this script lives (auto-board-skills repo locally)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SKILLS_DIR="$( cd "${SCRIPT_DIR}/.." && pwd )"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing: $1" >&2; exit 1; }
}

require multica
require gh
require jq

echo "==> Provisioning workspace for product: ${PRODUCT_SLUG}"

# Sanity checks
echo "==> Checking multica auth..."
multica auth status > /dev/null

echo "==> Checking multica daemon..."
multica daemon status > /dev/null

# 1. Create the workspace
echo "==> Creating workspace..."
WORKSPACE_OUT=$(multica workspace create \
  --name "${PRODUCT_SLUG}" \
  --slug "${PRODUCT_SLUG}" \
  --output json)

WORKSPACE_ID=$(echo "${WORKSPACE_OUT}" | jq -r '.id')
echo "    ✓ Workspace created: ${WORKSPACE_ID}"

# 2. Set workspace context (vision summary if provided)
if [[ -n "${VISION_FILE}" && -f "${VISION_FILE}" ]]; then
  echo "==> Setting workspace context from ${VISION_FILE}..."
  multica workspace update "${WORKSPACE_ID}" \
    --context-file "${VISION_FILE}"
  echo "    ✓ Workspace context set (≤500 words recommended)"
else
  echo "    ⚠ No vision file provided. Set workspace context later in Settings."
fi

# 3. Whitelist the product repo
echo "==> Whitelisting repo: ${PRODUCT_REPO}..."
multica workspace repo add "${WORKSPACE_ID}" "${PRODUCT_REPO}"

# Also whitelist the design system + admin template
multica workspace repo add "${WORKSPACE_ID}" "https://github.com/Duo-Super-Labs/ai-ui"     # design system (read-only)
multica workspace repo add "${WORKSPACE_ID}" "https://github.com/Duo-Super-Labs/admin"     # template (read-only reference)

echo "    ✓ Repos whitelisted"

# 4. Create a default Project for the product
echo "==> Creating default Project..."
PROJECT_OUT=$(multica project create \
  --workspace "${WORKSPACE_ID}" \
  --name "MVP" \
  --description "Minimum viable product slice" \
  --status "in_progress" \
  --output json)

PROJECT_ID=$(echo "${PROJECT_OUT}" | jq -r '.id')

# Attach the product repo as a Project Resource
multica project resource add "${PROJECT_ID}" \
  --type github_repo \
  --url "${PRODUCT_REPO}" \
  --name "${PRODUCT_SLUG}"

echo "    ✓ Project created with repo resource"

# 5. Import the 14 skills
echo "==> Importing 14 skills from ${SKILLS_REPO}..."

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
  echo "    importing ${skill_dir}..."
  IMPORT_OUT=$(multica skill import \
    --workspace "${WORKSPACE_ID}" \
    --url "${SKILLS_REPO}/tree/${SKILLS_BRANCH}/${skill_dir}" \
    --output json)
  SKILL_ID=$(echo "${IMPORT_OUT}" | jq -r '.id')
  SKILL_ID_BY_DIR["${skill_dir}"]="${SKILL_ID}"
done

echo "    ✓ 15 skills imported"  # 14b counts as separate file

# 6. Create the 9 agents
echo "==> Creating 9 agents..."

# Helper: resolve skill IDs from list of skill-dir names
ids_for() {
  local result=""
  for s in "$@"; do
    if [[ -n "${SKILL_ID_BY_DIR[${s}]:-}" ]]; then
      result="${result}${SKILL_ID_BY_DIR[${s}]},"
    fi
  done
  echo "${result%,}"
}

create_agent() {
  local name="$1" model="$2" max_conc="$3" instructions_file="$4"
  shift 4
  local skills_csv
  skills_csv=$(ids_for "$@")

  echo "    creating ${name} (model: ${model}, ${max_conc} concurrent)..."

  multica agent create \
    --workspace "${WORKSPACE_ID}" \
    --name "${name}" \
    --provider claude-code \
    --visibility workspace \
    --max-concurrent-tasks "${max_conc}" \
    --args "--model ${model}" \
    --instructions-file "${instructions_file}" \
    --skills "${skills_csv}" \
    > /dev/null

  echo "      ✓ ${name}"
}

# Universal skills used by all 9
UNIVERSAL=("01-read-product-context" "02-branch-conventions" "03-multica-handoff")

create_agent "pm-grooming"    "claude-opus-4"   3 "${SKILLS_DIR}/agents/pm-grooming.md"   "${UNIVERSAL[@]}" "04-bootstrap-product" "05-grill-us" "06-product-planning"
create_agent "pm-refiner"     "claude-opus-4"   3 "${SKILLS_DIR}/agents/pm-refiner.md"    "${UNIVERSAL[@]}" "07-refine-us"
create_agent "designer"       "claude-sonnet-4" 3 "${SKILLS_DIR}/agents/designer.md"      "${UNIVERSAL[@]}" "08-design-sketch"
create_agent "qa-planner"     "claude-sonnet-4" 3 "${SKILLS_DIR}/agents/qa-planner.md"    "${UNIVERSAL[@]}" "09-bdd-writer"
create_agent "task-breaker"   "claude-opus-4"   2 "${SKILLS_DIR}/agents/task-breaker.md"  "${UNIVERSAL[@]}" "10-break-us"
create_agent "fe-dev"         "claude-sonnet-4" 6 "${SKILLS_DIR}/agents/fe-dev.md"        "${UNIVERSAL[@]}" "11-tdd-fe"
create_agent "be-dev"         "claude-sonnet-4" 6 "${SKILLS_DIR}/agents/be-dev.md"        "${UNIVERSAL[@]}" "12-tdd-be"
create_agent "code-reviewer"  "claude-opus-4"   6 "${SKILLS_DIR}/agents/code-reviewer.md" "${UNIVERSAL[@]}" "13-code-review"
create_agent "qa-tester"      "claude-sonnet-4" 4 "${SKILLS_DIR}/agents/qa-tester.md"     "${UNIVERSAL[@]}" "14-e2e-write" "14b-playwright-smoke"

# 7. Custom env (GH_TOKEN, DATABASE_URL) — set per-agent
echo "==> Setting custom env per agent..."
if [[ -n "${GH_TOKEN:-}" ]]; then
  for agent in task-breaker fe-dev be-dev code-reviewer qa-tester; do
    multica agent env set "${WORKSPACE_ID}" "${agent}" GH_TOKEN "${GH_TOKEN}"
  done
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  for agent in fe-dev be-dev qa-tester; do
    multica agent env set "${WORKSPACE_ID}" "${agent}" DATABASE_URL "${DATABASE_URL}"
  done
fi

echo "    ✓ Env vars set"

# 8. Done
cat <<EOF

==========================================================
✅ Workspace provisioned: ${PRODUCT_SLUG}
==========================================================

Next steps:

1. Open the workspace UI:
   open http://localhost:3000/${PRODUCT_SLUG}

2. Run bootstrap-product in a chat session:
   ${SCRIPT_DIR}/bootstrap-product-chat.sh ${PRODUCT_SLUG}

3. After bootstrap PR is merged, create your first US:
   - Manually in the UI, or
   - Chat with pm-grooming agent: "Run skill grill-us. Seed: <your idea>."

The 9 agents are ready and waiting.

EOF
