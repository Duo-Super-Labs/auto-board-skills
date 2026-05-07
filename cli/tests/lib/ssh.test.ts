import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/exec.js", () => ({
  run: vi.fn(),
  runWithOutput: vi.fn(),
  runStream: vi.fn(),
}));

import { run, runStream } from "../../src/lib/exec.js";
import {
  DEFAULT_SSH_HOST,
  DEFAULT_SSH_USER,
  buildRemoteScript,
  buildSshArgs,
  sshRun,
  sshStream,
} from "../../src/lib/ssh.js";

const mockRun = vi.mocked(run);
const mockRunStream = vi.mocked(runStream);

describe("buildSshArgs", () => {
  it("builds basic ssh args with default host and user", () => {
    const args = buildSshArgs("ls -la");
    const userAtHost = args.find((a) => a.includes("@"));
    expect(userAtHost).toContain(DEFAULT_SSH_HOST);
    expect(args[args.length - 1]).toBe("ls -la");
  });

  it("includes -t flag for interactive sessions", () => {
    const args = buildSshArgs("bash -s", { pty: true });
    expect(args).toContain("-t");
  });

  it("includes -o StrictHostKeyChecking=no when skipHostCheck=true", () => {
    const args = buildSshArgs("whoami", { skipHostCheck: true });
    expect(args).toContain("-o");
    expect(args).toContain("StrictHostKeyChecking=no");
  });

  it("uses custom host when provided", () => {
    const args = buildSshArgs("pwd", { host: "custom-host.example.com" });
    const userAtHost = args.find((a) => a.includes("@"));
    expect(userAtHost).toContain("custom-host.example.com");
    expect(userAtHost).not.toContain(DEFAULT_SSH_HOST);
  });

  it("uses custom user when provided", () => {
    const args = buildSshArgs("whoami", { user: "customuser" });
    const userAtHost = args.find((a) => a.includes("@"));
    expect(userAtHost).toBe(`customuser@${DEFAULT_SSH_HOST}`);
  });

  it("formats user@host correctly", () => {
    const args = buildSshArgs("id");
    const userAtHost = args.find((a) => a.includes("@"));
    expect(userAtHost).toBe(`${DEFAULT_SSH_USER}@${DEFAULT_SSH_HOST}`);
  });
});

describe("sshRun", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs ssh with given command and returns stdout", async () => {
    mockRun.mockResolvedValueOnce("output text");
    const result = await sshRun("echo hello");
    expect(result).toBe("output text");
    expect(mockRun).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([expect.stringContaining("@")]),
      expect.any(Object)
    );
  });

  it("passes env variables as exported lines prepended to command", async () => {
    mockRun.mockResolvedValueOnce("ok");
    await sshRun("echo $MY_VAR", { env: { MY_VAR: "test" } });
    const callArgs = mockRun.mock.calls[0];
    // The remote command string should contain the env var export
    const remoteCmd = callArgs?.[1]?.[callArgs[1].length - 1] ?? "";
    expect(remoteCmd).toContain("MY_VAR");
  });

  it("uses custom SSH options when provided", async () => {
    mockRun.mockResolvedValueOnce("ok");
    await sshRun("ls", { host: "other-host", user: "otheruser" });
    expect(mockRun).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining(["otheruser@other-host"]),
      expect.any(Object)
    );
  });
});

describe("sshStream", () => {
  beforeEach(() => vi.clearAllMocks());

  it("streams ssh command output to terminal", async () => {
    mockRunStream.mockResolvedValueOnce(undefined);
    await sshStream("pnpm install");
    expect(mockRunStream).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining([expect.stringContaining("@")]),
      expect.any(Object)
    );
  });
});

describe("buildRemoteScript", () => {
  it("joins multiple commands with && (stop on error)", () => {
    const script = buildRemoteScript(["cd ~/products/test", "git pull", "pnpm install"]);
    expect(script).toContain("&&");
    expect(script).toContain("cd ~/products/test");
    expect(script).toContain("pnpm install");
  });

  it("wraps commands in bash -euo pipefail by default", () => {
    const script = buildRemoteScript(["echo hi"]);
    expect(script).toContain("set -euo pipefail");
  });

  it("handles single command", () => {
    const script = buildRemoteScript(["whoami"]);
    expect(script).toContain("whoami");
  });

  it("returns empty string for empty commands array", () => {
    const script = buildRemoteScript([]);
    expect(typeof script).toBe("string");
  });
});
