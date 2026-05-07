import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/exec.js", () => ({
  run: vi.fn(),
  runWithOutput: vi.fn(),
  runStream: vi.fn(),
}));

import { run, runWithOutput } from "../../src/lib/exec.js";
import { authStatus, createRepo, getRepoUrl, repoExists } from "../../src/lib/github.js";

const mockRun = vi.mocked(run);
const mockRunWithOutput = vi.mocked(runWithOutput);

describe("repoExists", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when repo exists (exit 0)", async () => {
    mockRunWithOutput.mockResolvedValueOnce({
      stdout: "Duo-Super-Labs/genebra",
      stderr: "",
      exitCode: 0,
      failed: false,
    });
    const exists = await repoExists("Duo-Super-Labs/genebra");
    expect(exists).toBe(true);
    expect(mockRunWithOutput).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["repo", "view", "Duo-Super-Labs/genebra"]),
      expect.any(Object)
    );
  });

  it("returns false when repo does not exist (exit 1)", async () => {
    mockRunWithOutput.mockResolvedValueOnce({
      stdout: "",
      stderr: "Could not resolve to a Repository",
      exitCode: 1,
      failed: true,
    });
    const exists = await repoExists("Duo-Super-Labs/nonexistent");
    expect(exists).toBe(false);
  });
});

describe("createRepo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates private repo and returns URL", async () => {
    mockRun.mockResolvedValueOnce("https://github.com/Duo-Super-Labs/newprod");
    const url = await createRepo({
      name: "Duo-Super-Labs/newprod",
      private: true,
      description: "New product",
    });
    expect(url).toBe("https://github.com/Duo-Super-Labs/newprod");
    expect(mockRun).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["repo", "create", "Duo-Super-Labs/newprod", "--private"]),
      expect.any(Object)
    );
  });

  it("creates public repo when private=false", async () => {
    mockRun.mockResolvedValueOnce("https://github.com/org/pub");
    await createRepo({ name: "org/pub", private: false });
    expect(mockRun).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["--public"]),
      expect.any(Object)
    );
  });

  it("passes description when provided", async () => {
    mockRun.mockResolvedValueOnce("https://github.com/org/repo");
    await createRepo({ name: "org/repo", private: true, description: "My repo" });
    expect(mockRun).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["--description", "My repo"]),
      expect.any(Object)
    );
  });
});

describe("getRepoUrl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the HTTPS clone URL for a repo", async () => {
    mockRun.mockResolvedValueOnce("https://github.com/Duo-Super-Labs/duozada.git");
    const url = await getRepoUrl("Duo-Super-Labs/duozada");
    expect(url).toBe("https://github.com/Duo-Super-Labs/duozada.git");
  });
});

describe("authStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns authenticated=true when gh auth reports logged in", async () => {
    mockRunWithOutput.mockResolvedValueOnce({
      stdout: "Logged in to github.com as renatoastra (keyring)",
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
      stderr: "You are not logged into any GitHub hosts.",
      exitCode: 1,
      failed: true,
    });
    const status = await authStatus();
    expect(status.authenticated).toBe(false);
  });

  it("extracts username from output", async () => {
    mockRunWithOutput.mockResolvedValueOnce({
      stdout: "Logged in to github.com as renatoastra (keyring)",
      stderr: "",
      exitCode: 0,
      failed: false,
    });
    const status = await authStatus();
    expect(status.user).toBeDefined();
  });
});
