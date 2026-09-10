import { describe, expect, it } from "vitest";
import {
  GitHubApiError,
  loadRepositoryHistory,
  parseRepositoryInput,
} from "./github";

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });

describe("parseRepositoryInput", () => {
  it("accepts GitHub URLs and owner/name input", () => {
    expect(parseRepositoryInput("https://github.com/acme/tool.git")).toEqual({
      owner: "acme",
      name: "tool",
    });
    expect(parseRepositoryInput("https://github.com/acme/tool/tree/feature/graph")).toEqual({
      owner: "acme",
      name: "tool",
      branch: "feature/graph",
    });
    expect(parseRepositoryInput("acme/tool")).toEqual({
      owner: "acme",
      name: "tool",
    });
  });

  it("rejects unsupported input", () => {
    expect(parseRepositoryInput("https://example.com/acme/tool")).toBeNull();
    expect(parseRepositoryInput("")).toBeNull();
  });
});

describe("loadRepositoryHistory", () => {
  it("loads large history through the analyzer service", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      expect(url).toBe("https://analyzer.example/history/analyze");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        allHistory: true,
        maxCommits: 500,
        url: "https://github.com/acme/tool",
      });

      return new Response([
        JSON.stringify({ type: "status", message: "preparing" }),
        JSON.stringify({
          type: "result",
          repository: { owner: "acme", name: "tool", url: "https://github.com/acme/tool" },
          ref: { requested: "HEAD", selected: "main" },
          limits: { effective: 500, hasMore: true, maximum: 1000, truncated: true },
          graph: {
            edges: [{ from: "newer123456", to: "older123456" }],
            heads: ["newer123456"],
            merges: [],
            nodes: ["newer123456", "older123456"],
            roots: ["older123456"],
          },
          commits: [
            {
              id: "newer123456",
              shortHash: "newer12",
              parents: ["older123456"],
              author: "Ada",
              date: "2026-01-02T00:00:00Z",
              title: "Rename app entry",
              changes: [
                { path: "src/main.tsx", previousPath: "src/App.tsx", status: "renamed" },
                { path: "README.md", status: "deleted" },
              ],
            },
            {
              id: "older123456",
              shortHash: "older12",
              parents: [],
              author: "Ada",
              date: "2026-01-01T00:00:00Z",
              title: "Seed app",
              changes: [
                { path: "README.md", status: "added" },
                { path: "src/App.tsx", status: "added" },
              ],
            },
          ],
        }),
      ].join("\n"));
    };

    const result = await loadRepositoryHistory({
      analyzerUrl: "https://analyzer.example/",
      input: "acme/tool",
      maxCommits: 500,
      fetcher,
    });

    expect(calls).toEqual(["https://analyzer.example/history/analyze"]);
    expect(result.source).toBe("service");
    expect(result.repository.branch).toBe("main");
    expect(result.commits.map((commit) => commit.id)).toEqual(["older123456", "newer123456"]);
    expect(result.commits[1].parents).toEqual(["older123456"]);
    expect(result.graph?.edges).toEqual([{ from: "newer123456", to: "older123456" }]);
    expect(result.graph?.heads).toEqual(["newer123456"]);
    expect(result.commits[0].snapshot).toEqual(["README.md", "src/App.tsx"]);
    expect(result.commits[1].snapshot).toEqual(["src/main.tsx"]);
    expect(result.notice).toContain("more history");
  });

  it("falls back to the browser GitHub API when the analyzer service is unavailable", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url === "https://analyzer.example/history/analyze") {
        return new Response(JSON.stringify({ type: "error", message: "Service unavailable." }), { status: 503 });
      }

      if (url.endsWith("/repos/acme/tool")) {
        return jsonResponse({
          default_branch: "main",
          html_url: "https://github.com/acme/tool",
          name: "tool",
          owner: { login: "acme" },
        });
      }

      if (url.endsWith("/repos/acme/tool/branches?per_page=100")) {
        return jsonResponse([
          { name: "main", commit: { sha: "seed123456" } },
        ]);
      }

      if (url.includes("/commits?")) {
        return jsonResponse([{ sha: "seed123456" }]);
      }

      if (url.endsWith("/git/trees/seed123456?recursive=1")) {
        return jsonResponse({ tree: [{ path: "README.md", type: "blob" }] });
      }

      if (url.endsWith("/commits/seed123456")) {
        return jsonResponse({
          sha: "seed123456",
          commit: {
            author: { name: "Ada", date: "2026-01-01T00:00:00Z" },
            message: "Seed app",
          },
          files: [{ filename: "README.md", status: "added" }],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    };

    const result = await loadRepositoryHistory({
      analyzerUrl: "https://analyzer.example",
      input: "acme/tool",
      fetcher,
    });

    expect(calls[0]).toBe("https://analyzer.example/history/analyze");
    expect(result.source).toBe("browser");
    expect(result.notice).toContain("fallback");
    expect(result.commits).toHaveLength(1);
  });

  it("loads metadata, commits, details, and derived snapshots", async () => {
    const calls: Array<{ url: string; authorization?: string }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        authorization: headers.get("authorization") ?? undefined,
      });

      if (url.endsWith("/repos/acme/tool")) {
        return jsonResponse({
          default_branch: "main",
          html_url: "https://github.com/acme/tool",
          name: "tool",
          owner: { login: "acme" },
        });
      }

      if (url.endsWith("/repos/acme/tool/branches?per_page=100")) {
        return jsonResponse([
          { name: "main", commit: { sha: "newer123456" } },
          { name: "feature/graph", commit: { sha: "feature123456" } },
        ]);
      }

      if (url.includes("/commits?")) {
        return jsonResponse([{ sha: "newer123456" }, { sha: "older123456" }]);
      }

      if (url.endsWith("/git/trees/older123456?recursive=1")) {
        return jsonResponse({
          tree: [
            { path: "README.md", type: "blob" },
            { path: "src/App.tsx", type: "blob" },
          ],
        });
      }

      if (url.endsWith("/commits/older123456")) {
        return jsonResponse({
          sha: "older123456",
          parents: [],
          commit: {
            author: { name: "Ada", date: "2026-01-01T00:00:00Z" },
            message: "Seed app",
          },
          files: [{ filename: "src/App.tsx", status: "added" }],
        });
      }

      if (url.endsWith("/commits/newer123456")) {
        return jsonResponse({
          sha: "newer123456",
          parents: [{ sha: "older123456" }],
          commit: {
            author: { name: "Ada", date: "2026-01-02T00:00:00Z" },
            message: "Rename app entry",
          },
          files: [
            {
              filename: "src/main.tsx",
              previous_filename: "src/App.tsx",
              status: "renamed",
            },
            { filename: "README.md", status: "removed" },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    };

    const result = await loadRepositoryHistory({
      input: "acme/tool",
      token: "test-token",
      fetcher,
    });

    expect(result.repository).toEqual({
      owner: "acme",
      name: "tool",
      url: "https://github.com/acme/tool",
      branch: "main",
      defaultBranch: "main",
    });
    expect(result.branches.map((branch) => branch.name)).toEqual([
      "main",
      "feature/graph",
    ]);
    expect(result.selectedBranch).toBe("main");
    expect(result.historyMode).toBe("recent");
    expect(result.commits).toHaveLength(2);
    expect(result.commits[1]).toMatchObject({
      fullSha: "newer123456",
      title: "Rename app entry",
      refs: ["refs/heads/main"],
      branches: ["main"],
    });
    expect(result.commits[0].snapshot).toEqual(["README.md", "src/App.tsx"]);
    expect(result.commits[1].changes[0]).toMatchObject({
      path: "src/main.tsx",
      previousPath: "src/App.tsx",
      status: "renamed",
    });
    expect(result.commits[1].parents).toEqual(["older123456"]);
    expect(result.graph?.edges).toEqual([{ from: "newer123456", to: "older123456" }]);
    expect(result.commits[1].snapshot).toEqual(["src/main.tsx"]);
    expect(result.checkpoints[0]).toMatchObject({ index: 0 });
    expect(result.checkpoints.at(-1)).toMatchObject({ index: 1 });
    expect(result.treeFileCount).toBe(2);
    expect(calls.every((call) => call.authorization === "Bearer test-token")).toBe(
      true,
    );
  });

  it("loads a requested branch and falls back to the default when it is missing", async () => {
    const commitListUrls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/repos/acme/tool")) {
        return jsonResponse({
          default_branch: "main",
          html_url: "https://github.com/acme/tool",
          name: "tool",
          owner: { login: "acme" },
        });
      }

      if (url.endsWith("/repos/acme/tool/branches?per_page=100")) {
        return jsonResponse([
          { name: "main", commit: { sha: "main123456" } },
          { name: "feature/graph", commit: { sha: "feature123456" } },
        ]);
      }

      if (url.endsWith("/repos/acme/tool/branches/missing")) {
        return jsonResponse({ message: "not found" }, 404);
      }

      if (url.includes("/commits?")) {
        commitListUrls.push(url);
        return jsonResponse([{ sha: "feature123456" }]);
      }

      if (url.endsWith("/git/trees/feature123456?recursive=1")) {
        return jsonResponse({ tree: [{ path: "feature.md", type: "blob" }] });
      }

      if (url.endsWith("/commits/feature123456")) {
        return jsonResponse({
          sha: "feature123456",
          parents: [{ sha: "seed123456" }],
          commit: {
            author: { name: "Ada", date: "2026-01-03T00:00:00Z" },
            message: "Branch work",
          },
          files: [{ filename: "feature.md", status: "added" }],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    };

    const selected = await loadRepositoryHistory({
      input: "acme/tool",
      branch: "feature/graph",
      fetcher,
    });

    expect(commitListUrls[0]).toContain("sha=feature%2Fgraph");
    expect(selected.repository.branch).toBe("feature/graph");
    expect(selected.commits[0].branches).toContain("feature/graph");
    expect(selected.commits[0].refs).toEqual(["refs/heads/feature/graph"]);

    commitListUrls.length = 0;
    const fallback = await loadRepositoryHistory({
      input: "acme/tool",
      branch: "missing",
      fetcher,
    });

    expect(commitListUrls[0]).toContain("sha=main");
    expect(fallback.repository.branch).toBe("main");
    expect(fallback.notice).toContain("was not found");
  });

  it("loads a requested branch that is not in the first branch page", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url.endsWith("/repos/acme/tool")) {
        return jsonResponse({
          default_branch: "main",
          html_url: "https://github.com/acme/tool",
          name: "tool",
          owner: { login: "acme" },
        });
      }

      if (url.endsWith("/repos/acme/tool/branches?per_page=100")) {
        return jsonResponse([
          { name: "main", commit: { sha: "main123456" } },
        ]);
      }

      if (url.endsWith("/repos/acme/tool/branches/release%2Fv1")) {
        return jsonResponse({
          name: "release/v1",
          commit: { sha: "release123456" },
        });
      }

      if (url.includes("/commits?")) {
        return jsonResponse([{ sha: "release123456" }]);
      }

      if (url.endsWith("/git/trees/release123456?recursive=1")) {
        return jsonResponse({ tree: [{ path: "release.md", type: "blob" }] });
      }

      if (url.endsWith("/commits/release123456")) {
        return jsonResponse({
          sha: "release123456",
          parents: [{ sha: "main123456" }],
          commit: {
            author: { name: "Ada", date: "2026-01-04T00:00:00Z" },
            message: "Prepare release",
          },
          files: [{ filename: "release.md", status: "added" }],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    };

    const result = await loadRepositoryHistory({
      input: "https://github.com/acme/tool/tree/release/v1",
      fetcher,
    });

    expect(calls).toContain(
      "https://api.github.com/repos/acme/tool/branches/release%2Fv1",
    );
    expect(result.repository.branch).toBe("release/v1");
    expect(result.branches.map((branch) => branch.name)).toEqual([
      "main",
      "release/v1",
    ]);
    expect(result.commits[0].refs).toEqual(["refs/heads/release/v1"]);
  });

  it("maps local analyzer-shaped commits with titles", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          type: "result",
          repository: {
            owner: "acme",
            name: "tool",
            url: "https://github.com/acme/tool",
            branch: "main",
          },
          ref: { requested: "main", selected: "main" },
          commits: [
            {
              id: "abcdef123456",
              parents: [],
              author: "Ada",
              date: "2026-01-01T00:00:00Z",
              title: "Seed app",
              changes: [{ path: "README.md", status: "added" }],
            },
          ],
        }),
      );

    const result = await loadRepositoryHistory({
      analyzerUrl: "http://127.0.0.1:8787",
      input: "acme/tool",
      branch: "main",
      fetcher,
    });

    expect(result.commits[0]).toMatchObject({
      message: "Seed app",
      shortHash: "abcdef1",
      title: "Seed app",
    });
  });

  it("surfaces rate limit failures", async () => {
    const fetcher = async () =>
      jsonResponse(
        { message: "rate limit" },
        403,
        {
          "x-ratelimit-limit": "60",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1770000000",
        },
      );

    await expect(
      loadRepositoryHistory({ input: "acme/tool", fetcher }),
    ).rejects.toMatchObject({
      status: 403,
      rateLimit: {
        limit: 60,
        remaining: 0,
      },
    });
  });

  it("surfaces a notice when GitHub tree is truncated", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/tool")) {
        return jsonResponse({
          default_branch: "main",
          html_url: "https://github.com/acme/tool",
          name: "tool",
          owner: { login: "acme" },
        });
      }
      if (url.endsWith("/repos/acme/tool/branches?per_page=100")) {
        return jsonResponse([
          { name: "main", commit: { sha: "abc123456" } },
        ]);
      }
      if (url.includes("/commits?")) {
        return jsonResponse([{ sha: "abc123456" }]);
      }
      if (url.endsWith("/git/trees/abc123456?recursive=1")) {
        return jsonResponse({
          tree: [{ path: "README.md", type: "blob" }],
          truncated: true,
        });
      }
      if (url.endsWith("/commits/abc123456")) {
        return jsonResponse({
          sha: "abc123456",
          parents: [],
          commit: {
            author: { name: "Ada", date: "2026-01-01T00:00:00Z" },
            message: "Seed app",
          },
          files: [{ filename: "README.md", status: "added" }],
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const result = await loadRepositoryHistory({
      input: "acme/tool",
      fetcher,
    });

    expect(result.notice).toContain("exceeds GitHub API size limit");
  });
});
