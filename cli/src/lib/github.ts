import { run, runWithOutput } from "./exec.js";

export interface GhAuthStatus {
  authenticated: boolean;
  user?: string;
}

export interface CreateRepoParams {
  name: string;
  private: boolean;
  description?: string;
}

/**
 * Check if a GitHub repo exists (by name, e.g. "Org/repo").
 */
export async function repoExists(nameWithOwner: string): Promise<boolean> {
  const result = await runWithOutput("gh", ["repo", "view", nameWithOwner, "--json", "name"], {
    rejectOnError: false,
  });
  return !result.failed && result.exitCode === 0;
}

/**
 * Create a GitHub repo and return its URL.
 * Returns the URL printed by `gh repo create`.
 */
export async function createRepo(params: CreateRepoParams): Promise<string> {
  const args = ["repo", "create", params.name];
  if (params.private) {
    args.push("--private");
  } else {
    args.push("--public");
  }
  if (params.description) {
    args.push("--description", params.description);
  }
  // gh repo create prints the repo URL to stdout
  return run("gh", args, {});
}

/**
 * Get the HTTPS clone URL for an existing repo.
 */
export async function getRepoUrl(nameWithOwner: string): Promise<string> {
  return run("gh", ["repo", "view", nameWithOwner, "--json", "url", "--jq", ".url"], {});
}

/**
 * Check gh auth status.
 */
export async function authStatus(): Promise<GhAuthStatus> {
  const result = await runWithOutput("gh", ["auth", "status"], {
    rejectOnError: false,
  });
  if (result.failed || result.exitCode !== 0) {
    return { authenticated: false };
  }
  return { authenticated: true, user: result.stdout };
}
