import * as clack from "@clack/prompts";
import type { Command } from "commander";
import { getWorkspaceId, listAgents, updateAgentEnv } from "../lib/multica-cli.js";
import { log } from "../log.js";

export function registerAgentSetEnv(program: Command): void {
  const agentCmd = program.commands.find((c) => c.name() === "agent");
  const target = agentCmd ?? program.command("agent").description("Work with agents");

  target
    .command("set-env <slug> <agent-name>")
    .description(
      "Interactively set KEY=VALUE environment variables on an agent via --custom-env-stdin.\n" +
        "  Secrets are sent via stdin, never stored in shell history.\n" +
        "  slug: Multica workspace slug (e.g. duozada)\n" +
        "  agent-name: agent name (e.g. fe-dev)"
    )
    .action(async (slug: string, agentName: string) => {
      clack.intro(`auto-board agent set-env — ${slug}/${agentName}`);

      // 1. Resolve workspace
      log.info(`Resolving workspace '${slug}'...`);
      const workspaceId = await getWorkspaceId(slug);
      if (!workspaceId) {
        clack.cancel(`Workspace '${slug}' not found.`);
        process.exitCode = 1;
        return;
      }

      const opts = { workspaceId };

      // 2. Find agent by name
      const agents = await listAgents(opts);
      const agent = agents.find((a) => a.name.toLowerCase() === agentName.toLowerCase());
      if (!agent) {
        const agentNames = agents.map((a) => a.name).join(", ");
        clack.cancel(`Agent '${agentName}' not found. Available: ${agentNames || "(none)"}`);
        process.exitCode = 1;
        return;
      }

      clack.note(`Found agent: ${agent.name} (${agent.id.slice(0, 8)})`, "agent");

      // 3. Collect KEY=VALUE pairs
      const envMap: Record<string, string> = {};

      clack.note("Enter KEY=VALUE pairs one at a time.\nLeave KEY blank to finish.", "env vars");

      while (true) {
        const keyResult = await clack.text({
          message: "KEY (blank to finish):",
          placeholder: "GH_TOKEN",
        });

        if (clack.isCancel(keyResult) || !keyResult || String(keyResult).trim() === "") {
          break;
        }

        const key = String(keyResult).trim();

        const valueResult = await clack.password({
          message: `VALUE for ${key}:`,
        });

        if (clack.isCancel(valueResult)) {
          clack.cancel("Cancelled.");
          process.exitCode = 1;
          return;
        }

        envMap[key] = String(valueResult);
      }

      if (Object.keys(envMap).length === 0) {
        clack.note("No variables provided — nothing to set.", "skip");
        clack.outro("Done.");
        return;
      }

      // 4. Apply via --custom-env-stdin
      const s = clack.spinner();
      s.start(`Setting ${Object.keys(envMap).length} env var(s) on ${agent.name}...`);
      try {
        await updateAgentEnv({ agentId: agent.id, env: envMap }, opts);
        s.stop(`Env vars set on ${agent.name}`);
      } catch (err) {
        s.stop("Failed");
        clack.cancel(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
        return;
      }

      clack.outro(`Done. ${Object.keys(envMap).length} variable(s) updated on ${agent.name}.`);
    });
}
