import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/exec.js", () => ({
  run: vi.fn(),
  runWithOutput: vi.fn(),
  runStream: vi.fn(),
}));

import { run, runWithOutput } from "../../src/lib/exec.js";
import {
  authStatus,
  createAgent,
  createIssue,
  createSkill,
  findClaudeRuntime,
  getWorkspaceId,
  listAgents,
  listIssues,
  listProjectResources,
  listProjects,
  listRuntimes,
  listSkills,
  listWorkspaces,
  parseWorkspaceTable,
  setAgentSkills,
  updateAgentEnv,
  upsertSkillFile,
} from "../../src/lib/multica-cli.js";

const mockRun = vi.mocked(run);
const mockRunWithOutput = vi.mocked(runWithOutput);

// ─── Workspace table parsing ──────────────────────────────────────────────────

describe("parseWorkspaceTable", () => {
  it("parses a standard two-column table", () => {
    const table = `ID                                    NAME
523815ef-cd23-40ae-be93-ed6353b5f924  duozada
abcdef12-0000-0000-0000-000000000001  my product`;
    const result = parseWorkspaceTable(table);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "523815ef-cd23-40ae-be93-ed6353b5f924",
      name: "duozada",
    });
    expect(result[1]).toEqual({
      id: "abcdef12-0000-0000-0000-000000000001",
      name: "my product",
    });
  });

  it("handles multi-word workspace names", () => {
    const table = `ID                                    NAME
aaaaaaaa-0000-0000-0000-000000000000  Duo Super Labs Workspace`;
    const result = parseWorkspaceTable(table);
    expect(result[0]?.name).toBe("Duo Super Labs Workspace");
  });

  it("returns empty array for table with only header", () => {
    const table = "ID                                    NAME";
    const result = parseWorkspaceTable(table);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    expect(parseWorkspaceTable("")).toHaveLength(0);
  });

  it("skips lines without UUID-like ID in first column", () => {
    const table = `ID    NAME
not-uuid  something
aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee  real`;
    const result = parseWorkspaceTable(table);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("real");
  });

  it("trims whitespace from names", () => {
    const table = `ID                                    NAME
aaaaaaaa-0000-0000-0000-000000000000     spaced name   `;
    const result = parseWorkspaceTable(table);
    expect(result[0]?.name).toBe("spaced name");
  });
});

// ─── listWorkspaces ───────────────────────────────────────────────────────────

describe("listWorkspaces", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls multica workspace list and parses table", async () => {
    mockRun.mockResolvedValueOnce(
      "ID                                    NAME\n523815ef-cd23-40ae-be93-ed6353b5f924  duozada"
    );
    const result = await listWorkspaces();
    expect(mockRun).toHaveBeenCalledWith("multica", ["workspace", "list"], expect.any(Object));
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("duozada");
  });

  it("returns empty array if no workspaces", async () => {
    mockRun.mockResolvedValueOnce("ID  NAME");
    const result = await listWorkspaces();
    expect(result).toHaveLength(0);
  });
});

// ─── getWorkspaceId ───────────────────────────────────────────────────────────

describe("getWorkspaceId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves workspace ID by name (case-insensitive)", async () => {
    mockRun.mockResolvedValueOnce(
      "ID                                    NAME\n523815ef-cd23-40ae-be93-ed6353b5f924  Duozada"
    );
    const id = await getWorkspaceId("duozada");
    expect(id).toBe("523815ef-cd23-40ae-be93-ed6353b5f924");
  });

  it("returns null when workspace not found", async () => {
    mockRun.mockResolvedValueOnce("ID  NAME");
    const id = await getWorkspaceId("notexist");
    expect(id).toBeNull();
  });
});

// ─── listRuntimes ─────────────────────────────────────────────────────────────

describe("listRuntimes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses JSON output from multica runtime list", async () => {
    const runtimes = [
      {
        id: "bdabc495-bda5-419f-b487-741c17c721c6",
        name: "Claude WSL",
        provider: "claude",
        status: "online",
      },
    ];
    mockRun.mockResolvedValueOnce(JSON.stringify(runtimes));
    const result = await listRuntimes({ workspaceId: "ws-123" });
    expect(result).toHaveLength(1);
    expect(result[0]?.provider).toBe("claude");
  });

  it("handles empty JSON array", async () => {
    mockRun.mockResolvedValueOnce("[]");
    const result = await listRuntimes({ workspaceId: "ws-123" });
    expect(result).toHaveLength(0);
  });

  it("returns empty array on non-JSON output (graceful)", async () => {
    mockRun.mockResolvedValueOnce("No runtimes found.");
    const result = await listRuntimes({ workspaceId: "ws-123" });
    expect(result).toHaveLength(0);
  });
});

// ─── findClaudeRuntime ────────────────────────────────────────────────────────

