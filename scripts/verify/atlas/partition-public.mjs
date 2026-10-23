import { createHash } from "node:crypto";
import { parse } from "@babel/parser";

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const signals = [
  ["geometry-contract", /radius_m|type:\s*[`"'](?:circle|polygon)/u, 20],
  ["area-contract", /\/analytics\/|analyzeArea/u, 10],
  [
    "territorial-tiles",
    /\/tiles\/(?:consumption|census|boundaries)|dataVersion/u,
    9,
  ],
  ["company-filters", /\/br\/companies|municipio_ibge|CNPJ|CNAE/u, 8],
  ["coordinate-quality", /approxLocation|geocodific|localiza.{0,20}valid/u, 7],
  [
    "territorial-indicators",
    /(?:population|populaç|renda|income|consumo|isochrone)/iu,
    4,
  ],
];

export function decodePublicBytes(bytes) {
  const source = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  if (!Buffer.from(source).equals(bytes))
    throw Error("UTF8 decoding changed source bytes");
  return source;
}

/** Select complete Program statements only. Never split declarations/functions. */
export function partitionPublicSource(
  source,
  { maxBytes = 30000, limit = 6 } = {},
) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1
  )
    throw new Error("positive integer partition bounds required");
  const ast = parse(source, { sourceType: "unambiguous" });
  const sourceHash = sha256(Buffer.from(source));
  const rows = ast.program.body.map((node, ordinal) => {
    const text = source.slice(node.start, node.end);
    const matched = signals.filter(([, pattern]) => pattern.test(text));
    return {
      ordinal,
      type: node.type,
      utf16_start: node.start,
      utf16_end: node.end,
      byte_start: Buffer.byteLength(source.slice(0, node.start)),
      byte_end: Buffer.byteLength(source.slice(0, node.end)),
      line_start: node.loc.start.line,
      column_start: node.loc.start.column,
      line_end: node.loc.end.line,
      column_end: node.loc.end.column,
      bytes: Buffer.byteLength(text),
      sha256: sha256(Buffer.from(text)),
      matched_signals: matched.map(([name]) => name),
      priority: matched.reduce((sum, [, , score]) => sum + score, 0),
      status:
        node.type === "EmptyStatement"
          ? "excluded-empty-statement"
          : Buffer.byteLength(text) > maxBytes
            ? "excluded-oversized-atomic-statement"
            : "eligible",
    };
  });
  const eligible = rows.filter((row) => row.status === "eligible");
  const ranked = [...eligible].sort(
    (a, b) =>
      b.priority - a.priority || b.bytes - a.bytes || a.ordinal - b.ordinal,
  );
  // With no literal matches, retain a bounded substantive syntax sample. Empty
  // semicolons are never evidence of useful application reconstruction.
  const selected = ranked.slice(0, limit);
  for (const row of rows) {
    if (selected.includes(row)) row.status = "selected";
    else if (row.status === "eligible")
      row.status = "excluded-selection-budget";
  }
  return {
    version: 1,
    source_sha256: sourceHash,
    source_bytes: Buffer.byteLength(source),
    source_type: ast.program.sourceType,
    directives: ast.program.directives.map((item) => ({
      value: item.value.value,
      start: item.start,
      end: item.end,
    })),
    selection_method:
      "complete top-level AST statements ranked by explicit literal signals; no execution or semantics-equivalence claim",
    omitted_context:
      "Imports, surrounding statements, directives and lexical/global dependencies are not restored. Separate statement analysis is a derived static observation, not a runnable reconstruction.",
    bounds: { max_statement_bytes: maxBytes, max_selected_statements: limit },
    statements: rows,
    chunks: selected.map((row) => ({
      ...row,
      text: source.slice(row.utf16_start, row.utf16_end),
      name: `statement-${String(row.ordinal).padStart(4, "0")}.js`,
    })),
  };
}
