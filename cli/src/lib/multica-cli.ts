import { z } from "zod";
import {
  AgentSchema,
  IssueSchema,
  ProjectResourceSchema,
  ProjectSchema,
  RuntimeSchema,
  SkillSchema,
} from "../types/multica.js";
import type {
  Agent,
  AuthStatus,
  Issue,
  IssueStatus,
  Project,
  ProjectResource,
  Runtime,
  Skill,
  Workspace,
  WorkspaceRow,
} from "../types/multica.js";
import { run, runWithOutput } from "./exec.js";

// ─── Shared options ───────────────────────────────────────────────────────────

export interface WorkspaceOptions {
  workspaceId?: string;
  serverUrl?: string;
}

function buildEnv(opts: WorkspaceOptions): Record<string, string> {
  const env: Record<string, string> = {};
  if (opts.workspaceId) {
    env.MULTICA_WORKSPACE_ID = opts.workspaceId;
  }
  if (opts.serverUrl) {
    env.MULTICA_SERVER_URL = opts.serverUrl;
  }
  return env;
}

/**
 * Safely parse JSON, returning null on failure.
 */
function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Workspace ────────────────────────────────────────────────────────────────

/**
 * Parse the ASCII table output of `multica workspace list`.
 * Format:
 *   ID                                    NAME
 *   <uuid>                                <name possibly with spaces>
 *
 * The CLI does NOT support --output json for workspace list.
 */
export function parseWorkspaceTable(raw: string): WorkspaceRow[] {
  const lines = raw.split("\n");
  const rows: WorkspaceRow[] = [];
  // UUID-like pattern: 8-4-4-4-12 hex chars
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!uuidPattern.test(trimmed)) continue; // skip header/non-data lines

    // Split on 2+ spaces to separate ID from name
    const match = trimmed.match(/^([0-9a-f-]{36})\s{2,}(.+)$/i);
    if (!match) {
      // Try splitting on single space (fallback)
      const parts = trimmed.split(/\s+/);
      const id = parts[0];
      const name = parts.slice(1).join(" ").trim();
      if (id && name) {
        rows.push({ id, name });
      }
      continue;
    }

    const id = match[1]?.trim() ?? "";
    const name = match[2]?.trim() ?? "";
    if (id && name) {
      rows.push({ id, name });
    }
  }
  return rows;
}

export async function listWorkspaces(opts: WorkspaceOptions = {}): Promise<WorkspaceRow[]> {
  const raw = await run("multica", ["workspace", "list"], { env: buildEnv(opts) });
  return parseWorkspaceTable(raw);
}

/**
 * Find the workspace ID for a given name (case-insensitive).
 * Returns null if not found.
 */
export async function getWorkspaceId(
  name: string,
  opts: WorkspaceOptions = {}
): Promise<string | null> {
  const workspaces = await listWorkspaces(opts);
  const found = workspaces.find((ws) => ws.name.toLowerCase() === name.toLowerCase());
  return found?.id ?? null;
}

// ─── Runtime ─────────────────────────────────────────────────────────────────

export async function listRuntimes(opts: WorkspaceOptions = {}): Promise<Runtime[]> {
  const raw = await run("multica", ["runtime", "list", "--output", "json"], {
    env: buildEnv(opts),
  });
  const parsed = safeParseJson(raw);
  if (!parsed || !Array.isArray(parsed)) return [];
  return z.array(RuntimeSchema.passthrough()).parse(parsed);
}

export async function findClaudeRuntime(opts: WorkspaceOptions = {}): Promise<Runtime | null> {
  const runtimes = await listRuntimes(opts);
  const found = runtimes.find((rt) => {
    const isOnline = rt.status === "online";
    const provider = (rt.provider ?? "").toLowerCase();
    const name = (rt.name ?? "").toLowerCase();
    const isClaudeProvider = provider.includes("claude");
    const isClaudeName = name.includes("claude");
    return isOnline && (isClaudeProvider || isClaudeName);
  });
  return found ?? null;
}

