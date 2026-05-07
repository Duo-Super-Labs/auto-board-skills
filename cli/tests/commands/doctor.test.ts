import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/exec.js", () => ({
  run: vi.fn(),
  runWithOutput: vi.fn(),
  runStream: vi.fn(),
}));

vi.mock("../../src/lib/multica-cli.js", () => ({
  authStatus: vi.fn(),
  findClaudeRuntime: vi.fn(),
}));

vi.mock("../../src/lib/github.js", () => ({
  authStatus: vi.fn(),
}));

vi.mock("../../src/lib/port-registry.js", () => ({
  readRegistry: vi.fn(),
  resolveRegistryPath: vi.fn(() => "/mock/auto-board-skills/port-registry.json"),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import * as fs from "node:fs";
import { runWithOutput } from "../../src/lib/exec.js";
import { authStatus as ghAuth } from "../../src/lib/github.js";
import { findClaudeRuntime, authStatus as multicaAuth } from "../../src/lib/multica-cli.js";
import { readRegistry } from "../../src/lib/port-registry.js";

const mockRunWithOutput = vi.mocked(runWithOutput);
const mockMulticaAuth = vi.mocked(multicaAuth);
const mockFindClaudeRuntime = vi.mocked(findClaudeRuntime);
const mockGhAuth = vi.mocked(ghAuth);
const mockReadRegistry = vi.mocked(readRegistry);
const mockExistsSync = vi.mocked(fs.existsSync);

// Helper to run the command's action logic in isolation
// We import doctor's check functions indirectly via the command registration
// but since they're not exported, we test the integration via stdout capture.

describe("doctor command integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.exitCode
    process.exitCode = 0;
  });

  it("should pass when all checks succeed", async () => {
    // tailscale
    mockRunWithOutput.mockResolvedValueOnce({
      stdout: JSON.stringify({ BackendState: "Running" }),
      stderr: "",
      exitCode: 0,
      failed: false,
    });
    // multica auth
    mockMulticaAuth.mockResolvedValueOnce({ authenticated: true, user: "testuser" });
    // for claude runtime check, multica auth is called again
    mockMulticaAuth.mockResolvedValueOnce({ authenticated: true, user: "testuser" });
    // claude runtime
    mockFindClaudeRuntime.mockResolvedValueOnce({
      id: "bdabc495-bda5-419f-b487-741c17c721c6",
      name: "Claude WSL",
      provider: "claude",
      status: "online",
    });
    // gh auth
    mockGhAuth.mockResolvedValueOnce({ authenticated: true, user: "renatoastra" });
    // port registry
    mockExistsSync.mockReturnValueOnce(true);
    mockReadRegistry.mockReturnValueOnce({
      $next_available_offset: 1,
      products: {
        duozada: {
          offset: 0,
          postgres: 5432,
          postgres_test: 5433,
          minio_api: 9000,
          minio_console: 9001,
          mailpit_smtp: 1025,
          mailpit_ui: 8025,
        },
      },
    });

    const { Command } = await import("commander");
    const { registerDoctor } = await import("../../src/commands/doctor.js");

    const program = new Command();
    program.exitOverride();
    registerDoctor(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await program.parseAsync(["doctor"], { from: "user" });
    consoleSpy.mockRestore();

    // exitCode should remain 0 when all checks pass
    expect(process.exitCode).toBe(0);
  });

  it("should set exitCode=1 when a critical check fails", async () => {
    // tailscale fails
    mockRunWithOutput.mockResolvedValueOnce({
      stdout: "",
      stderr: "not found",
      exitCode: 1,
      failed: true,
    });
    // multica auth fails
    mockMulticaAuth.mockResolvedValueOnce({ authenticated: false });
    // claude runtime - auth fails so skipped
    mockMulticaAuth.mockResolvedValueOnce({ authenticated: false });
    mockFindClaudeRuntime.mockResolvedValueOnce(null);
    // gh auth fails
    mockGhAuth.mockResolvedValueOnce({ authenticated: false });
    // port registry
    mockExistsSync.mockReturnValueOnce(true);
    mockReadRegistry.mockReturnValueOnce({
      $next_available_offset: 1,
      products: {},
    });

    const { Command } = await import("commander");
    const { registerDoctor } = await import("../../src/commands/doctor.js");

    const program = new Command();
    program.exitOverride();
    registerDoctor(program);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await program.parseAsync(["doctor"], { from: "user" });
    consoleSpy.mockRestore();

    expect(process.exitCode).toBe(1);
  });
});
