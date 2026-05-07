import * as readline from "node:readline/promises";
import type { Command } from "commander";
import { createIssue, getWorkspaceId, listProjects } from "../lib/multica-cli.js";
import { log } from "../log.js";
import type { IssueStatus } from "../types/multica.js";

export function registerIssueCreate(program: Command): void {
  const issueCmd = program.commands.find((c) => c.name() === "issue");
  const target = issueCmd ?? program.command("issue").description("Work with issues");

  target
    .command("create <slug>")
    .description(
      "Create a Multica issue in a workspace's first MVP project.\n" +
        "  slug: Multica workspace slug (e.g. duozada)\n" +
        "  Auto-resolves workspace ID and first MVP project ID."
    )
    .option("--title <title>", "Issue title")
    .option("--description-stdin", "Read description from stdin")
    .option("--assignee <name>", "Assignee agent name (fuzzy)")
    .option(
      "--status <status>",
      "Issue status (backlog|todo|in_progress|in_review|done|blocked|cancelled)"
    )
    .option("--project-id <id>", "Override project ID (auto-detected by default)")
    .action(
      async (
        slug: string,
        opts: {
          title?: string;
          descriptionStdin?: boolean;
          assignee?: string;
          status?: string;
          projectId?: string;
        }
      ) => {
        // Validate title
        if (!opts.title) {
          log.error("--title is required");
          process.exitCode = 1;
          return;
        }

        // Resolve workspace
        const workspaceId = await getWorkspaceId(slug);
        if (!workspaceId) {
          log.error(`Workspace '${slug}' not found.`);
          process.exitCode = 1;
          return;
        }

        const wsOpts = { workspaceId };

        // Resolve project ID
        let projectId = opts.projectId;
        if (!projectId) {
          const projects = await listProjects(wsOpts);
          const mvp = projects.find((p) => p.title === "MVP" || p.title === slug);
          projectId = mvp?.id;
          if (!projectId) {
            log.warn("No MVP project found — creating issue without project association.");
          }
        }

        // Read description from stdin if requested
        let description: string | undefined;
        if (opts.descriptionStdin) {
          const rl = readline.createInterface({ input: process.stdin });
          const lines: string[] = [];
          for await (const line of rl) {
            lines.push(line);
          }
          description = lines.join("\n");
        }

        // Validate status
        const validStatuses: IssueStatus[] = [
          "backlog",
          "todo",
          "in_progress",
          "in_review",
          "done",
          "blocked",
          "cancelled",
        ];
        const status =
          opts.status && validStatuses.includes(opts.status as IssueStatus)
            ? (opts.status as IssueStatus)
            : undefined;

        if (opts.status && !status) {
          log.warn(
            `Invalid status '${opts.status}'. Valid: ${validStatuses.join(", ")}. Ignoring.`
          );
        }

        log.info(`Creating issue: ${opts.title}`);

        try {
          const issue = await createIssue(
            {
              title: opts.title,
              description,
              projectId,
              status,
              assignee: opts.assignee,
            },
            wsOpts
          );

          console.log(`\nCreated issue: ${issue.id}`);
          if (issue.number != null) {
            console.log(`  #${issue.number}: ${issue.title}`);
          }
          if (issue.status) {
            console.log(`  status: ${issue.status}`);
          }
        } catch (err) {
          log.error(`Failed to create issue: ${err instanceof Error ? err.message : String(err)}`);
          process.exitCode = 1;
        }
      }
    );
}
