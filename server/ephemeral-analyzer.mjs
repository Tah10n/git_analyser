import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const port = Number(process.env.PORT ?? 8787);
const maxCommits = 1000;
const marker = "__COMMIT__";

const parseRepositoryUrl = (value) => {
  const match = String(value ?? "")
    .trim()
    .match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);

  if (!match) {
    throw new Error("Use an HTTPS GitHub repository URL.");
  }

  return {
    owner: match[1],
    name: match[2],
    cloneUrl: `https://github.com/${match[1]}/${match[2]}.git`,
  };
};

const normalizeCommitLimit = (value) => {
  const requested = Number(value ?? 500);

  if (!Number.isFinite(requested) || requested < 1) {
    throw new Error("Commit limit must be a positive number.");
  }

  return Math.min(Math.floor(requested), maxCommits);
};

const normalizeRef = (value) => {
  const ref = String(value ?? "").trim();

  if (!ref) {
    return undefined;
  }

  if (ref.length > 240 || /[\s~^:?*[\\]/.test(ref) || ref.includes("..")) {
    throw new Error("Use a valid branch name.");
  }

  return ref;
};

const writeLine = (response, type, payload = {}) => {
  response.write(`${JSON.stringify({ type, ...payload })}\n`);
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }

      reject(
        new Error(
          Buffer.concat(stderr).toString("utf8") || `${command} exited with ${code}`,
        ),
      );
    });
  });

const normalizeStatus = (status) => {
  const lead = status.charAt(0);

  if (lead === "A") return "added";
  if (lead === "D") return "deleted";
  if (lead === "R") return "renamed";
  return "modified";
};

export const parseLog = (output) => {
  const fields = output.split("\0");
  const commits = [];
  let current;

  for (let index = 0; index < fields.length;) {
    // Git inserts line breaks before statuses, but paths are consumed verbatim.
    const field = fields[index++].replace(/^\n+/, "");
    if (!field) continue;
    if (field.startsWith(marker)) {
      current = {
        id: field.slice(marker.length),
        parents: fields[index++]?.match(/\S+/g) ?? [],
        author: fields[index++] ?? "",
        date: fields[index++] ?? "",
        title: fields[index++] ?? "",
        changes: [],
      };
      commits.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (!/^[AMDTRCUXB][0-9]*$/.test(field)) {
      throw new Error("Invalid Git file status record.");
    }
    const previousPath = /^[RC]/.test(field) ? fields[index++] : undefined;
    const nextPath = fields[index++];

    if (nextPath) {
      current.changes.push({
        path: nextPath,
        previousPath,
        status: normalizeStatus(field),
      });
    }
  }

  return commits;
};

export const readRepositoryHistory = async (repoDir, limit) => {
  const log = await run("git", [
    "-C", repoDir, "log", "--topo-order", "--name-status", "-z",
    "--find-renames", "--diff-merges=first-parent",
    `--format=${marker}%H%x00%P%x00%an%x00%aI%x00%s`, "-n", String(limit),
  ]);
  const commits = parseLog(log);
  const commitIds = new Set(commits.map((commit) => commit.id));
  for (const commit of commits) {
    if (commit.parents.length > 1 || !commitIds.has(commit.parents[0])) {
      const tree = await run("git", ["-C", repoDir, "ls-tree", "-r", "--name-only", "-z", commit.id]);
      commit.snapshot = tree.split("\0").filter(Boolean);
    }
  }
  return commits;
};

const readJsonBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Request body must be JSON."));
      }
    });
  });

const analyze = async (payload, response) => {
  const repository = parseRepositoryUrl(payload.url);
  const limit = normalizeCommitLimit(payload.maxCommits);
  const ref = normalizeRef(payload.ref);
  const root = await mkdtemp(join(tmpdir(), "git-history-"));
  const repoDir = join(root, "repo");

  try {
    writeLine(response, "status", { message: "cloning", limit, ref });
    const cloneArgs = [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      "--single-branch",
      "--depth",
      String(limit),
    ];

    if (ref) {
      cloneArgs.push("--branch", ref);
    }

    cloneArgs.push(repository.cloneUrl, repoDir);
    await run("git", [
      ...cloneArgs,
    ]);

    writeLine(response, "status", { message: "reading-history" });
    const commits = await readRepositoryHistory(repoDir, limit);
    const selectedRef = (await run("git", ["-C", repoDir, "branch", "--show-current"])).trim();

    writeLine(response, "result", {
      repository: {
        owner: repository.owner,
        name: repository.name,
        branch: selectedRef,
        url: `https://github.com/${repository.owner}/${repository.name}`,
      },
      ref: {
        requested: ref,
        selected: selectedRef,
      },
      commits,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
    writeLine(response, "status", { message: "cleaned-up" });
  }
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders,
  });
  response.end(JSON.stringify(body));
};

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  const isAnalyzeRequest =
    request.method === "POST" &&
    (request.url === "/analyze" || request.url === "/history/analyze");

  if (!isAnalyzeRequest) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  response.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders,
  });

  try {
    const payload = await readJsonBody(request);
    await analyze(payload, response);
  } catch (error) {
    writeLine(response, "error", {
      message: error instanceof Error ? error.message : "Analyzer failed.",
    });
  } finally {
    response.end();
  }
});

const selfTest = () => {
  const rootCommit = parseLog(
    [`${marker}root`, "", "Ada", "2026-01-01T00:00:00Z", "Initial commit", "\nA", "README.md", ""].join("\0"),
  )[0];
  if (rootCommit.parents.length !== 0 || rootCommit.author !== "Ada" ||
      rootCommit.date !== "2026-01-01T00:00:00Z" || rootCommit.title !== "Initial commit") {
    throw new Error("Root commit fields must preserve the empty parent field.");
  }
  const parsed = parseRepositoryUrl("https://github.com/acme/tool.git");
  const limit = normalizeCommitLimit(10_000);
  const parsedLog = parseLog(
    [`${marker}abc`, "def ghi", "Ada", "2026-01-01T00:00:00Z", "Init", "\nA", "README.md", "R100", "old.ts", "new.ts", ""].join("\0"),
  );

  if (parsed.owner !== "acme" || limit !== maxCommits || normalizeRef("feature/test") !== "feature/test") {
    throw new Error("Analyzer guardrail self-test failed.");
  }

  if (
    parsedLog[0]?.changes.length !== 2 ||
    parsedLog[0]?.parents.length !== 2 ||
    parsedLog[0]?.title !== "Init"
  ) {
    throw new Error("Analyzer log self-test failed.");
  }

  console.log("Analyzer self-test passed.");
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else {
    server.listen(port, "127.0.0.1", () => {
      console.log(`Analyzer listening on http://127.0.0.1:${port}`);
    });
  }
}
