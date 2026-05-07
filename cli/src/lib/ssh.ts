import { run, runStream } from "./exec.js";

export const DEFAULT_SSH_HOST = "desktop-76n2ggj";
export const DEFAULT_SSH_USER = "renatoastra";

export interface SshOptions {
  host?: string;
  user?: string;
  pty?: boolean;
  skipHostCheck?: boolean;
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Build SSH argument array for a given remote command string.
 * The remote command is always the last element in the returned array.
 */
export function buildSshArgs(remoteCommand: string, opts: SshOptions = {}): string[] {
  const host = opts.host ?? DEFAULT_SSH_HOST;
  const user = opts.user ?? DEFAULT_SSH_USER;
  const userAtHost = `${user}@${host}`;

  const sshArgs: string[] = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"];

  if (opts.skipHostCheck) {
    sshArgs.push("-o", "StrictHostKeyChecking=no");
  }

  if (opts.pty) {
    sshArgs.push("-t");
  }

  sshArgs.push(userAtHost);
  sshArgs.push(remoteCommand);

  return sshArgs;
}

/**
 * Run a command on the remote SSH host and return stdout.
 * Prepends any provided env vars as `export KEY=VAL` lines.
 */
export async function sshRun(remoteCommand: string, opts: SshOptions = {}): Promise<string> {
  const fullCommand = prependEnv(remoteCommand, opts.env);
  const sshArgs = buildSshArgs(fullCommand, opts);
  return run("ssh", sshArgs, {
    cwd: opts.cwd,
  });
}

/**
 * Stream a remote SSH command to terminal (inherits stdio).
 */
export async function sshStream(remoteCommand: string, opts: SshOptions = {}): Promise<void> {
  const fullCommand = prependEnv(remoteCommand, opts.env);
  const sshArgs = buildSshArgs(fullCommand, opts);
  return runStream("ssh", sshArgs, {
    cwd: opts.cwd,
  });
}

/**
 * Build a multi-command remote script with bash strict mode.
 * Commands are joined with && so the script stops on first failure.
 */
export function buildRemoteScript(commands: string[]): string {
  if (commands.length === 0) return "";
  const inner = commands.join(" && ");
  return `set -euo pipefail && ${inner}`;
}

function prependEnv(command: string, env: Record<string, string> | undefined): string {
  if (!env || Object.keys(env).length === 0) return command;
  const exports = Object.entries(env)
    .map(([k, v]) => `export ${k}=${shellQuote(v)}`)
    .join(" && ");
  return `${exports} && ${command}`;
}

function shellQuote(value: string): string {
  // Wrap in single quotes, escaping any existing single quotes
  return `'${value.replace(/'/g, "'\\''")}'`;
}
