import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/exec.js", () => ({
  run: vi.fn(),
  runWithOutput: vi.fn(),
  runStream: vi.fn(),
}));

import { Command } from "commander";
import { registerStack } from "../../src/commands/stack.js";
import { runStream } from "../../src/lib/exec.js";

const mockRunStream = vi.mocked(runStream);

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  registerStack(program);
  return program;
}

describe("stack command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
  });

  it("delegates 'up' action to product-stack.sh with slug and repo path", async () => {
    mockRunStream.mockResolvedValueOnce(undefined);
    const program = makeProgram();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await program.parseAsync(["stack", "up", "duozada", "/home/user/products/duozada"], {
      from: "user",
    });
    consoleSpy.mockRestore();
    expect(mockRunStream).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining(["up", "duozada", "/home/user/products/duozada"]),
      expect.any(Object)
    );
  });

  it("delegates 'status' action without repo path", async () => {
    mockRunStream.mockResolvedValueOnce(undefined);
    const program = makeProgram();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await program.parseAsync(["stack", "status", "duozada"], { from: "user" });
    consoleSpy.mockRestore();
    expect(mockRunStream).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining(["status", "duozada"]),
      expect.any(Object)
    );
  });

  it("delegates 'database-url' action", async () => {
    mockRunStream.mockResolvedValueOnce(undefined);
    const program = makeProgram();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await program.parseAsync(["stack", "database-url", "myproduct"], { from: "user" });
    consoleSpy.mockRestore();
    expect(mockRunStream).toHaveBeenCalledWith(
      "bash",
      expect.arrayContaining(["database-url", "myproduct"]),
      expect.any(Object)
    );
  });

  it("sets exitCode=1 for invalid action", async () => {
    const program = makeProgram();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await program.parseAsync(["stack", "badaction", "duozada"], { from: "user" });
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    expect(process.exitCode).toBe(1);
    expect(mockRunStream).not.toHaveBeenCalled();
  });

  it("sets exitCode=1 when script fails", async () => {
    mockRunStream.mockRejectedValueOnce(new Error("docker not running"));
    const program = makeProgram();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await program.parseAsync(["stack", "up", "duozada", "/repo"], { from: "user" });
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    expect(process.exitCode).toBe(1);
  });
});
