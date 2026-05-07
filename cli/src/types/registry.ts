import { z } from "zod";

export const ProductPortsSchema = z.object({
  offset: z.number().int().nonnegative(),
  postgres: z.number().int().positive(),
  postgres_test: z.number().int().positive(),
  minio_api: z.number().int().positive(),
  minio_console: z.number().int().positive(),
  mailpit_smtp: z.number().int().positive(),
  mailpit_ui: z.number().int().positive(),
});

export const PortRegistrySchema = z.object({
  $schema: z.string().optional(),
  $convention: z.string().optional(),
  $next_available_offset: z.number().int().nonnegative(),
  products: z.record(z.string(), ProductPortsSchema),
});

export type ProductPorts = z.infer<typeof ProductPortsSchema>;
export type PortRegistry = z.infer<typeof PortRegistrySchema>;

/**
 * Compute port values for a given offset.
 * Pattern: each port = base + offset * 10
 */
export function portsForOffset(offset: number): Omit<ProductPorts, "offset"> {
  return {
    postgres: 5432 + offset * 10,
    postgres_test: 5433 + offset * 10,
    minio_api: 9000 + offset * 10,
    minio_console: 9001 + offset * 10,
    mailpit_smtp: 1025 + offset * 10,
    mailpit_ui: 8025 + offset * 10,
  };
}
