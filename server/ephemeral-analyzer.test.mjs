import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { parseLog, readRepositoryHistory } from "./ephemeral-analyzer.mjs";
import { loadRepositoryHistory } from "../src/lib/github.ts";

const owned = vi.hoisted(() => new Set());
vi.mock("node:child_process", async (original) => {
  const actual = await original();
  return { ...actual, spawn: (...args) => {
    const child = actual.spawn(...args);
    owned.add(child);
    console.log(`Git test process PID=${child.pid}`);
    child.once("close", () => owned.delete(child));
    return child;
  } };
});

describe("analyzer Git path round trips", () => {
  it("preserves root fields and consumes unusual paths as complete records", () => {
    const paths = ["файл.txt", 'quote"name', "tab\tname", "line\nname", "__COMMIT__file"];
    const output = ["__COMMIT__root", "", "Ada", "2026-01-01T00:00:00Z", "Initial",
      ...paths.flatMap((path) => ["A", path]), ""].join("\0");
    const [commit] = parseLog(output);
    expect(commit).toMatchObject({ parents: [], author: "Ada", title: "Initial", date: "2026-01-01T00:00:00Z" });
    expect(commit.changes.map((change) => change.path)).toEqual(paths);
  });

  it("matches Git trees after deleting and renaming raw paths", async () => {
    const base = resolve(tmpdir());
    const repo = await mkdtemp(join(base, "git-history-path-test-"));
    // These names live only in Git objects/indexes, never in a Windows checkout.
    const git = (args, input = "") => new Promise((yes, no) => {
      const child = spawn("git", ["-c", "core.hooksPath=" + join(repo, "no-hooks"),
        "-c", "commit.gpgsign=false", "-c", "core.protectNTFS=false", "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
        "-C", repo, ...args], { windowsHide: true });
      const out = [], err = [];
      child.stdout.on("data", (chunk) => out.push(chunk));
      child.stderr.on("data", (chunk) => err.push(chunk));
      child.on("error", no);
      child.on("close", (code) => code === 0 ? yes(Buffer.concat(out).toString("utf8"))
        : no(new Error(Buffer.concat(err).toString("utf8"))));
      child.stdin.end(input);
    });
    try {
      await git(["init", "-b", "main"]);
      const blob = (await git(["hash-object", "-w", "--stdin"], "sample content\n")).trim();
      const renameBlob = (await git(["hash-object", "-w", "--stdin"], "rename content\n")).trim();
      const paths = ["README.md", "файл.txt", "old\tname.txt", 'quote"name.txt', "line\nbreak.txt", "back\\slash.txt", "__COMMIT__file"];
      const createCommit = async (paths, parent) => {
        await git(["read-tree", "--empty"]);
        await git(["update-index", "-z", "--index-info"], paths.map((path) =>
          `100644 ${path === "old\tname.txt" || path === "new\nname.txt" ? renameBlob : blob}\t${path}\0`).join(""));
        const tree = (await git(["write-tree"])).trim();
        const sha = (await git(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", parent ? "Rename and delete" : "Initial"])).trim();
        await git(["update-ref", "HEAD", sha]);
        return sha;
      };
      const root = await createCommit(paths);
      const expected = paths.filter((path) => path !== "файл.txt").map((path) => path === "old\tname.txt" ? "new\nname.txt" : path);
      await createCommit(expected, root);
      const commits = await readRepositoryHistory(repo, 20);
      expect(commits[0].changes).toContainEqual({ path: "файл.txt", previousPath: undefined, status: "deleted" });
      expect(commits[0].changes).toContainEqual({ path: "new\nname.txt", previousPath: "old\tname.txt", status: "renamed" });
      const history = await loadRepositoryHistory({ input: "acme/tool", analyzerUrl: "https://analyzer.example",
        fetcher: async () => new Response(JSON.stringify({ type: "result", repository: {
          owner: "acme", name: "tool", url: "https://github.com/acme/tool", branch: "main",
        }, commits })),
      });
      expect(new Set(history.commits[0].snapshot)).toEqual(new Set(paths));
      expect(new Set(history.commits[1].snapshot)).toEqual(new Set(expected));
      expect(owned.size).toBe(0);
    } finally {
      await Promise.all([...owned].map((child) => new Promise((done) => {
        child.once("close", done);
        child.kill();
      })));
      const within = relative(base, resolve(repo));
      if (!within || within.startsWith("..") || isAbsolute(within)) throw new Error("Invalid test cleanup path");
      await rm(repo, { recursive: true, force: true });
    }
  }, 20000);
});
