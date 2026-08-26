import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "..");

function sourceFiles(directory: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

describe("tenant isolation static audit", () => {
  it("forbids unscoped React Query keys and cache operations", () => {
    const failures: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = fs.readFileSync(file, "utf8");
      if (/queryKey:\s*\[/.test(source)) failures.push(`${file}: queryKey array`);
      if (/(?:set|get)QueryData(?:<[^>]+>)?\(\s*\[/.test(source)) {
        failures.push(`${file}: direct query-data array`);
      }
      if (/(?:invalidate|cancel|remove)Queries\(\{\s*queryKey:\s*\[/.test(source)) {
        failures.push(`${file}: direct cache-operation array`);
      }
      if (/const\s+[A-Z_]*QUERY_KEY\s*=\s*\[/.test(source)) {
        failures.push(`${file}: module-global unscoped key`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("forbids generic tenant-data persistence keys", () => {
    const failures: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const relative = path.relative(SRC, file);
      const source = fs.readFileSync(file, "utf8");
      if (/localStorage\.(?:getItem|setItem|removeItem)\(\s*["']unboks_/.test(source)) {
        failures.push(`${relative}: raw unboks_ localStorage key`);
      }
      if (/const\s+(?:STORAGE_KEY|COUNTER_KEY|NEXT_NUMBER_KEY)\s*=\s*["']unboks_/.test(source)) {
        failures.push(`${relative}: generic tenant-data constant`);
      }
      if (relative !== "lib/tenant.ts" && /["']wtyj_client["']/.test(source)) {
        failures.push(`${relative}: retired global active-tenant key`);
      }
    }
    expect(failures).toEqual([]);
  });
});
