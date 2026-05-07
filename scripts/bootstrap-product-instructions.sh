#!/usr/bin/env bash
#
# bootstrap-product-instructions.sh
# -----------------------------------------------------------------------------
# Multica CLI v0.2.26 does NOT support `multica chat` — chat sessions are
# UI-only. This script outputs the chat URL + a copy-paste-ready first message
# for the bootstrap-product flow, and (best-effort) opens the URL in browser.
#
# Run AFTER provision-product-workspace.sh.
#
# Usage:
#   ./bootstrap-product-instructions.sh <product-slug>
# -----------------------------------------------------------------------------

set -euo pipefail

PRODUCT_SLUG="${1:?Usage: $0 <product-slug>}"

require() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing: $1" >&2; exit 1; }; }
require multica
require jq

# Resolve workspace ID by name (CLI v0.2.26: `workspace list` returns table only)
WORKSPACE_ID=$(multica workspace list 2>/dev/null | awk -v target="$PRODUCT_SLUG" '
  NR>1 {
    id=$1
    name=""
    for (i=2; i<=NF; i++) name = (name=="") ? $i : name " " $i
    if (tolower(name) == tolower(target)) { print id; exit }
  }
')

if [[ -z "$WORKSPACE_ID" ]]; then
  echo "❌ Workspace '${PRODUCT_SLUG}' not found. Run provision-product-workspace.sh first." >&2
  exit 1
fi

# Slug is the lowercased name (Multica convention); fall back to product-slug arg
SLUG="$PRODUCT_SLUG"

# Find the product repo from the MVP project resources
PROJECT_LIST_JSON=$(MULTICA_WORKSPACE_ID="$WORKSPACE_ID" multica project list --output json 2>/dev/null || echo '[]')
PROJECT_ID=$(echo "$PROJECT_LIST_JSON" | jq -r --arg slug "$PRODUCT_SLUG" '
  (.[]? // empty) | select(.title == "MVP" or .title == $slug) | .id
' | head -1)

REPO_URL=""
if [[ -n "$PROJECT_ID" && "$PROJECT_ID" != "null" ]]; then
  # Multica returns resources as { resource_type, resource_ref: {url}, label, ... }
  # so we drill into .resource_ref.url and filter for the slug.
  REPO_URL=$(MULTICA_WORKSPACE_ID="$WORKSPACE_ID" multica project resource list "$PROJECT_ID" --output json 2>/dev/null \
    | jq -r --arg slug "$PRODUCT_SLUG" '
      (.[]? // empty)
      | select(.resource_type == "github_repo")
      | (.resource_ref.url // "")
      | select(. != "" and test($slug))
    ' | head -1)
fi

# Resolve server URL from config (best effort)
SERVER_URL=$(jq -r '.server_url // "http://localhost:3000"' ~/.multica/config.json 2>/dev/null \
  | sed 's|/api$||')

# Multica self-host: web app is the same host as server (port 3000 typically)
# In hosted scenarios server_url ends in /api; the web app is the root.
APP_URL="${SERVER_URL%/api}"
[[ "$APP_URL" == "$SERVER_URL" ]] && APP_URL="$SERVER_URL"

CHAT_URL="${APP_URL}/${SLUG}/chat"

# Compose the first message.
# Avoid FIRST_MSG=$(cat <<EOF ... EOF) — heredoc bodies with parens like
# "(vision board template)" trip bash's $() parser ("unexpected EOF while
# looking for matching `)'"). `read -r -d ''` is the bullet-proof form.
read -r -d '' FIRST_MSG <<EOF || true
Run skill bootstrap-product.

Product: ${PRODUCT_SLUG}
Repo: ${REPO_URL:-<not detected, please confirm>}

Please grill me through the 6 Lean Inception artifacts in order:

  1. Vision -- vision board template
  2. Personas -- 3 to 5; anchor in real users
  3. Journeys -- one per persona primary goal; pain points per step
  4. Features -- canvas plus thin MVP slice, max 7 features
  5. Constraints -- technical inherited from admin, business, NFR, hard nos
  6. Glossary -- 10 to 30 ubiquitous terms

Use the templates from this skill directory as starting points. Ask one
question at a time and wait for my reply before the next.

When all six are drafted, commit them to Product/ on a branch and open a PR
against main.
EOF

# Output instructions
cat <<EOF

==========================================================
Bootstrap product — copy-paste setup
==========================================================

The multica CLI v0.2.26 does NOT have a 'chat' command. Chat is UI-only.
Open the chat in your browser, select the 'pm-grooming' agent, and paste
the message below as your first message.

──────────────────────────────────────────────────────────
Chat URL:    ${CHAT_URL}
Workspace:   ${SLUG} (${WORKSPACE_ID})
Agent:       pm-grooming
──────────────────────────────────────────────────────────

First message (copy from the next line up to the next divider):
──────────────────────────────────────────────────────────
${FIRST_MSG}
──────────────────────────────────────────────────────────

After the agent finishes the 6 artifacts and opens the PR:
  - Review the PR
  - Merge into main
  - Bootstrap is done forever for this product

Then create your first US (Backlog):
  - Chat with pm-grooming again: "Run skill grill-us. Seed: <your idea>."
  - Or via CLI:
      MULTICA_WORKSPACE_ID=${WORKSPACE_ID} multica issue create \\
        --title "US-1: <feature>" --project ${PROJECT_ID:-<project-id>} \\
        --assignee pm-grooming --status backlog

EOF

# Best-effort open
if command -v open >/dev/null 2>&1; then
  open "${CHAT_URL}" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${CHAT_URL}" 2>/dev/null || true
fi
