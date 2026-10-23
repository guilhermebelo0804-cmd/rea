import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { partitionPublicSource, sha256 } from "./partition-public.mjs";

const execute = promisify(execFile);
const output = resolve("chunk-evidence");
const checkpointDir = join(output, "checkpoints");
await mkdir(checkpointDir, { recursive: true });
const platforms = JSON.parse(
  await readFile(join(output, "platforms.json"), "utf8"),
);
const results = [];
const manifest = [];
const options = {
  maxHeapMb: 512,
  perSourceTimeoutMs: 30000,
  maxStatementBytes: 30000,
};
const analyzerIdentity = sha256(
  Buffer.concat(
    await Promise.all(
      [
        "package-lock.json",
        "scripts/verify/atlas/partition-public.mjs",
        "scripts/verify/atlas/run-public-chunks.mjs",
      ].map((path) => readFile(path)),
    ),
  ),
);
const reaCommit = process.env.GITHUB_SHA || "local-unpublished";

async function runAnalysis(inputDir, name, completePath) {
  const args = [
    "scripts/rea.mjs",
    "analyze-javascript-application",
    inputDir,
    "--source-path",
    name,
    "--max-heap-mb",
    String(options.maxHeapMb),
    "--analysis-timeout-ms",
    String(options.perSourceTimeoutMs),
    "--detail",
    "summary",
    "--evidence_output",
    completePath,
    "--format",
    "json",
  ];
  const tick = performance.now();
  let stdout,
    stderr,
    exitCode = 0;
  try {
    ({ stdout, stderr } = await execute(process.execPath, args, {
      timeout: 45000,
      maxBuffer: 2 * 1024 * 1024,
    }));
  } catch (error) {
    stdout = error.stdout || "";
    stderr = error.stderr || String(error);
    exitCode = typeof error.code === "number" ? error.code : -1;
  }
  let summary;
  try {
    summary = JSON.parse(stdout);
  } catch {
    summary = {
      outcome: "unparsed-command-output",
      stdout_bytes: Buffer.byteLength(stdout),
    };
  }
  return {
    summary,
    stderr,
    exitCode,
    elapsed_ms: Math.round(performance.now() - tick),
  };
}

async function analyzeChunk({ asset, platform, chunk }) {
  const identity = {
    version: 1,
    rea_commit: reaCommit,
    analyzer_identity: analyzerIdentity,
    source_sha256: asset.sha256,
    chunk_sha256: chunk.sha256,
    original_utf16_start: chunk.utf16_start,
    original_utf16_end: chunk.utf16_end,
    options,
  };
  const key = sha256(JSON.stringify(identity));
  const checkpointPath = join(checkpointDir, key + ".json");
  let cached;
  try {
    const candidate = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (
      candidate.key === key &&
      sha256(JSON.stringify(candidate.summary)) === candidate.summary_sha256
    )
      cached = candidate;
  } catch {
    /* Missing/invalid checkpoint requires actual analysis, never an empty result. */
  }
  if (cached) {
    return { ...cached, delivery: "verified-byte-identical-checkpoint" };
  }
  const dir = join(process.env.RUNNER_TEMP || "/tmp", "rea-chunks", key);
  const inputDir = join(dir, "input");
  await mkdir(inputDir, { recursive: true });
  await writeFile(join(inputDir, chunk.name), chunk.text);
  const completePath = join(
    dir,
    `complete-${String(process.pid)}-${String(Date.now())}.json`,
  );
  const { summary, stderr, exitCode, elapsed_ms } = await runAnalysis(
    inputDir,
    chunk.name,
    completePath,
  );
  const stats = summary.summary?.normalized_result?.summary?.statistics;
  const record = {
    key,
    identity,
    platform: platform.platform,
    source_url: asset.url,
    statement: {
      ordinal: chunk.ordinal,
      type: chunk.type,
      bytes: chunk.bytes,
      utf16_start: chunk.utf16_start,
      utf16_end: chunk.utf16_end,
      byte_start: chunk.byte_start,
      byte_end: chunk.byte_end,
      matched_signals: chunk.matched_signals,
    },
    delivery: "executed",
    run_url:
      process.env.GITHUB_SERVER_URL &&
      process.env.GITHUB_REPOSITORY &&
      process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null,
    elapsed_ms,
    exit_code: exitCode,
    outcome:
      exitCode === 0 &&
      stats?.parsed_javascript_files === 1 &&
      stats?.parse_failures === 0
        ? "selected-statement-parsed"
        : "analysis-incomplete",
    summary,
    summary_sha256: sha256(JSON.stringify(summary)),
    stderr_digest: sha256(stderr),
    stderr_bytes: Buffer.byteLength(stderr),
  };
  await writeFile(checkpointPath + ".tmp", JSON.stringify(record, null, 2));
  await rename(checkpointPath + ".tmp", checkpointPath);
  return record;
}

for (const platform of platforms) {
  for (const asset of platform.assets) {
    try {
      const bytes = await readFile(asset.path);
      if (sha256(bytes) !== asset.sha256)
        throw Error("source capture digest mismatch");
      // Reject invalid UTF8; replacement decoding would break original byte lineage.
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const plan = partitionPublicSource(source, {
        maxBytes: options.maxStatementBytes,
        limit: platform.platform === "spacedata" ? 6 : 1,
      });
      manifest.push({
        platform: platform.platform,
        source_url: asset.url,
        ...plan,
        chunks: plan.chunks.map(({ text: _text, ...metadata }) => metadata),
      });
      await writeFile(
        join(output, "partitions.json"),
        JSON.stringify(manifest, null, 2),
      );
      for (const chunk of plan.chunks) {
        results.push(await analyzeChunk({ asset, platform, chunk }));
        await writeFile(
          join(output, "results.json"),
          JSON.stringify(results, null, 2),
        );
        console.log(
          JSON.stringify({
            platform: platform.platform,
            statement: chunk.ordinal,
            outcome: results.at(-1).outcome,
            delivery: results.at(-1).delivery,
          }),
        );
      }
    } catch (error) {
      results.push({
        platform: platform.platform,
        source_url: asset.url,
        outcome: "source-planning-failed",
        error: String(error),
      });
      await writeFile(
        join(output, "results.json"),
        JSON.stringify(results, null, 2),
      );
    }
  }
}
const counts = {
  selected_statements: results.filter((r) => r.key).length,
  parsed_statements: results.filter(
    (r) => r.outcome === "selected-statement-parsed",
  ).length,
  incomplete: results.filter((r) => r.outcome !== "selected-statement-parsed")
    .length,
  executed: results.filter((r) => r.delivery === "executed").length,
  cached: results.filter(
    (r) => r.delivery === "verified-byte-identical-checkpoint",
  ).length,
};
await writeFile(
  join(output, "verdict.json"),
  JSON.stringify(
    {
      options,
      counts,
      limitation:
        "Exact source statements were parsed in isolation, with original offsets/hashes retained. No whole-module reconstruction, runtime execution, API reachability or proprietary model equivalence is established.",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(counts));
if (counts.parsed_statements === 0) process.exitCode = 1;
