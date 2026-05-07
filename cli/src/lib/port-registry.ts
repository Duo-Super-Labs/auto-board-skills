import * as fs from "node:fs";
import { PortRegistrySchema, portsForOffset } from "../types/registry.js";
import type { PortRegistry, ProductPorts } from "../types/registry.js";

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
