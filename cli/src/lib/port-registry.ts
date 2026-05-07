import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PortRegistrySchema, portsForOffset } from "../types/registry.js";
import type { PortRegistry, ProductPorts } from "../types/registry.js";

/**
 * Resolve the path to port-registry.json, trying these in order:
 *  1. $AUTO_BOARD_SKILLS_DIR/port-registry.json (explicit override)
 *  2. $HOME/auto-board-skills/port-registry.json (canonical install location)
 *  3. $PWD/port-registry.json (running from inside the repo)
 *  4. Walk up from $PWD looking for "port-registry.json" (e.g., subdir of repo)
 *
 * Returns the first existing path. Throws if none found, listing all tried.
 */
export function resolveRegistryPath(): string {
  const tried: string[] = [];

  const envDir = process.env.AUTO_BOARD_SKILLS_DIR;
  if (envDir !== undefined && envDir !== "") {
    const p = path.join(envDir, "port-registry.json");
    tried.push(p);
    if (fs.existsSync(p)) return p;
  }

  const home = path.join(os.homedir(), "auto-board-skills", "port-registry.json");
  tried.push(home);
  if (fs.existsSync(home)) return home;

  const cwd = path.join(process.cwd(), "port-registry.json");
  tried.push(cwd);
  if (fs.existsSync(cwd)) return cwd;

  // Walk up from $PWD
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    const p = path.join(dir, "port-registry.json");
    tried.push(p);
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    `port-registry.json not found. Tried:\n  ${tried.join("\n  ")}\n\nSet AUTO_BOARD_SKILLS_DIR or run from inside the repo.`
  );
}

/**
 * Parse raw JSON string into a validated PortRegistry.
 * Throws a ZodError on invalid input.
 */
export function parseRegistry(raw: string): PortRegistry {
  const parsed: unknown = JSON.parse(raw);
  return PortRegistrySchema.parse(parsed);
}

/**
 * Read and parse the registry file from disk.
 */
export function readRegistry(registryPath: string): PortRegistry {
  const raw = fs.readFileSync(registryPath, "utf-8") as string;
  return parseRegistry(raw);
}

/**
 * Serialize and write the registry back to disk as formatted JSON.
 */
export function writeRegistry(registryPath: string, registry: PortRegistry): void {
  const serialized = JSON.stringify(registry, null, 2);
  fs.writeFileSync(registryPath, serialized, "utf-8");
}

export interface AllocateResult {
  updated: PortRegistry;
  ports: ProductPorts;
  isNew: boolean;
}

/**
 * Idempotently allocate a product in the registry.
 * If the product already exists, returns its existing entry without modification.
 * If new, appends with next available offset and increments the counter.
 * Does NOT mutate the input registry.
 */
export function allocateProduct(registry: PortRegistry, slug: string): AllocateResult {
  const existing = registry.products[slug];
  if (existing !== undefined) {
    return {
      updated: registry,
      ports: existing,
      isNew: false,
    };
  }

  const offset = registry.$next_available_offset;
  const ports: ProductPorts = {
    offset,
    ...portsForOffset(offset),
  };

  const updated: PortRegistry = {
    ...registry,
    $next_available_offset: offset + 1,
    products: {
      ...registry.products,
      [slug]: ports,
    },
  };

  return { updated, ports, isNew: true };
}

/**
 * Get port allocation for an existing product. Returns undefined if not found.
 */
export function getProductPorts(registry: PortRegistry, slug: string): ProductPorts | undefined {
  return registry.products[slug];
}

/**
 * Build the DATABASE_URL for a product.
 * Throws if the product is not in the registry.
 */
export function databaseUrlFor(registry: PortRegistry, slug: string): string {
  const ports = registry.products[slug];
  if (!ports) {
    throw new Error(`Product '${slug}' not in port registry. Add it first.`);
  }
  return `postgresql://postgres:postgres@localhost:${ports.postgres}/postgres`;
}

/**
 * High-level helper: read registry from disk, ensure the product is allocated
 * (idempotent), write back if new, and return the allocation result.
 */
export function ensureProductAllocated(registryPath: string, slug: string): AllocateResult {
  const registry = readRegistry(registryPath);
  const result = allocateProduct(registry, slug);
  if (result.isNew) {
    writeRegistry(registryPath, result.updated);
  }
  return result;
}
