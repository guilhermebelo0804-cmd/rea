import { beforeEach, expect, it, vi } from "vitest";

const hostCalls = vi.hoisted(() => ({
  readFile: vi.fn(),
  execFileOutput: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: hostCalls.readFile,
}));
vi.mock("./ExecFileOutput.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ExecFileOutput.js")>()),
  execFileOutput: hostCalls.execFileOutput,
}));

import { createSystemProcessOwnershipHost } from "./ProcessOwnershipObservation.js";

const statRecord = (pid: number) => {
  const fields = ["S", "1", String(pid), String(pid)];
  while (fields.length < 19) fields.push("0");
  fields.push("12345");
  return `${String(pid)} (REA ) fixture) ${fields.join(" ")}`;
};

beforeEach(() => vi.resetAllMocks());

it("refuses mismatched procfs before ps or any supervised child can start", async () => {
  hostCalls.readFile.mockResolvedValue(statRecord(process.pid + 100));
  await expect(
    createSystemProcessOwnershipHost("linux", {}).prepare?.(),
  ).rejects.toMatchObject({
    _tag: "AnalysisCapabilityUnavailableError",
    reason: expect.stringContaining("PID namespace mismatch"),
  });
  expect(hostCalls.readFile).toHaveBeenCalledWith("/proc/self/stat", {
    encoding: "utf8",
    signal: undefined,
  });
  expect(hostCalls.execFileOutput).not.toHaveBeenCalled();
});

it.each(["malformed", null])(
  "fails closed with unreadable procfs %s",
  async (value) => {
    if (value === null)
      hostCalls.readFile.mockRejectedValue(new Error("EACCES"));
    else hostCalls.readFile.mockResolvedValue(value);
    await expect(
      createSystemProcessOwnershipHost("linux", {}).prepare?.(),
    ).rejects.toMatchObject({ _tag: "AnalysisCapabilityUnavailableError" });
    expect(hostCalls.execFileOutput).not.toHaveBeenCalled();
  },
);

it("still requires ps to include the caller after procfs alignment", async () => {
  hostCalls.readFile.mockResolvedValue(statRecord(process.pid));
  hostCalls.execFileOutput.mockResolvedValue({ stdout: "", stderr: "" });
  await expect(
    createSystemProcessOwnershipHost("linux", {}).prepare?.(),
  ).rejects.toMatchObject({
    reason: expect.stringContaining("ps did not report REA's current process"),
  });
});

it("accepts aligned procfs and caller-inclusive ps without weakening later ownership", async () => {
  hostCalls.readFile.mockResolvedValue(statRecord(process.pid));
  hostCalls.execFileOutput.mockResolvedValue({
    stdout: `${String(process.pid)} 1 ${String(process.pid)} 1000 S node`,
    stderr: "",
  });
  await expect(
    createSystemProcessOwnershipHost("linux", {}).prepare?.(),
  ).resolves.toBeUndefined();
  expect(hostCalls.execFileOutput).toHaveBeenCalledWith(
    "ps",
    ["-axo", "pid=,ppid=,pgid=,uid=,stat=,command="],
    { env: {}, stopSignal: "SIGTERM" },
  );
});

it("preserves cancellation instead of reporting an unavailable provider", async () => {
  const controller = new AbortController();
  controller.abort();
  hostCalls.readFile.mockRejectedValue(controller.signal.reason);
  await expect(
    createSystemProcessOwnershipHost("linux", {}).prepare?.(controller.signal),
  ).rejects.toBe(controller.signal.reason);
});
