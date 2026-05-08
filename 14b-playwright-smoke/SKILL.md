---
name: playwright-smoke
description: Manual smoke test via Playwright MCP — spawns a browser, walks the happy path, captures screenshots. Used after automated E2E pass to verify visual + behavior in real browser.
---

# Playwright smoke

Used by `qa-tester` agent during `phase=test`, AFTER `e2e-write` has produced and run the spec.

## Why

Automated E2E catches behavior; manual smoke via MCP catches:
- Layout regressions (overflow, broken responsive)
- Loading states actually visible
- Toast positioning, color, severity
- Real human eyeballs on the flow

## Prerequisites

- Local dev server up: `pnpm dev` (admin starter has it on port 3000 by default)
- Database seeded: `pnpm --filter @duolabs/database seed`
- `playwright` MCP server registered in `.mcp.json` (template ships this)

## Steps

### 1. Start the dev server in background (if not running)

```bash
pnpm dev > /tmp/dev-server.log 2>&1 &
DEV_PID=$!
sleep 8  # wait for compile
```

Check it's up:

```bash
curl -sf http://localhost:3000/ > /dev/null && echo "UP" || echo "DOWN"
```

### 2. Use Playwright MCP

Invoke MCP tools (from your Claude Code instance) to control a real browser. The `playwright` MCP exposes:

- `browser_navigate` — go to URL
- `browser_snapshot` — get DOM accessibility snapshot
- `browser_click` — click on element by ref
- `browser_type` — type into field
- `browser_take_screenshot` — capture image (saved or returned)

Walk the happy path:

```
1. browser_navigate to http://localhost:3000/login
2. Type email + password (use seed credentials, e.g. alice@acme.com / Test1234!)
3. Click "Sign in"
4. browser_navigate to http://localhost:3000/app/non-conformities
5. browser_snapshot to confirm rows visible
6. Click 3 checkboxes
7. Click "Bulk print (3 sel)"
8. Wait for spinner → result
9. browser_take_screenshot — save as /tmp/us-DUO-12-smoke-1.png
10. (optional) Walk member role:
    - Sign out
    - Sign in as member (e.g. bob@acme.com / Test1234!)
    - Navigate to /app/non-conformities
    - Confirm "Bulk print" button is NOT visible
    - browser_take_screenshot — save as /tmp/us-DUO-12-smoke-2-member.png
```

### 3. Attach screenshots to Multica

```bash
multica issue attach <parent-us-id> /tmp/us-DUO-12-smoke-1.png --description "Smoke: bulk print with 3 selected (super-admin)"
multica issue attach <parent-us-id> /tmp/us-DUO-12-smoke-2-member.png --description "Smoke: button hidden for member role"
```

### 4. Comment summary

```markdown
## Smoke v1

Local browser walkthrough via Playwright MCP.

### Happy path
- ✅ Login as alice@acme.com (super-admin)
- ✅ Listing renders 10 NCs
- ✅ Selection counter updates correctly
- ✅ Bulk print button label changes to "Bulk print (3 sel)"
- ✅ Click triggers loading state then download dialog
- ✅ PDF opens with 3 NCs

### RBAC
- ✅ Login as bob@acme.com (member)
- ✅ Bulk print button is NOT visible

### Visual
- ✅ Mobile viewport (375x667) — selection counter overlays floating button correctly
- ✅ Desktop viewport (1440x900) — header buttons aligned right
- ⚠️ Loading skeleton briefly flashes empty state at 100ms before query resolves (minor, deferred)

Screenshots attached.
```

### 5. Stop dev server

```bash
kill $DEV_PID 2>/dev/null
```

(Or leave running if you'll do more smoke today.)

## When smoke reveals a real bug

Same flow as `e2e-write` step 6 — create a fix child issue, move parent back to `phase=dev`. Smoke findings carry MORE weight than spec failures because they catch what automation misses (visual, UX).

## Visual verification gate (4 mandatory checks)

⚠️ **Agents do not see the screen** — the Playwright spec asserts on the DOM, but pixels can be wrong even when the DOM is correct. These 4 checks are the human-equivalent verification you do via Playwright MCP:

### Check 1 — Console errors

```js
// Via Playwright MCP, in the browser
console_logs_check
```

Pass: zero `console.error`, zero React warnings, zero hydration mismatches.
Fail: any error → flag in smoke comment, classify as BLOCKER if it's a real error (not a third-party noise).

### Check 2 — Layout

For each viewport (mobile 375×667, desktop 1440×900):
- No horizontal scroll on body unless intentional
- No element overlapping a button/link in a way that prevents clicking
- No text clipped by container (especially on mobile)
- Sidebar/header heights match `--sidebar-width: 240px` / `--header-height: 64px` design tokens
- Loading state actually visible (not flashed for <100ms then gone)

### Check 3 — Interactions

Walk the happy path manually:
- Hover state visible on interactive elements
- Disabled state distinct from active state
- Focus ring on `:focus-visible` (keyboard nav)
- Click feedback (loading spinner, toast, or transition) within 200ms of click

### Check 4 — Special states

For each AC that mentions a special state, verify it visually:
- Empty state: copy is helpful, has a CTA if appropriate
- Loading state: skeleton shape matches the eventual content layout
- Error state: error message is actionable, not "Something went wrong"
- RBAC-hidden state: gated UI is genuinely absent (not just `display: none`-hidden)

## Hard rules

- NEVER skip smoke when product touches user-facing UI
- NEVER mark a US homologation-ready without at least 1 screenshot per persona role involved
- ALWAYS test mobile viewport for any UI feature (CLAUDE.md mandates responsive)
- NEVER fix bugs you found in smoke — cycle back through dev

## End

After smoke + comment, proceed to homologation handoff (see end of `e2e-write/SKILL.md`).
