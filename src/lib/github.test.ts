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
    });
    expect(result.commits).toHaveLength(2);
    expect(result.commits[0].snapshot).toEqual(["README.md", "src/App.tsx"]);
    expect(result.commits[1].changes[0]).toMatchObject({
      path: "src/main.tsx",
      previousPath: "src/App.tsx",
      status: "renamed",
    });
    expect(result.commits[1].snapshot).toEqual(["src/main.tsx"]);
    expect(result.checkpoints[0]).toMatchObject({ index: 0 });
    expect(result.checkpoints.at(-1)).toMatchObject({ index: 1 });
    expect(result.treeFileCount).toBe(2);
    expect(calls.every((call) => call.authorization === "Bearer test-token")).toBe(
      true,
    );
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
});
