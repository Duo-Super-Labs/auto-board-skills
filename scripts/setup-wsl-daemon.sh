#!/usr/bin/env bash
#
# setup-wsl-daemon.sh
# -----------------------------------------------------------------------------
# Idempotent setup of the Multica daemon on the WSL Ubuntu host (the execution
# surface for the auto-board pipeline). Run this on a fresh WSL or whenever
# you want to verify the daemon is properly configured.
#
# Run AS the user that should own the daemon (typically renatoastra), NOT root.
#
# What this script ensures:
#   1. multica CLI is installed
#   2. claude CLI is installed and on PATH (or symlinked into /usr/local/bin)
#   3. multica is configured to point at the local self-host server
#   4. Authenticated (uses provided PAT or prompts for one)
#   5. Daemon is running
#
# Usage (over SSH from the Mac):
#   ssh renatoastra@desktop-76n2ggj 'bash -s' < setup-wsl-daemon.sh
#
# Or copy to the WSL machine and run there:
#   scp setup-wsl-daemon.sh renatoastra@desktop-76n2ggj:/tmp/
#   ssh renatoastra@desktop-76n2ggj 'bash /tmp/setup-wsl-daemon.sh'
#
# Optional: set MULTICA_PAT env var ahead of time for non-interactive auth:
#   MULTICA_PAT=mul_... ssh ... 'bash -s' < setup-wsl-daemon.sh
# -----------------------------------------------------------------------------

set -euo pipefail

SERVER_URL="${SERVER_URL:-http://127.0.0.1:8080}"

echo "════════════════════════════════════════════════════════════"
echo "  Multica daemon setup — WSL Ubuntu"
echo "════════════════════════════════════════════════════════════"
echo "  Hostname:   $(hostname)"
echo "  User:       $(whoami)"
echo "  Server URL: ${SERVER_URL}"
echo

# ─── Step 1: multica CLI ────────────────────────────────────────────────────
echo "==> Step 1/5: Verifying multica CLI..."
if ! command -v multica >/dev/null 2>&1; then
  echo "    multica not on PATH — installing via official installer..."
  curl -fsSL https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh | bash
  if ! command -v multica >/dev/null 2>&1; then
    echo "❌ Install completed but multica still not on PATH. Check ~/.local/bin or /usr/local/bin." >&2
    exit 1
  fi
fi
MULTICA_VERSION=$(multica --version 2>/dev/null | head -1)
echo "    ✓ ${MULTICA_VERSION}"

# ─── Step 2: claude CLI ─────────────────────────────────────────────────────
echo "==> Step 2/5: Verifying claude CLI..."
CLAUDE_BIN=""
for candidate in "$(command -v claude 2>/dev/null)" "${HOME}/.local/bin/claude" "/usr/local/bin/claude" "/usr/bin/claude"; do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    CLAUDE_BIN="$candidate"
    break
  fi
done

if [[ -z "$CLAUDE_BIN" ]]; then
  echo "❌ claude CLI not found in any common location."
  echo "   Install it: https://docs.anthropic.com/en/docs/claude-code/quickstart"
  echo "   Then re-run this script."
  exit 1
fi
echo "    ✓ ${CLAUDE_BIN}"

# Ensure /usr/local/bin/claude exists so non-interactive PATHs (cron, daemon) find it
if [[ "$CLAUDE_BIN" != "/usr/local/bin/claude" && ! -e "/usr/local/bin/claude" ]]; then
  echo "    creating symlink /usr/local/bin/claude -> ${CLAUDE_BIN}..."
  if [[ -w /usr/local/bin ]]; then
    ln -sf "$CLAUDE_BIN" /usr/local/bin/claude
  else
    sudo ln -sf "$CLAUDE_BIN" /usr/local/bin/claude
  fi
  echo "    ✓ symlinked"
fi

# ─── Step 3: Configure server URL ───────────────────────────────────────────
echo "==> Step 3/5: Verifying CLI config..."
CURRENT_SERVER=$(jq -r '.server_url // empty' "${HOME}/.multica/config.json" 2>/dev/null || true)

if [[ -z "$CURRENT_SERVER" ]]; then
  echo "    No config yet — running 'multica setup self-host --server-url ${SERVER_URL}'..."
  multica setup self-host --server-url "${SERVER_URL}"
elif [[ "$CURRENT_SERVER" != "$SERVER_URL" ]]; then
  echo "    ⚠ Config points to ${CURRENT_SERVER} but expected ${SERVER_URL}."
  echo "      Reconfiguring..."
  multica setup self-host --server-url "${SERVER_URL}"
else
  echo "    ✓ Already configured for ${CURRENT_SERVER}"
fi

# ─── Step 4: Authenticate ───────────────────────────────────────────────────
echo "==> Step 4/5: Verifying auth..."
if multica auth status >/dev/null 2>&1; then
  AUTH_USER=$(multica auth status 2>&1 | awk -F': ' '/^User:/ {print $2; exit}' || echo "?")
  echo "    ✓ Already authenticated as ${AUTH_USER}"
else
  if [[ -n "${MULTICA_PAT:-}" ]]; then
    echo "    Authenticating via provided PAT..."
    multica login --token "${MULTICA_PAT}"
  else
    echo "    ⚠ Not authenticated and no MULTICA_PAT env var provided."
    echo "      Either:"
    echo "        - re-run with MULTICA_PAT=mul_... in front, or"
    echo "        - run 'multica login' interactively in this shell"
    exit 1
  fi
fi

# ─── Step 5: Start daemon ────────────────────────────────────────────────────
echo "==> Step 5/5: Starting daemon..."
DAEMON_STATUS=$(multica daemon status 2>&1 || true)
if echo "$DAEMON_STATUS" | grep -qi 'running'; then
  echo "    ✓ Daemon already running"
  echo "    $(echo "$DAEMON_STATUS" | head -3 | tr '\n' ' ')"
else
  multica daemon start
  sleep 2
  multica daemon status | head -5
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo
echo "════════════════════════════════════════════════════════════"
echo "  ✅ Daemon setup complete on $(hostname)"
echo "════════════════════════════════════════════════════════════"
echo
multica daemon status
echo
echo "Detected agents (Multica server's view):"
multica runtime list 2>&1 | head -10 || true
echo
echo "Next: provision a workspace from the Mac (or here):"
echo "  cd /path/to/auto-board-skills"
echo "  ./scripts/provision-product-workspace.sh <slug> <repo-url>"
