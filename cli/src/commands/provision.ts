import * as path from "node:path";
import * as url from "node:url";
import type { Command } from "commander";
import { runStream } from "../lib/exec.js";
import { log } from "../log.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PROVISION_SCRIPT = path.resolve(__dirname, "../../../scripts/provision-product-workspace.sh");

export function registerProvision(program: Command): void {
  program
    .command("provision <slug>")
    .description(
      "Provision a Multica workspace for a product (delegates to provision-product-workspace.sh).\n" +
        "  Requires: GH_TOKEN and DATABASE_URL env vars set.\n" +
        "  The workspace must already exist in Multica UI."
    )
    .argument("<repo-url>", "GitHub repo URL (e.g. https://github.com/Duo-Super-Labs/slug)")
    .option("--vision-file <path>", "Path to vision summary markdown file (optional)")
    .action(async (slug: string, repoUrl: string, opts: { visionFile?: string }) => {
      const args = [slug, repoUrl];
      if (opts.visionFile) {
        args.push(opts.visionFile);
      }

      log.info(`Provisioning workspace for: ${slug}`);
      log.info(`Delegating to: provision-product-workspace.sh ${args.join(" ")}`);

      try {
        await runStream("bash", [PROVISION_SCRIPT, ...args], {});
      } catch (err) {
        log.error(`Provision failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
