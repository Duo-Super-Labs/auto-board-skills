import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/github.js", () => ({
  repoExists: vi.fn(),
  createRepo: vi.fn(),
}));

vi.mock("../../src/lib/port-registry.js", () => ({
  ensureProductAllocated: vi.fn(),
  readRegistry: vi.fn(),
  databaseUrlFor: vi.fn(),
  resolveRegistryPath: vi.fn(() => "/mock/auto-board-skills/port-registry.json"),
}));

vi.mock("../../src/lib/ssh.js", () => ({
  sshRun: vi.fn(),
  sshStream: vi.fn(),
  buildRemoteScript: vi.fn((cmds: string[]) => cmds.join(" && ")),
  DEFAULT_SSH_HOST: "desktop-76n2ggj",
  DEFAULT_SSH_USER: "renatoastra",
}));

vi.mock("../../src/lib/exec.js", () => ({
  run: vi.fn(),
  runWithOutput: vi.fn(),
  runStream: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(() => false),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  text: vi.fn(),
  password: vi.fn(),
}));

import * as clack from "@clack/prompts";
import { Command } from "commander";
import { registerNewProduct } from "../../src/commands/new-product.js";
import { runStream } from "../../src/lib/exec.js";
import { createRepo, repoExists } from "../../src/lib/github.js";
import {
  databaseUrlFor,
  ensureProductAllocated,
  readRegistry,
} from "../../src/lib/port-registry.js";
import { sshRun, sshStream } from "../../src/lib/ssh.js";

const mockRepoExists = vi.mocked(repoExists);
const mockCreateRepo = vi.mocked(createRepo);
const mockEnsureProductAllocated = vi.mocked(ensureProductAllocated);
const mockReadRegistry = vi.mocked(readRegistry);
const mockDatabaseUrlFor = vi.mocked(databaseUrlFor);
const mockSshRun = vi.mocked(sshRun);
const mockSshStream = vi.mocked(sshStream);
const mockRunStream = vi.mocked(runStream);
const mockConfirm = vi.mocked(clack.confirm);
const mockIsCancel = vi.mocked(clack.isCancel);

function makeProgram() {
  const p = new Command();
  p.exitOverride();
  registerNewProduct(p);
  return p;
}

const SAMPLE_PORTS = {
  offset: 1,
  postgres: 5442,
  postgres_test: 5443,
  minio_api: 9010,
  minio_console: 9011,
  mailpit_smtp: 1035,
  mailpit_ui: 8035,
};

const SAMPLE_REGISTRY = {
  $next_available_offset: 2,
  products: { newprod: SAMPLE_PORTS },
};

describe("new-product command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    // Default: user confirms workspace creation
    mockConfirm.mockResolvedValue(true);
    mockIsCancel.mockReturnValue(false);
    // Default: repo does not exist
    mockRepoExists.mockResolvedValue(false);
    mockCreateRepo.mockResolvedValue("https://github.com/Duo-Super-Labs/newprod");
    // Default: port allocation succeeds
    mockEnsureProductAllocated.mockReturnValue({
      isNew: true,
      ports: SAMPLE_PORTS,
      updated: SAMPLE_REGISTRY,
    });
    // Default: SSH steps succeed
    mockSshRun.mockResolvedValue("");
    mockSshStream.mockResolvedValue(undefined);
    // Default: provision script succeeds
    mockRunStream.mockResolvedValue(undefined);
    // Default: registry readable
    mockReadRegistry.mockReturnValue(SAMPLE_REGISTRY);
    mockDatabaseUrlFor.mockReturnValue("postgresql://postgres:postgres@localhost:5442/postgres");
  });

  it("creates repo when it does not exist", async () => {
    const p = makeProgram();
    await p.parseAsync(
      ["new-product", "newprod", "--gh-token", "ghp_test", "--skip-ssh", "--skip-provision"],
      { from: "user" }
    );
    expect(mockCreateRepo).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Duo-Super-Labs/newprod", private: true })
    );
  });

  it("skips repo creation when it already exists", async () => {
    mockRepoExists.mockResolvedValue(true);
    const p = makeProgram();
    await p.parseAsync(
      ["new-product", "newprod", "--gh-token", "ghp_test", "--skip-ssh", "--skip-provision"],
      { from: "user" }
    );
    expect(mockCreateRepo).not.toHaveBeenCalled();
  });

  it("allocates ports in registry", async () => {
    const p = makeProgram();
    await p.parseAsync(
      ["new-product", "newprod", "--gh-token", "ghp_test", "--skip-ssh", "--skip-provision"],
      { from: "user" }
    );
    expect(mockEnsureProductAllocated).toHaveBeenCalledWith(
      expect.stringContaining("port-registry.json"),
      "newprod"
    );
  });

  it("cancels when user declines to create workspace", async () => {
    mockConfirm.mockResolvedValue(false);
    const p = makeProgram();
    await p.parseAsync(
      ["new-product", "newprod", "--gh-token", "ghp_test", "--skip-ssh", "--skip-provision"],
      { from: "user" }
    );
    expect(process.exitCode).toBe(1);
    expect(clack.cancel).toHaveBeenCalled();
  });

  it("cancels when confirm result is a cancel symbol", async () => {
    const cancelSymbol = Symbol("cancel");
    mockConfirm.mockResolvedValue(cancelSymbol as unknown as boolean);
    mockIsCancel.mockReturnValue(true);
    const p = makeProgram();
    await p.parseAsync(
      ["new-product", "newprod", "--gh-token", "ghp_test", "--skip-ssh", "--skip-provision"],
      { from: "user" }
    );
    expect(process.exitCode).toBe(1);
  });

  it("runs SSH steps when not skipped", async () => {
    const p = makeProgram();
    await p.parseAsync(["new-product", "newprod", "--gh-token", "ghp_test", "--skip-provision"], {
      from: "user",
    });
    // sshRun should have been called (clone + push step)
    expect(mockSshRun).toHaveBeenCalled();
  });

  it("runs provision script when not skipped", async () => {
    const p = makeProgram();
    await p.parseAsync(["new-product", "newprod", "--gh-token", "ghp_test", "--skip-ssh"], {
      from: "user",
    });
    expect(mockRunStream).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining(["newprod"]),
      expect.objectContaining({ env: expect.objectContaining({ GH_TOKEN: "ghp_test" }) })
    );
  });

  it("exits with code 1 when GH_TOKEN is missing", async () => {
    // Clear env. process.env is special: delete is the correct way to unset.
    const originalToken = process.env.GH_TOKEN;
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset
    delete process.env.GH_TOKEN;
    const p = makeProgram();
    await p.parseAsync(["new-product", "newprod"], { from: "user" });
    expect(process.exitCode).toBe(1);
    expect(clack.cancel).toHaveBeenCalled();
    // Restore
    if (originalToken !== undefined) process.env.GH_TOKEN = originalToken;
  });

  it("exits with code 1 when provision script fails", async () => {
    mockRunStream.mockRejectedValue(new Error("provision failed"));
    const p = makeProgram();
    await p.parseAsync(["new-product", "newprod", "--gh-token", "ghp_test", "--skip-ssh"], {
      from: "user",
    });
    expect(process.exitCode).toBe(1);
  });
});
