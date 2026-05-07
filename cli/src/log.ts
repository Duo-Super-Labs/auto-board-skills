import { consola } from "consola";

// Re-export consola with our preferred settings
export { consola as log };

/**
 * Format a check result line for the doctor command.
 */
export function checkLine(label: string, ok: boolean, detail?: string): string {
  const icon = ok ? "✓" : "✗";
  const status = ok ? "\x1b[32m" : "\x1b[31m"; // green / red
  const reset = "\x1b[0m";
  const base = `${status}${icon}${reset} ${label}`;
  return detail ? `${base}: ${detail}` : base;
}

/**
 * Format a warning check line.
 */
export function warnLine(label: string, detail?: string): string {
  const icon = "⚠";
  const yellow = "\x1b[33m";
  const reset = "\x1b[0m";
  const base = `${yellow}${icon}${reset} ${label}`;
  return detail ? `${base}: ${detail}` : base;
}

/**
 * Print a section header.
 */
export function header(title: string): void {
  console.log(`\n${title}`);
  console.log("=".repeat(title.length));
}
