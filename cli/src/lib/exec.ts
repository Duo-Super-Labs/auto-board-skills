import { type Options as ExecaOptions, execa } from "execa";

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;
}

export interface RunWithOutputOptions extends RunOptions {
  /** When false, non-zero exits return a result instead of throwing. Default: true */
  rejectOnError?: boolean;
}

/**
 * Run a command and return trimmed stdout. Throws on non-zero exit.
 */
export async function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<string> {
  const execaOpts: ExecaOptions = {
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
    ...(opts.stdin !== undefined ? { input: opts.stdin } : {}),
  };
  const result = await execa(cmd, args, execaOpts);
  return (result.stdout as string).trim();
}

/**
 * Run a command and return full result including stderr and exit code.
 * When rejectOnError is false, non-zero exits return a result with failed=true instead of throwing.
 * When rejectOnError is true (default), any failure throws.
 */
export async function runWithOutput(
  cmd: string,
  args: string[],
  opts: RunWithOutputOptions = {}
): Promise<RunResult> {
  const { rejectOnError = true, ...runOpts } = opts;
  const execaOpts: ExecaOptions = {
    ...(runOpts.cwd ? { cwd: runOpts.cwd } : {}),
    ...(runOpts.env ? { env: { ...process.env, ...runOpts.env } } : {}),
    ...(runOpts.stdin !== undefined ? { input: runOpts.stdin } : {}),
    // Pass reject=false so execa returns a result object instead of throwing
    // on non-zero exit. We then check `failed` to build our RunResult.
    reject: false,
  };

  const result = await execa(cmd, args, execaOpts);

  if (result.failed && rejectOnError) {
    // Re-throw: wrap in a plain Error with the stderr as message
    const msg = (result.stderr as string) || (result.stdout as string) || "Command failed";
    const err = new Error(msg);
    throw err;
  }

  return {
    stdout: (result.stdout as string).trim(),
    stderr: (result.stderr as string).trim(),
    exitCode: result.exitCode ?? 0,
    failed: result.failed ?? false,
  };
}

/**
 * Run a command with inherited stdio (streams output to terminal).
 */
export async function runStream(cmd: string, args: string[], opts: RunOptions = {}): Promise<void> {
  const execaOpts: ExecaOptions = {
    stdio: "inherit",
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
  };
  await execa(cmd, args, execaOpts);
}
