import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs");

import {
  allocateProduct,
  databaseUrlFor,
  ensureProductAllocated,
  getProductPorts,
  parseRegistry,
  readRegistry,
  writeRegistry,
} from "../../src/lib/port-registry.js";
import type { PortRegistry } from "../../src/types/registry.js";

const mockFs = vi.mocked(fs);

const SAMPLE_REGISTRY: PortRegistry = {
  $schema: "test",
  $convention: "test convention",
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
};

describe("parseRegistry", () => {
  it("parses valid registry JSON", () => {
    const result = parseRegistry(JSON.stringify(SAMPLE_REGISTRY));
    expect(result.products.duozada?.offset).toBe(0);
    expect(result.$next_available_offset).toBe(1);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseRegistry("not json")).toThrow();
  });

  it("throws when required fields are missing", () => {
    expect(() => parseRegistry(JSON.stringify({ products: {} }))).toThrow();
  });

  it("throws when products is not an object", () => {
    expect(() =>
      parseRegistry(JSON.stringify({ $next_available_offset: 0, products: "bad" }))
    ).toThrow();
  });

  it("throws when a product entry has wrong port type", () => {
    const bad = {
      $next_available_offset: 0,
      products: {
        foo: {
          offset: 0,
          postgres: "not-a-number",
          postgres_test: 5433,
          minio_api: 9000,
          minio_console: 9001,
          mailpit_smtp: 1025,
          mailpit_ui: 8025,
        },
      },
    };
    expect(() => parseRegistry(JSON.stringify(bad))).toThrow();
  });

  it("accepts registry with optional $schema and $convention", () => {
    const minimal = {
      $next_available_offset: 0,
      products: {},
    };
    const result = parseRegistry(JSON.stringify(minimal));
    expect(result.products).toEqual({});
  });
});

describe("allocateProduct", () => {
  it("allocates with correct port offset pattern", () => {
    const result = allocateProduct(SAMPLE_REGISTRY, "genebra");
    expect(result.updated.products.genebra).toBeDefined();
    expect(result.updated.products.genebra?.offset).toBe(1);
    expect(result.updated.products.genebra?.postgres).toBe(5442); // 5432 + 1*10
    expect(result.updated.products.genebra?.postgres_test).toBe(5443);
    expect(result.updated.products.genebra?.minio_api).toBe(9010);
    expect(result.updated.products.genebra?.minio_console).toBe(9011);
    expect(result.updated.products.genebra?.mailpit_smtp).toBe(1035);
    expect(result.updated.products.genebra?.mailpit_ui).toBe(8035);
    expect(result.updated.$next_available_offset).toBe(2);
  });

  it("is idempotent — returns existing entry without bumping offset", () => {
    const result = allocateProduct(SAMPLE_REGISTRY, "duozada");
    expect(result.updated.$next_available_offset).toBe(1); // unchanged
    expect(result.updated.products.duozada?.offset).toBe(0); // original
    expect(result.isNew).toBe(false);
  });

  it("flags new products with isNew=true", () => {
    const result = allocateProduct(SAMPLE_REGISTRY, "newproduct");
    expect(result.isNew).toBe(true);
  });

  it("flags existing products with isNew=false", () => {
    const result = allocateProduct(SAMPLE_REGISTRY, "duozada");
    expect(result.isNew).toBe(false);
  });

  it("does not mutate input registry", () => {
    const original = JSON.stringify(SAMPLE_REGISTRY);
    allocateProduct(SAMPLE_REGISTRY, "newprod");
    expect(JSON.stringify(SAMPLE_REGISTRY)).toBe(original);
  });

  it("handles empty products registry", () => {
    const empty: PortRegistry = { $next_available_offset: 0, products: {} };
    const result = allocateProduct(empty, "first");
    expect(result.updated.products.first?.offset).toBe(0);
    expect(result.updated.products.first?.postgres).toBe(5432);
  });

  it("allocates sequential offsets for multiple products", () => {
    const reg: PortRegistry = { $next_available_offset: 0, products: {} };
    const r1 = allocateProduct(reg, "product1");
    const r2 = allocateProduct(r1.updated, "product2");
    expect(r1.updated.products.product1?.offset).toBe(0);
    expect(r2.updated.products.product2?.offset).toBe(1);
    expect(r2.updated.$next_available_offset).toBe(2);
  });
});

describe("getProductPorts", () => {
  it("returns ports for an existing product", () => {
    const ports = getProductPorts(SAMPLE_REGISTRY, "duozada");
    expect(ports).toBeDefined();
    expect(ports?.postgres).toBe(5432);
  });

  it("returns undefined for unknown product", () => {
    const ports = getProductPorts(SAMPLE_REGISTRY, "unknown");
    expect(ports).toBeUndefined();
  });
});

describe("databaseUrlFor", () => {
  it("builds correct postgres URL", () => {
    const url = databaseUrlFor(SAMPLE_REGISTRY, "duozada");
    expect(url).toBe("postgresql://postgres:postgres@localhost:5432/postgres");
  });

  it("throws for unknown product", () => {
    expect(() => databaseUrlFor(SAMPLE_REGISTRY, "unknown")).toThrow(/not in port registry/i);
  });
});

describe("readRegistry / writeRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("readRegistry reads and parses the file", () => {
    mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(SAMPLE_REGISTRY) as unknown as Buffer);
    const result = readRegistry("/fake/path.json");
    expect(mockFs.readFileSync).toHaveBeenCalledWith("/fake/path.json", "utf-8");
    expect(result.products.duozada).toBeDefined();
  });

  it("readRegistry throws when file not found", () => {
    mockFs.readFileSync.mockImplementationOnce(() => {
      throw new Error("ENOENT");
    });
    expect(() => readRegistry("/nonexistent.json")).toThrow();
  });

  it("writeRegistry serializes and writes atomically", () => {
    mockFs.writeFileSync.mockImplementationOnce(() => undefined);
    writeRegistry("/fake/path.json", SAMPLE_REGISTRY);
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      "/fake/path.json",
      expect.stringContaining("duozada"),
      "utf-8"
    );
    // Verify output is valid JSON
    const written = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(() => JSON.parse(written)).not.toThrow();
  });
});

describe("ensureProductAllocated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads, allocates new product, and writes back", () => {
    mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(SAMPLE_REGISTRY) as unknown as Buffer);
    mockFs.writeFileSync.mockImplementationOnce(() => undefined);

    const result = ensureProductAllocated("/fake/path.json", "brandnew");
    expect(result.isNew).toBe(true);
    expect(result.ports.postgres).toBe(5442); // offset 1
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });

  it("does not write when product already exists", () => {
    mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(SAMPLE_REGISTRY) as unknown as Buffer);
    mockFs.writeFileSync.mockImplementationOnce(() => undefined);

    const result = ensureProductAllocated("/fake/path.json", "duozada");
    expect(result.isNew).toBe(false);
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it("returns correct ports for existing product", () => {
    mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(SAMPLE_REGISTRY) as unknown as Buffer);
    const result = ensureProductAllocated("/fake/path.json", "duozada");
    expect(result.ports.postgres).toBe(5432);
  });
});
