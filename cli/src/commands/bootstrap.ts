import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import type { Command } from "commander";
import { runWithOutput } from "../lib/exec.js";
import { getWorkspaceId, listProjectResources, listProjects } from "../lib/multica-cli.js";
import { header, log } from "../log.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const MULTICA_CONFIG = path.join(process.env.HOME ?? "~", ".multica", "config.json");

function getServerUrl(): string {
  try {
    if (fs.existsSync(MULTICA_CONFIG)) {
      const cfg = JSON.parse(fs.readFileSync(MULTICA_CONFIG, "utf-8") as string) as {
        server_url?: string;
      };
      const raw = cfg.server_url ?? "http://localhost:3000";
      return raw.replace(/\/api$/, "");
    }
  } catch {
    // fall through
  }
  return "http://localhost:3000";
}

async function openBrowser(url: string): Promise<void> {
  // Best-effort: macOS open, Linux xdg-open
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "linux" ? "xdg-open" : null;
  if (!opener) return;
  await runWithOutput(opener, [url], { rejectOnError: false });
}

export function registerBootstrap(program: Command): void {
  program
    .command("bootstrap <slug>")
    .description(
      "Print bootstrap instructions for a product: workspace URL + paste-ready chat message for pm-grooming.\n" +
        "  Queries Multica for workspace + first project + product repo resource.\n" +
        "  Also opens the workspace URL in browser (best-effort)."
    )
    .action(async (slug: string) => {
      log.info(`Resolving workspace for: ${slug}`);

      const workspaceId = await getWorkspaceId(slug);
      if (!workspaceId) {
        log.error(
          `Workspace '${slug}' not found in Multica. Create it in the UI first, then run: auto-board provision ${slug} <repo-url>`
        );
        process.exitCode = 1;
        return;
      }

      const opts = { workspaceId };
      const projects = await listProjects(opts);
      const project = projects.find((p) => p.title === "MVP" || p.title === slug);
      const projectId = project?.id;

      let repoUrl = "";
      if (projectId) {
        const resources = await listProjectResources(projectId, opts);
        const repoResource = resources.find(
          (r) => r.resource_type === "github_repo" && r.resource_ref?.url?.includes(slug)
        );
        repoUrl = repoResource?.resource_ref?.url ?? "";
      }

      const serverUrl = getServerUrl();
      const workspaceUrl = `${serverUrl}/${slug}/issues`;

      const firstMessage = `Run skill bootstrap-product.\n\nProduct: ${slug}\nRepo: ${repoUrl || "<not detected — please confirm>"}\n\nPlease grill me through the 6 Lean Inception artifacts in order:\n\n  1. Vision — vision board template\n  2. Personas — 3 to 5; anchor in real users\n  3. Journeys — one per persona primary goal; pain points per step\n  4. Features — canvas plus thin MVP slice, max 7 features\n  5. Constraints — technical inherited from admin, business, NFR, hard nos\n  6. Glossary — 10 to 30 ubiquitous terms\n\nUse the templates from this skill directory as starting points. Ask one\nquestion at a time and wait for my reply before the next.\n\nWhen all six are drafted, commit them to Product/ on a branch and open a PR\nagainst main.`;

      header("Bootstrap product — copy-paste setup");

      console.log(`
The multica CLI v0.2.26 does NOT have a 'chat' command. Chat is also NOT
a route — it's a floating FAB overlay accessible from any workspace page.

Steps:
  1. Open the workspace URL below
  2. Click the chat icon (FAB) — usually bottom-right
  3. Pick agent 'pm-grooming' from the dropdown
  4. Paste the message below as the first message

──────────────────────────────────────────────────────────
Workspace URL: ${workspaceUrl}
Workspace:     ${slug} (${workspaceId})
${projectId ? `Project:       MVP (${projectId})` : ""}
Agent:         pm-grooming
──────────────────────────────────────────────────────────

First message (copy from the next line up to the next divider):
──────────────────────────────────────────────────────────
${firstMessage}
──────────────────────────────────────────────────────────

After the agent finishes the 6 artifacts and opens the PR:
  - Review the PR
  - Merge into main
  - Bootstrap is done forever for this product

Then create your first US (Backlog):
  - Chat with pm-grooming again: "Run skill grill-us. Seed: <your idea>."
  - Or via CLI:
      auto-board issue create ${slug} --title "US-1: <feature>" --assignee pm-grooming
`);

      await openBrowser(workspaceUrl);
    });
}
