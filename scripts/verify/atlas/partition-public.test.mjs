import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "@babel/parser";
import {
  partitionPublicSource,
  sha256,
  decodePublicBytes,
} from "./partition-public.mjs";

test("preserves exact whole-statement source, UTF16 and byte lineage with Unicode", () => {
  const source =
    '"use strict"; const label="ação"; function area(){return "/analytics/area";}';
  const result = partitionPublicSource(source, { maxBytes: 100, limit: 1 });
  const chunk = result.chunks[0];
  assert.equal(chunk.type, "FunctionDeclaration");
  assert.equal(chunk.text, source.slice(chunk.utf16_start, chunk.utf16_end));
  assert.equal(
    Buffer.from(source).subarray(chunk.byte_start, chunk.byte_end).toString(),
    chunk.text,
  );
  assert.equal(chunk.sha256, sha256(Buffer.from(chunk.text)));
  assert.equal(result.source_sha256, sha256(Buffer.from(source)));
  assert.deepEqual(
    result.directives.map((item) => item.value),
    ["use strict"],
  );
  assert.equal(parse(chunk.text).program.body.length, 1);
});

test("never cuts an oversized declaration or nested function into invented modules", () => {
  const source = `const a="/analytics/area", b="${"x".repeat(200)}"; function small(){return 1;}`;
  const result = partitionPublicSource(source, { maxBytes: 80, limit: 5 });
  assert.equal(
    result.statements[0].status,
    "excluded-oversized-atomic-statement",
  );
  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0].text, "function small(){return 1;}");
  assert.match(result.omitted_context, /not a runnable reconstruction/u);
});

test("ranking and identities are deterministic; never evaluates captured code", () => {
  const source =
    'throw new Error("must not execute"); const x=()=>"/tiles/census/x";';
  const a = partitionPublicSource(source, { limit: 1 });
  const b = partitionPublicSource(source, { limit: 1 });
  assert.deepEqual(a, b);
  assert.equal(a.chunks[0].type, "VariableDeclaration");
  assert.equal(a.statements[0].status, "excluded-selection-budget");
});

test("fails on invalid syntax and invalid resource bounds instead of byte splitting", () => {
  assert.throws(() => partitionPublicSource("const {"));
  assert.throws(() => partitionPublicSource("const x=1", { limit: 0 }));
});

test("excludes empty semicolons and retains a substantive bounded fallback", () => {
  const result = partitionPublicSource(
    "; const x=1; function larger(){return x + 2;}",
    { limit: 1 },
  );
  assert.equal(result.statements[0].status, "excluded-empty-statement");
  assert.equal(result.chunks[0].type, "FunctionDeclaration");
  assert.equal(partitionPublicSource(";;;", { limit: 1 }).chunks.length, 0);
});

test("byte decoding preserves a UTF8 BOM and rejects lossy invalid UTF8", () => {
  const bytes = Buffer.from('\ufeffconst ação="renda";');
  const source = decodePublicBytes(bytes);
  assert.equal(sha256(Buffer.from(source)), sha256(bytes));
  const chunk = partitionPublicSource(source).chunks[0];
  assert.equal(
    bytes.subarray(chunk.byte_start, chunk.byte_end).toString(),
    chunk.text,
  );
  assert.throws(() => decodePublicBytes(Buffer.from([0xc3, 0x28])));
});
