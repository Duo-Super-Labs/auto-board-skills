import { beforeEach, describe, expect, it, vi } from "vitest";

// We mock execa before importing our module
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import { execa } from "execa";
import { run, runStream, runWithOutput } from "../../src/lib/exec.js";

const mockExeca = vi.mocked(execa);

function makeResult(stdout: string, stderr = "", exitCode = 0, failed = false) {
  return {
    stdout,
    stderr,
    exitCode,
    failed: failed || exitCode !== 0,
    command: "mock",
    escapedCommand: "mock",
    isCanceled: false,
    killed: false,
    timedOut: false,
    cwd: "/",
    durationMs: 10,
  };
}

describe("exec.run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs a command and returns stdout", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("hello world") as never);
    const result = await run("echo", ["hello", "world"]);
    expect(result).toBe("hello world");
    expect(mockExeca).toHaveBeenCalledWith("echo", ["hello", "world"], expect.any(Object));
  });

  it("returns trimmed stdout", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("  trimmed  \n") as never);
    const result = await run("cmd", []);
    expect(result).toBe("trimmed");
  });

  it("throws when execa rejects (e.g. command not found)", async () => {
    mockExeca.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(run("nonexistent", [])).rejects.toThrow("ENOENT");
  });

  it("passes env variables when provided", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("ok") as never);
    await run("cmd", [], { env: { MY_VAR: "val" } });
    expect(mockExeca).toHaveBeenCalledWith(
      "cmd",
      [],
      expect.objectContaining({ env: expect.objectContaining({ MY_VAR: "val" }) })
    );
  });

  it("passes cwd when provided", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("ok") as never);
    await run("cmd", [], { cwd: "/tmp" });
    expect(mockExeca).toHaveBeenCalledWith("cmd", [], expect.objectContaining({ cwd: "/tmp" }));
  });

  it("passes stdin when provided", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("ok") as never);
    await run("cmd", [], { stdin: '{"key":"value"}' });
    expect(mockExeca).toHaveBeenCalledWith(
      "cmd",
      [],
      expect.objectContaining({ input: '{"key":"value"}' })
    );
  });
});

describe("exec.runWithOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns object with stdout and stderr", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("out", "err") as never);
    const result = await runWithOutput("cmd", []);
    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
  });

  it("returns exitCode 0 on success", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("", "", 0) as never);
    const result = await runWithOutput("cmd", []);
    expect(result.exitCode).toBe(0);
    expect(result.failed).toBe(false);
  });

  it("returns failed result when rejectOnError=false and command fails", async () => {
    // With rejectOnError=false, the function returns a RunResult with failed=true
    mockExeca.mockResolvedValueOnce(makeResult("", "stderr text", 2, true) as never);
    const result = await runWithOutput("cmd", [], { rejectOnError: false });
    expect(result.failed).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("stderr text");
  });

  it("throws when rejectOnError=true (default) and command fails", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("", "error output", 1, true) as never);
    await expect(runWithOutput("cmd", [])).rejects.toThrow();
  });

  it("throws when rejectOnError=true explicitly and command fails", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("", "error output", 1, true) as never);
    await expect(runWithOutput("cmd", [], { rejectOnError: true })).rejects.toThrow();
  });

  it("uses stdout in error message when stderr is empty", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("error from stdout", "", 1, true) as never);
    await expect(runWithOutput("cmd", [])).rejects.toThrow("error from stdout");
  });

  it("passes reject:false to execa regardless of rejectOnError option", async () => {
    mockExeca.mockResolvedValueOnce(makeResult("ok") as never);
    await runWithOutput("cmd", [], { rejectOnError: true });
    expect(mockExeca).toHaveBeenCalledWith("cmd", [], expect.objectContaining({ reject: false }));
  });
});

describe("exec.runStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls execa with stdio inherit setting", async () => {
    const mockProcess = {
      stdin: null,
      stdout: null,
      stderr: null,
      exitCode: Promise.resolve(0),
    };
    mockExeca.mockReturnValueOnce(mockProcess as never);
    await runStream("cmd", ["arg1"]);
    expect(mockExeca).toHaveBeenCalledWith(
      "cmd",
      ["arg1"],
      expect.objectContaining({ stdio: "inherit" })
    );
  });
});
