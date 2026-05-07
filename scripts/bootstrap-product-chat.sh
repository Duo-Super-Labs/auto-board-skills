#!/usr/bin/env bash
#
# bootstrap-product-chat.sh
# -----------------------------------------------------------------------------
# Opens a Multica chat session with `pm-grooming` agent and pre-fills the
# bootstrap-product invocation. Used ONCE per product, right after
# provision-product-workspace.sh finishes.
#
# Why a chat (not an issue): bootstrap-product runs BEFORE Product/ exists,
# so issue-context skills (which require Product/) would fail. Chat is sandbox.
#
# Usage:
#   ./bootstrap-product-chat.sh <product-slug>
#
# Example:
#   ./bootstrap-product-chat.sh duozada
# -----------------------------------------------------------------------------

set -euo pipefail

PRODUCT_SLUG="${1:?Usage: $0 <product-slug>}"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing: $1" >&2; exit 1; }
}

require multica

# Look up the workspace + agent
WORKSPACE_ID=$(multica workspace get "${PRODUCT_SLUG}" --output json | jq -r '.id' 2>/dev/null || true)

if [[ -z "${WORKSPACE_ID}" || "${WORKSPACE_ID}" == "null" ]]; then
  echo "❌ Workspace '${PRODUCT_SLUG}' not found. Run provision-product-workspace.sh first." >&2
  exit 1
fi

PM_AGENT_ID=$(multica agent get "${WORKSPACE_ID}" pm-grooming --output json | jq -r '.id')

# Look up the product repo whitelisted on the workspace
REPO_URL=$(multica workspace repo list "${WORKSPACE_ID}" --output json \
  | jq -r --arg slug "${PRODUCT_SLUG}" '.[] | select(.url | endswith($slug)) | .url' \
  | head -1)

if [[ -z "${REPO_URL}" ]]; then
  echo "⚠ Could not auto-detect product repo. Will pass slug only."
fi

# Compose the first message
FIRST_MSG="Run skill bootstrap-product.

Product: ${PRODUCT_SLUG}
Repo: ${REPO_URL:-<not detected — please confirm>}

Please grill me through the 6 Lean Inception artifacts:
1. Vision
2. Personas
3. Journeys
4. Features (with MVP slice)
5. Constraints
6. Glossary

When all six are drafted, commit them to Product/ on a branch and open a PR against main.

Use the templates from this skill's directory as starting points."

echo "==> Creating chat session with pm-grooming for ${PRODUCT_SLUG}..."

CHAT_OUT=$(multica chat create \
  --workspace "${WORKSPACE_ID}" \
  --agent "${PM_AGENT_ID}" \
  --first-message "${FIRST_MSG}" \
  --output json)

CHAT_ID=$(echo "${CHAT_OUT}" | jq -r '.id')
CHAT_URL=$(echo "${CHAT_OUT}" | jq -r '.url // empty')

if [[ -z "${CHAT_URL}" ]]; then
  CHAT_URL="http://localhost:3000/${PRODUCT_SLUG}/chat/${CHAT_ID}"
fi

cat <<EOF

==========================================================
✅ Bootstrap chat opened
==========================================================

Chat URL: ${CHAT_URL}

Open the URL and answer the agent's grilling questions one by one.
The agent will produce 6 Markdown files in Product/ and open a PR.

After you merge the PR:
- Create your first US (chat with pm-grooming again, or manually in the UI)
- The auto-board pipeline starts flowing

EOF

# Best-effort open in browser
if command -v open >/dev/null 2>&1; then
  open "${CHAT_URL}" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${CHAT_URL}" 2>/dev/null || true
fi
