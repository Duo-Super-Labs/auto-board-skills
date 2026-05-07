import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import type { Command } from "commander";
import { runWithOutput } from "../lib/exec.js";
import { authStatus as ghAuthStatus } from "../lib/github.js";
import { findClaudeRuntime, authStatus as multicaAuthStatus } from "../lib/multica-cli.js";
import { readRegistry } from "../lib/port-registry.js";
import { checkLine, header, warnLine } from "../log.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, "../../../port-registry.json");

interface CheckResult {
  label: string;
  ok: boolean;
  warn?: boolean;
  detail?: string;
}

async function checkTailscale(): Promise<CheckResult> {
  const result = await runWithOutput("tailscale", ["status", "--json"], {
    rejectOnError: false,
  });
  if (result.failed) {
    return {
      label: "Tailscale",
      ok: false,
      detail: "tailscale CLI not found or not running",
    };
  }
  try {
    const status = JSON.parse(result.stdout) as {
      BackendState?: string;
      Self?: { Online?: boolean };
    };
    const online = status.BackendState === "Running" || status.Self?.Online === true;
    return {
      label: "Tailscale",
      ok: online,
      detail: online ? "connected" : `state=${status.BackendState ?? "unknown"}`,
    };
  } catch {
    return { label: "Tailscale", ok: false, detail: "could not parse tailscale status" };
  }
}

async function checkMulticaAuth(): Promise<CheckResult> {
  const status = await multicaAuthStatus();
  return {
    label: "Multica auth",
    ok: status.authenticated,
    detail: status.authenticated ? status.user : "run: multica login",
  };
}

async function checkClaudeRuntime(): Promise<CheckResult> {
  const multica = await multicaAuthStatus();
  if (!multica.authenticated) {
    return {
      label: "Claude runtime (online)",
      ok: false,
      detail: "multica not authenticated — skipped",
      warn: true,
    };
  }
  const runtime = await findClaudeRuntime();
  return {
    label: "Claude runtime (online)",
    ok: runtime !== null,
    detail: runtime
      ? `${runtime.name} (${runtime.id.slice(0, 8)})`
      : "no online claude runtime; start daemon on WSL: ssh renatoastra@desktop-76n2ggj 'multica daemon start'",
  };
}

async function checkGhAuth(): Promise<CheckResult> {
  const status = await ghAuthStatus();
  return {
    label: "gh CLI auth",
    ok: status.authenticated,
    detail: status.authenticated ? status.user : "run: gh auth login",
  };
}

async function checkPortRegistry(): Promise<CheckResult> {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return {
      label: "port-registry.json",
      ok: false,
      detail: `not found at ${REGISTRY_PATH}`,
    };
  }
  try {
    const registry = readRegistry(REGISTRY_PATH);
    const productCount = Object.keys(registry.products).length;
    return {
      label: "port-registry.json",
      ok: true,
      detail: `valid — ${productCount} product(s), next offset=${registry.$next_available_offset}`,
    };
  } catch (err) {
    return {
      label: "port-registry.json",
      ok: false,
      detail: `invalid JSON or schema: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description(
      "Preflight check: Tailscale, multica auth, online Claude runtime, gh auth, port-registry"
    )
    .action(async () => {
      header("auto-board doctor");

      const checks = await Promise.allSettled([
        checkTailscale(),
        checkMulticaAuth(),
        checkClaudeRuntime(),
        checkGhAuth(),
        checkPortRegistry(),
      ]);

      let allOk = true;
      const results: CheckResult[] = [];

      for (const check of checks) {
        if (check.status === "fulfilled") {
          results.push(check.value);
          if (!check.value.ok && !check.value.warn) allOk = false;
        } else {
          results.push({
            label: "unknown check",
            ok: false,
            detail: String(check.reason),
          });
          allOk = false;
        }
      }

      console.log();
      for (const r of results) {
        if (!r.ok && r.warn) {
          console.log(warnLine(r.label, r.detail));
        } else {
          console.log(checkLine(r.label, r.ok, r.detail));
        }
      }

      console.log();
      if (allOk) {
        console.log("\x1b[32mAll checks passed. Ready to auto-board.\x1b[0m");
      } else {
        console.log("\x1b[31mSome checks failed. Fix issues above before proceeding.\x1b[0m");
        process.exitCode = 1;
      }
    });
}
