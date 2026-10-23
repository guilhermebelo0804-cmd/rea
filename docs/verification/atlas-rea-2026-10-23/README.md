# Executed Atlas REA verification — 2026-10-23

Implementation tested: `c9e37a2dcbe2abea664cfe3d4f1725094aa66f32` (preflight fix from `1128d97460304802a7809b29e6427a43972696bc`).

[Compatible runner execution](https://github.com/guilhermebelo0804-cmd/rea/actions/runs/39955863844) completed successfully on Ubuntu 24.04 / Node 24.18.0. Node PID and procfs PID both 2441. Original downloaded JavaScript is excluded from the committed evidence and uploaded artifact.

## Implemented correction

The Linux supervisor now checks the parsed native identity from `/proc/self/stat` against `process.pid` before calling `ps`. Mismatched, malformed or unreadable procfs fails closed with an actionable diagnosis. No ancestor-PID translation, fabricated process listing, ownership bypass, signal change, namespace change, memory-limit bypass or target execution was introduced.

This fixes misleading diagnostics and adds an earlier guard. It does **not** repair the managed Work host's mount namespace. Local Work reproduction returned Node PID 6 versus procfs PID 2124. Unprivileged `unshare --user --map-root-user --mount --pid --fork --mount-proc` failed with `uid_map: Operation not permitted`; bubblewrap could not resolve the caller's namespace under the mismounted procfs. Neither route was forced. A Vercel Sandbox create attempt was rejected with scoped authorization 403, and created no sandbox. The authorized GitHub Actions runner supplied the compatible execution environment.

## Tests and actual tools

- Local `npm run test:local -- src/process/ProcessOwnership.prepare.test.ts src/process/LinuxProcessStat.test.ts`: 19/19 passed (6 new preflight cases plus 13 parser cases). The 6 new cases on the original source give 4 failures, 2 passes. They test the actual preflight boundary with filesystem/process seams; they do not establish host compatibility.
- Local typecheck, focused oxlint, formatting, Python compilation and `git diff --check` passed. Build completed. The same 19 tests and build passed in the compatible runner.
- `analyze-javascript-application` on the entire selected public Economapas script: **one JavaScript file parsed, 1,907 source bytes, 176 visited AST nodes, zero parse failures, no resource limits hit**. Retained semantic relationships: data-flow 43, promise-ownership 6, object-flow 5, call-flow 4, closure 4, timer 1. Source selection excludes two inventoried files and jQuery/global dependencies remain unresolved; overall application and semantic coverage are therefore partial. This is a complete parse of the selected shipped file, **not** complete reconstruction or runtime execution of Economapas.
- Small selected-file parent Evidence: `ev_492b5e422fef5319a5f7d12549f49c34ff10a0426c3f3cca152fcff995dfe2d4`; summary projection: `ev_0922bbeaf38bc6667eb8a652b95c4550c7696dc44901ac0fbd862f37e53e6f27`.
- `inspect-web-network-capture` on three actual public GET observations: **3 decoded / 3 retained records**. These are Python urllib observations of HTML and its module plus the public Economapas script, not browser requests or authenticated application transactions. Bodies were intentionally omitted from the HAR; source size and hashes were retained. Parent Evidence: `ev_8cd04438bb75435a5f3f7fed6f65ce16692b60afd0cebacf362e0b2bb9705f46`; summary projection: `ev_b39827b1d1e4faac781f3ba5cef47a0aee846080e61729b95af0dc95cf59c58a`.
- `inspect_analysis_view` actually executed through the two commands' summary delivery. Raw JSON projections are committed beside this document; this is not a claim of a separate manual inspection command.
- Full Space Data module 2,222,054 bytes: worker ownership/startup succeeded, but static analysis exhausted the documented 1,024 MiB heap budget in [first run](https://github.com/guilhermebelo0804-cmd/rea/actions/runs/39955450770), then 3,072 MiB in the second run. Parsed files remain zero in those results. Exit code 0 / green workflow does **not** establish semantic success. No further unchanged retry was performed. Latest partial parent Evidence: `ev_557face0747b2663be925eb5accf665f1342fa5a24073a20b748b9753f59fb82`.

## Public source provenance

`provenance.json` records URL, source size, SHA-256 and HTTP status for each actual request. All three requests returned 200. No business API, private endpoint, authentication wall, token or account session was used. REA parsed JavaScript as inert text; bootstrap and application code were not executed.

## Preservation and limits

Raw summaries, progress events, host alignment proof and provenance are committed in this directory, independent of Library capacity or artifact expiry. Runner full Evidence bundles were generated but are not part of the uploaded summaries artifact; the committed parent IDs identify those original executions and should not be treated as resolvable in a new REA session. The workflow is reproducible at the tested commit. Artifact ID `12502003853`, SHA-256 `e9fd4925056b4312b16fb80f0139842c69b050446fe5a779fee1d27ae631d102`, expires 2026-11-22; the committed summaries persist in Git history.

Remaining unknowns: full Space Data semantic reconstruction, proprietary calculations, business API responses, data coverage, calibrated demand/consumption, and browser runtime behavior. No claim of tested competitor circle/polygon/isochrone/tile APIs follows from this verification. Atlas's own interfaces require their independent tests and data validation.

No end-to-end token, CPU or peak process-family memory benchmark was performed. Heap values above are configured limits and observed failures, not measurements of peak memory or proof of a performance improvement.