// ─── Project ─────────────────────────────────────────────────────────────────

export async function listProjects(opts: WorkspaceOptions = {}): Promise<Project[]> {
  const raw = await run("multica", ["project", "list", "--output", "json"], {
    env: buildEnv(opts),
  });
  const parsed = safeParseJson(raw);
  if (!parsed || !Array.isArray(parsed)) return [];
  return z.array(ProjectSchema.passthrough()).parse(parsed);
}

export interface CreateProjectParams {
  title: string;
  description?: string;
  status?: string;
  repos?: string[];
}

export async function createProject(
  params: CreateProjectParams,
  opts: WorkspaceOptions = {}
): Promise<Project> {
  const args = ["project", "create", "--title", params.title, "--output", "json"];
  if (params.description) {
    args.push("--description", params.description);
  }
  if (params.status) {
    args.push("--status", params.status);
  }
  for (const repo of params.repos ?? []) {
    args.push("--repo", repo);
  }
  const raw = await run("multica", args, { env: buildEnv(opts) });
  return ProjectSchema.passthrough().parse(JSON.parse(raw));
}

export async function listProjectResources(
  projectId: string,
  opts: WorkspaceOptions = {}
): Promise<ProjectResource[]> {
  const raw = await run("multica", ["project", "resource", "list", projectId, "--output", "json"], {
    env: buildEnv(opts),
  });
  const parsed = safeParseJson(raw);
  if (!parsed || !Array.isArray(parsed)) return [];
  return z.array(ProjectResourceSchema.passthrough()).parse(parsed);
}

export interface AddProjectResourceParams {
  projectId: string;
  type: string;
  url: string;
}