describe("findClaudeRuntime", () => {
  beforeEach(() => vi.clearAllMocks());

  it("finds online claude runtime by provider", async () => {
    const runtimes = [
      { id: "rt-1", name: "Gemini", provider: "gemini", status: "online" },
      { id: "rt-2", name: "Claude WSL", provider: "claude", status: "online" },
    ];
    mockRun.mockResolvedValueOnce(JSON.stringify(runtimes));
    const rt = await findClaudeRuntime({ workspaceId: "ws-id" });
    expect(rt?.id).toBe("rt-2");
  });

  it("returns null when no claude runtime is online", async () => {
    const runtimes = [{ id: "rt-1", name: "Claude WSL", provider: "claude", status: "offline" }];
    mockRun.mockResolvedValueOnce(JSON.stringify(runtimes));
    const rt = await findClaudeRuntime({ workspaceId: "ws-id" });
    expect(rt).toBeNull();
  });

  it("matches by name containing 'claude' if provider is missing", async () => {
    const runtimes = [{ id: "rt-3", name: "Claude Code (DESKTOP)", status: "online" }];
    mockRun.mockResolvedValueOnce(JSON.stringify(runtimes));
    const rt = await findClaudeRuntime({ workspaceId: "ws-id" });
    expect(rt?.id).toBe("rt-3");
  });
});

// ─── listProjects ─────────────────────────────────────────────────────────────

describe("listProjects", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses projects JSON", async () => {
    const projects = [{ id: "2b2663c1-0000-0000-0000-000000000000", title: "MVP" }];
    mockRun.mockResolvedValueOnce(JSON.stringify(projects));
    const result = await listProjects({ workspaceId: "ws-id" });
    expect(result[0]?.title).toBe("MVP");
  });

  it("returns empty array on non-JSON response", async () => {
    mockRun.mockResolvedValueOnce("Error connecting");
    const result = await listProjects({ workspaceId: "ws-id" });
    expect(result).toHaveLength(0);
  });
});

// ─── listAgents ───────────────────────────────────────────────────────────────

describe("listAgents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns list of agents", async () => {
    const agents = [
      { id: "agent-1", name: "pm-grooming" },
      { id: "agent-2", name: "fe-dev" },
    ];
    mockRun.mockResolvedValueOnce(JSON.stringify(agents));
    const result = await listAgents({ workspaceId: "ws-id" });
    expect(result).toHaveLength(2);
  });
});

// ─── listSkills ───────────────────────────────────────────────────────────────

describe("listSkills", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns list of skills", async () => {
    const skills = [{ id: "skill-1", name: "read-product-context" }];
    mockRun.mockResolvedValueOnce(JSON.stringify(skills));
    const result = await listSkills({ workspaceId: "ws-id" });
    expect(result[0]?.name).toBe("read-product-context");
  });
});

// ─── createSkill ──────────────────────────────────────────────────────────────

describe("createSkill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls multica skill create and returns new ID", async () => {
    const created = { id: "new-skill-id", name: "my-skill" };
    mockRun.mockResolvedValueOnce(JSON.stringify(created));
    const result = await createSkill(
      { name: "my-skill", content: "# Skill\ncontent", description: "desc" },
      { workspaceId: "ws-id" }
    );
    expect(result.id).toBe("new-skill-id");
    expect(mockRun).toHaveBeenCalledWith(
      "multica",
      expect.arrayContaining(["skill", "create", "--name", "my-skill"]),
      expect.any(Object)
    );
  });
});

// ─── upsertSkillFile ──────────────────────────────────────────────────────────

describe("upsertSkillFile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls multica skill files upsert", async () => {
    mockRun.mockResolvedValueOnce("");
    await upsertSkillFile(
      { skillId: "sk-id", filePath: "templates/example.md", content: "# Example" },
      { workspaceId: "ws-id" }
    );
    expect(mockRun).toHaveBeenCalledWith(
      "multica",
      expect.arrayContaining(["skill", "files", "upsert", "sk-id"]),
      expect.any(Object)
    );
  });
});

// ─── createAgent ─────────────────────────────────────────────────────────────

describe("createAgent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls multica agent create with required flags", async () => {
    const created = { id: "agent-new", name: "be-dev" };
    mockRun.mockResolvedValueOnce(JSON.stringify(created));
    const result = await createAgent(
      {
        name: "be-dev",
        runtimeId: "rt-123",
        model: "claude-sonnet-4-6",
        instructions: "Do stuff",
        maxConcurrentTasks: 6,
        visibility: "workspace",
      },
      { workspaceId: "ws-id" }
    );
    expect(result.id).toBe("agent-new");
    expect(mockRun).toHaveBeenCalledWith(
      "multica",
      expect.arrayContaining(["agent", "create", "--name", "be-dev"]),
      expect.any(Object)
    );
  });
});

// ─── setAgentSkills ───────────────────────────────────────────────────────────

describe("setAgentSkills", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls multica agent skills set with comma-separated IDs", async () => {
    mockRun.mockResolvedValueOnce("");
    await setAgentSkills(
      { agentId: "ag-1", skillIds: ["sk-a", "sk-b", "sk-c"] },
      { workspaceId: "ws-id" }
    );
    expect(mockRun).toHaveBeenCalledWith(
      "multica",
      expect.arrayContaining(["agent", "skills", "set", "ag-1", "--skill-ids", "sk-a,sk-b,sk-c"]),
      expect.any(Object)
    );
  });
});

