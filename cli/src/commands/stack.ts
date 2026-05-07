import * as path from "node:path";
import * as url from "node:url";
import type { Command } from "commander";
import { runStream } from "../lib/exec.js";
import { log } from "../log.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STACK_SCRIPT = path.resolve(__dirname, "../../../scripts/product-stack.sh");

type StackAction = "up" | "down" | "nuke" | "status" | "database-url";

const VALID_ACTIONS: StackAction[] = ["up", "down", "nuke", "status", "database-url"];

function isValidAction(action: string): action is StackAction {
  return VALID_ACTIONS.includes(action as StackAction);
}

export function registerStack(program: Command): void {
  program
    .command("stack <action> <slug> [repo-path]")
    .description(
      "Manage a product's Docker stack (delegates to product-stack.sh).\n" +
        "  Actions: up | down | nuke | status | database-url\n" +
        "  slug: product slug (e.g. duozada)\n" +
        "  repo-path: absolute path to product repo (required for up/down/nuke)"
    )
    .action(async (action: string, slug: string, repoPath: string | undefined) => {
      if (!isValidAction(action)) {
        log.error(`Invalid action '${action}'. Valid actions: ${VALID_ACTIONS.join(", ")}`);
        process.exitCode = 1;
        return;
      }

      const args: string[] = [action, slug];
      if (repoPath) {
        args.push(repoPath);
      }

      log.info(`Running: product-stack.sh ${args.join(" ")}`);

      try {
        await runStream("bash", [STACK_SCRIPT, ...args], {});
      } catch (err) {
        log.error(`Stack ${action} failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