export async function addProjectResource(
  params: AddProjectResourceParams,
  opts: WorkspaceOptions = {}
): Promise<void> {
  await run(
    "multica",
    ["project", "resource", "add", params.projectId, "--type", params.type, "--url", params.url],
    { env: buildEnv(opts) }
  );
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export async function listAgents(opts: WorkspaceOptions = {}): Promise<Agent[]> {
  const raw = await run("multica", ["agent", "list", "--output", "json"], {
    env: buildEnv(opts),
  });
  const parsed = safeParseJson(raw);
  if (!parsed || !Array.isArray(parsed)) return [];
  return z.array(AgentSchema.passthrough()).parse(parsed);
}

export interface CreateAgentParams {
  name: string;
  runtimeId: string;
  model: string;
  instructions: string;
  maxConcurrentTasks?: number;
  visibility?: string;
}

export async function createAgent(
  params: CreateAgentParams,
  opts: WorkspaceOptions = {}
): Promise<Agent> {
  const args = [
    "agent",
    "create",
    "--name",
    params.name,
    "--runtime-id",
    params.runtimeId,
    "--model",
    params.model,
    "--instructions",
    params.instructions,
    "--visibility",
    params.visibility ?? "workspace",
    "--max-concurrent-tasks",
    String(params.maxConcurrentTasks ?? 6),
    "--output",
    "json",
  ];
  const raw = await run("multica", args, { env: buildEnv(opts) });
  return AgentSchema.passthrough().parse(JSON.parse(raw));
}

export interface SetAgentSkillsParams {
  agentId: string;
  skillIds: string[];
}

export async function setAgentSkills(
  params: SetAgentSkillsParams,
  opts: WorkspaceOptions = {}
): Promise<void> {
  await run(
    "multica",
    ["agent", "skills", "set", params.agentId, "--skill-ids", params.skillIds.join(",")],
    { env: buildEnv(opts) }
  );
}

export interface UpdateAgentEnvParams {
  agentId: string;
  env: Record<string, string>;
}

export async function updateAgentEnv(
  params: UpdateAgentEnvParams,
  opts: WorkspaceOptions = {}
): Promise<void> {
  const stdinJson = JSON.stringify(params.env);
  await run("multica", ["agent", "update", params.agentId, "--custom-env-stdin"], {
    env: buildEnv(opts),
    stdin: stdinJson,
  });
}

// ─── Skill ───────────────────────────────────────────────────────────────────

export async function listSkills(opts: WorkspaceOptions = {}): Promise<Skill[]> {
  const raw = await run("multica", ["skill", "list", "--output", "json"], {
    env: buildEnv(opts),
  });
  const parsed = safeParseJson(raw);
  if (!parsed || !Array.isArray(parsed)) return [];
  return z.array(SkillSchema.passthrough()).parse(parsed);
}

export interface CreateSkillParams {
  name: string;
  content: string;
  description?: string;
}

export async function createSkill(
  params: CreateSkillParams,
  opts: WorkspaceOptions = {}
): Promise<Skill> {
  const args = [
    "skill",
    "create",
    "--name",
    params.name,
    "--content",
    params.content,
    "--output",
    "json",
  ];
  if (params.description) {
    args.push("--description", params.description);
  }
  const raw = await run("multica", args, { env: buildEnv(opts) });
  return SkillSchema.passthrough().parse(JSON.parse(raw));
}

export interface UpsertSkillFileParams {
  skillId: string;
  filePath: string;
  content: string;
}

export async function upsertSkillFile(
  params: UpsertSkillFileParams,
  opts: WorkspaceOptions = {}
): Promise<void> {
  await run(
    "multica",
    [
      "skill",
      "files",
      "upsert",
      params.skillId,
      "--path",
      params.filePath,
      "--content",
      params.content,
    ],
    { env: buildEnv(opts) }
  );
}

// ─── Issue ───────────────────────────────────────────────────────────────────

export interface CreateIssueParams {
  title: string;
  description?: string;
  projectId?: string;
  status?: IssueStatus;
  assignee?: string;
  assigneeId?: string;
  parentId?: string;
}

export async function createIssue(
  params: CreateIssueParams,
  opts: WorkspaceOptions = {}
): Promise<Issue> {
  const args = ["issue", "create", "--title", params.title, "--output", "json"];
  if (params.projectId) {
    args.push("--project", params.projectId);
  }
  if (params.status) {
    args.push("--status", params.status);
  }
  if (params.assignee) {
    args.push("--assignee", params.assignee);
  }
  if (params.assigneeId) {
    args.push("--assignee-id", params.assigneeId);
  }
  if (params.parentId) {
    args.push("--parent", params.parentId);
  }
  if (params.description !== undefined) {
    args.push("--description-stdin");
  }
  const raw = await run("multica", args, {
    env: buildEnv(opts),
    ...(params.description !== undefined ? { stdin: params.description } : {}),
  });
  return IssueSchema.passthrough().parse(JSON.parse(raw));
}

export interface ListIssuesParams extends WorkspaceOptions {
  projectId?: string;
  status?: IssueStatus;
  assignee?: string;
  parentId?: string;
}

export async function listIssues(params: ListIssuesParams = {}): Promise<Issue[]> {
  const { projectId, status, assignee, parentId, ...opts } = params;
  const args = ["issue", "list", "--output", "json"];
  if (projectId) args.push("--project", projectId);
  if (status) args.push("--status", status);
  if (assignee) args.push("--assignee", assignee);
  if (parentId) args.push("--parent", parentId);
  const raw = await run("multica", args, { env: buildEnv(opts) });
  const parsed = safeParseJson(raw);
  if (!parsed || !Array.isArray(parsed)) return [];
  return z.array(IssueSchema.passthrough()).parse(parsed);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function authStatus(): Promise<AuthStatus> {
  const result = await runWithOutput("multica", ["auth", "status"], {
    rejectOnError: false,
  });
  if (result.failed || result.exitCode !== 0) {
    return { authenticated: false };
  }
  return { authenticated: true, user: result.stdout };
}

// Re-export Workspace type to avoid importing from two places
export type { Workspace, WorkspaceRow, Runtime, Project, ProjectResource, Agent, Skill, Issue };