// ─── updateAgentEnv ───────────────────────────────────────────────────────────

describe("updateAgentEnv", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends env as JSON via stdin (--custom-env-stdin)", async () => {
    mockRun.mockResolvedValueOnce("");
    await updateAgentEnv(
      { agentId: "ag-1", env: { GH_TOKEN: "ghp_test", DATABASE_URL: "postgres://..." } },
      { workspaceId: "ws-id" }
    );
    expect(mockRun).toHaveBeenCalledWith(
      "multica",
      expect.arrayContaining(["agent", "update", "ag-1", "--custom-env-stdin"]),
      expect.objectContaining({
        stdin: expect.stringContaining("GH_TOKEN"),
      })
    );
  });
});

// ─── createIssue ─────────────────────────────────────────────────────────────

describe("createIssue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates issue with required title", async () => {
    const issue = { id: "issue-1", title: "US-1: test" };
    mockRun.mockResolvedValueOnce(JSON.stringify(issue));
    const result = await createIssue(
      { title: "US-1: test", projectId: "proj-1", status: "backlog" },
      { workspaceId: "ws-id" }
    );
    expect(result.id).toBe("issue-1");
  });

  it("passes description via stdin when provided", async () => {
    const issue = { id: "issue-2", title: "US-2" };
    mockRun.mockResolvedValueOnce(JSON.stringify(issue));
    await createIssue(
      { title: "US-2", description: "<!-- multica-board-state: phase=backlog -->" },
      { workspaceId: "ws-id" }
    );
    expect(mockRun).toHaveBeenCalledWith(
      "multica",
      expect.arrayContaining(["--description-stdin"]),
      expect.objectContaining({ stdin: expect.stringContaining("multica-board-state") })
    );
  });

  it("passes assignee when provided", async () => {
    mockRun.mockResolvedValueOnce(JSON.stringify({ id: "i1", title: "t" }));
    await createIssue({ title: "T", assignee: "pm-grooming" }, { workspaceId: "ws-id" });
    expect(mockRun).toHaveBeenCalledWith(
      "multica",
      expect.arrayContaining(["--assignee", "pm-grooming"]),
      expect.any(Object)
    );
  });

  it("passes assigneeId when provided", async () => {
    mockRun.mockResolvedValueOnce(JSON.stringify({ id: "i2", title: "T2" }));
    await createIssue({ title: "T2", assigneeId: "agent-uuid-123" }, { workspaceId: "ws-id" });
    expect(mockRun).toHaveBeenCalledWith(
      "multica",
      expect.arrayContaining(["--assignee-id", "agent-uuid-123"]),
      expect.any(Object)
    );
  });

  it("passes parentId when provided", async () => {
    mockRun.mockResolvedValueOnce(JSON.stringify({ id: "i3", title: "T3" }));
    await createIssue({ title: "T3", parentId: "parent-issue-id" }, { workspaceId: "ws-id" });
    expect(mockRun).toHaveBeenCalledWith(
      "multica",
      expect.arrayContaining(["--parent", "parent-issue-id"]),
      expect.any(Object)
    );
  });
});

// ─── listIssues ───────────────────────────────────────────────────────────────

describe("listIssues", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns issues list", async () => {
    const issues = [{ id: "i1", title: "US-1", status: "backlog" }];
    mockRun.mockResolvedValueOnce(JSON.stringify(issues));
    const result = await listIssues({ workspaceId: "ws-id" });
    expect(result).toHaveLength(1);
  });

  it("filters by projectId when provided", async () => {
    mockRun.mockResolvedValueOnce("[]");
    await listIssues({ workspaceId: "ws-id", projectId: "proj-1" });
    expect(mockRun).toHaveBeenCalledWith(
      "multica",
      expect.arrayContaining(["--project", "proj-1"]),
      expect.any(Object)
    );
  });
});

// ─── listProjectResources ─────────────────────────────────────────────────────

describe("listProjectResources", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns project resources", async () => {
    const resources = [
      { resource_type: "github_repo", resource_ref: { url: "https://github.com/org/repo" } },
    ];
    mockRun.mockResolvedValueOnce(JSON.stringify(resources));
    const result = await listProjectResources("proj-1", { workspaceId: "ws-id" });
    expect(result[0]?.resource_type).toBe("github_repo");
  });
});

// ─── authStatus ───────────────────────────────────────────────────────────────

describe("authStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns authenticated=true when auth status output is OK", async () => {
    mockRunWithOutput.mockResolvedValueOnce({
      stdout: "Authenticated as renatoastra",
      stderr: "",
      exitCode: 0,
      failed: false,
    });
    const status = await authStatus();
    expect(status.authenticated).toBe(true);
  });

  it("returns authenticated=false on non-zero exit", async () => {
    mockRunWithOutput.mockResolvedValueOnce({
      stdout: "",
      stderr: "not authenticated",
      exitCode: 1,
      failed: true,
    });
    const status = await authStatus();
    expect(status.authenticated).toBe(false);
  });
});
