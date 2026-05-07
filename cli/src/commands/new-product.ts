import * as path from "node:path";
import * as clack from "@clack/prompts";
import type { Command } from "commander";
import { Listr } from "listr2";
import { runStream } from "../lib/exec.js";
import { createRepo, repoExists } from "../lib/github.js";
import { ensureProductAllocated, resolveRegistryPath } from "../lib/port-registry.js";
import { buildRemoteScript, sshRun, sshStream } from "../lib/ssh.js";
import { log } from "../log.js";

// Resolve registry + provision script paths relative to the repo root
// (the directory that contains port-registry.json). This works for both
// `bun run src/index.ts` (dev) and the compiled binary (where __dirname
// points to a virtual location and relative paths break).
function resolvePaths(): { registryPath: string; provisionScript: string } {
  const registryPath = resolveRegistryPath();
  const repoRoot = path.dirname(registryPath);
  return {
    registryPath,
    provisionScript: path.join(repoRoot, "scripts", "provision-product-workspace.sh"),
  };
}

const ORG = "Duo-Super-Labs";

interface NewProductContext {
  slug: string;
  repoUrl: string;
  workspaceId?: string;
  repoCreated: boolean;
  portAllocated: boolean;
  stackUp: boolean;
}

export function registerNewProduct(program: Command): void {
  program
    .command("new-product <slug>")
    .description(
      "Orchestrate full provisioning of a new product:\n" +
        "  1. Verify or create GitHub repo\n" +
        "  2. Pause: ask you to create Multica workspace in UI\n" +
        "  3. Add product to port-registry.json\n" +
        "  4. SSH WSL: clone admin, set remote, push, pnpm install, stack up, migrate\n" +
        "  5. Run provision-product-workspace.sh\n" +
        "  6. Print bootstrap instructions"
    )
    .option("--gh-token <token>", "GitHub PAT (overrides GH_TOKEN env var)")
    .option("--database-url <url>", "Override database URL (default: from port-registry)")
    .option("--skip-ssh", "Skip WSL SSH steps (useful for dry-run or testing)")
    .option("--skip-provision", "Skip provision-product-workspace.sh")
    .action(
      async (
        slug: string,
        opts: {
          ghToken?: string;
          databaseUrl?: string;
          skipSsh?: boolean;
          skipProvision?: boolean;
        }
      ) => {
        clack.intro(`auto-board new-product — ${slug}`);

        const ghToken = opts.ghToken ?? process.env.GH_TOKEN;
        if (!ghToken) {
          clack.cancel(
            "GH_TOKEN not set. Pass --gh-token or set the GH_TOKEN environment variable."
          );
          process.exitCode = 1;
          return;
        }

        const ctx: NewProductContext = {
          slug,
          repoUrl: `https://github.com/${ORG}/${slug}`,
          repoCreated: false,
          portAllocated: false,
          stackUp: false,
        };

        // ─── Step 1: GitHub repo ─────────────────────────────────────────────
        const tasks = new Listr<NewProductContext>(
          [
            {
              title: `Verify or create GitHub repo ${ORG}/${slug}`,
              task: async (_ctx, task) => {
                const nameWithOwner = `${ORG}/${slug}`;
                const exists = await repoExists(nameWithOwner);
                if (exists) {
                  task.title = `GitHub repo already exists: ${ctx.repoUrl}`;
                  _ctx.repoCreated = false;
                } else {
                  await createRepo({
                    name: nameWithOwner,
                    private: true,
                    description: `${slug} — auto-board product`,
                  });
                  _ctx.repoCreated = true;
                  task.title = `Created GitHub repo: ${ctx.repoUrl}`;
                }
              },
            },
            {
              title: "Allocate ports in port-registry.json",
              task: async (_ctx, task) => {
                const { registryPath } = resolvePaths();
                const result = ensureProductAllocated(registryPath, slug);
                _ctx.portAllocated = result.isNew;
                const ports = result.ports;
                const detail = result.isNew
                  ? `offset=${ports.offset}, postgres=${ports.postgres}`
                  : `already allocated at offset=${ports.offset}`;
                task.title = `Port registry: ${slug} — ${detail}`;
              },
            },
          ],
          { concurrent: false, renderer: "default" }
        );

        try {
          await tasks.run(ctx);
        } catch (err) {
          clack.cancel(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
          process.exitCode = 1;
          return;
        }

        // ─── Step 2: Pause — ask user to create Multica workspace ────────────
        console.log();
        clack.note(
          `multica CLI v0.2.26 does NOT support 'workspace create'.\n\nPlease create the workspace in the Multica UI now:\n  1. Open your Multica server (e.g. https://desktop-76n2ggj.tailda7706.ts.net)\n  2. Click "+ New Workspace"\n  3. Name/slug: ${slug}\n  4. Save`,
          "Action required"
        );

        const proceed = await clack.confirm({
          message: `Have you created the '${slug}' workspace in Multica UI?`,
        });

        if (clack.isCancel(proceed) || !proceed) {
          clack.cancel("Cancelled. Re-run after creating the workspace.");
          process.exitCode = 1;
          return;
        }

        // ─── Step 3: WSL SSH setup ────────────────────────────────────────────
        if (!opts.skipSsh) {
          const sshTasks = new Listr<NewProductContext>(
            [
              {
                title: `Cloning admin → ~/products/${slug} (via SSH to ${ORG})`,
                task: async () => {
                  const script = buildRemoteScript([
                    "cd ~/products",
                    `gh repo clone ${ORG}/admin ${slug}`,
                    `cd ${slug}`,
                    `git remote set-url origin git@github.com:${ORG}/${slug}.git`,
                    "git push -u origin main",
                  ]);
                  await sshRun(script, {
                    env: { GH_TOKEN: ghToken },
                  });
                },
              },
              {
                title: `Installing dependencies (pnpm install) in ~/products/${slug}`,
                task: async () => {
                  await sshStream(buildRemoteScript([`cd ~/products/${slug}`, "pnpm install"]));
                },
              },
              {
                title: `Booting Docker stack for ${slug} (product-stack.sh up)`,
                task: async () => {
                  await sshStream(
                    buildRemoteScript([
                      `~/auto-board-skills/scripts/product-stack.sh up ${slug} ~/products/${slug}`,
                    ])
                  );
                  ctx.stackUp = true;
                },
              },
              {
                title: `Running pnpm migrate + typecheck in ~/products/${slug}`,
                task: async () => {
                  await sshStream(
                    buildRemoteScript([
                      `cd ~/products/${slug}`,
                      "pnpm --filter @duolabs/database migrate",
                      "pnpm typecheck",
                    ])
                  );
                },
              },
            ],
            { concurrent: false, renderer: "default" }
          );

          try {
            await sshTasks.run(ctx);
          } catch (err) {
            log.warn(`SSH steps failed: ${err instanceof Error ? err.message : String(err)}`);
            log.warn("Continuing with provision step. You may need to run SSH steps manually.");
          }
        } else {
          log.warn("--skip-ssh: skipping WSL SSH setup steps");
        }

        // ─── Step 4: Provision workspace ─────────────────────────────────────
        if (!opts.skipProvision) {
          const { registryPath, provisionScript } = resolvePaths();
          let dbUrl: string | undefined = opts.databaseUrl;
          if (!dbUrl) {
            try {
              const registry = readRegistry(registryPath);
              dbUrl = databaseUrlFor(registry, slug);
            } catch {
              dbUrl = undefined;
            }
          }

          clack.note(
            `Running: provision-product-workspace.sh ${slug} ${ctx.repoUrl}\nThis creates 9 agents, 15 skills, and the MVP project.`,
            "Provision"
          );

          const provisionEnv: Record<string, string> = { GH_TOKEN: ghToken };
          if (dbUrl) {
            provisionEnv.DATABASE_URL = dbUrl;
          }

          try {
            await runStream("bash", [provisionScript, slug, ctx.repoUrl], { env: provisionEnv });
          } catch (err) {
            log.error(`Provision failed: ${err instanceof Error ? err.message : String(err)}`);
            log.info("You can re-run provision manually:");
            log.info(`  GH_TOKEN=... auto-board provision ${slug} ${ctx.repoUrl}`);
            process.exitCode = 1;
            return;
          }
        } else {
          log.warn("--skip-provision: skipping provision-product-workspace.sh");
        }

        // ─── Step 5: Print bootstrap instructions ────────────────────────────
        clack.outro(
          `Product '${slug}' provisioned.\n\n` +
            `Next step — bootstrap:\n  auto-board bootstrap ${slug}\n\n` +
            `Then create your first US:\n  auto-board issue create ${slug} --title "US-1: <feature>" --assignee pm-grooming`
        );
      }
    );
}
