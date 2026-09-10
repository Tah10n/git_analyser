import { describe, expect, it } from "vitest";
import { loadRepositoryHistory } from "./github";

const json = (body: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { headers });
const file = (filename: string, status = "added"): {
  filename: string; status: string; previous_filename?: string;
} => ({ filename, status });
const detail = (sha: string, parents: string[], files = [file(`${sha}.txt`)]) => ({
  sha, parents: parents.map((sha) => ({ sha })), files,
  commit: { message: sha, author: { name: "Ada", date: "2026-01-01T00:00:00Z" } },
});

const fixture = (details: ReturnType<typeof detail>[], trees: Record<string, string[]>) => {
  const calls: string[] = [];
  const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/repos/acme/tool")) return json({
      id: 2325298,
      default_branch: "main", html_url: "https://github.com/acme/tool",
      name: "tool", owner: { login: "acme" },
    });
    if (url.includes("/branches?")) return json([{ name: "main", commit: { sha: details.at(-1)!.sha } }]);
    if (url.includes("/commits?")) return json([...details].reverse().map(({ sha }) => ({ sha })));
    const treeSha = url.match(/\/git\/trees\/([^?]+)/)?.[1];
    if (treeSha && trees[treeSha]) return json({ tree: trees[treeSha].map((path) => ({ path, type: "blob" })) });
    const commit = details.find((item) => url.endsWith(`/commits/${item.sha}`));
    if (commit) return json(commit);
    throw new Error(`Unexpected request: ${url}`);
  };
  return { calls, fetcher };
};

describe("history correctness regressions", () => {
  it("reconstructs divergent commits from their own first parent, including deletions and renames", async () => {
    const f = fixture([
      detail("A", []), detail("B", ["A"], [file("side.txt")]),
      detail("C", ["A"], [file("A.txt", "removed"), file("main.txt")]),
      detail("M", ["C", "B"], [{ ...file("merged.txt", "renamed"), previous_filename: "main.txt" }, file("side.txt")]),
    ], { A: ["A.txt"] });
    const result = await loadRepositoryHistory({ input: "acme/tool", fetcher: f.fetcher });
    expect(result.commits.map((commit) => commit.snapshot)).toEqual([
      ["A.txt"], ["A.txt", "side.txt"], ["main.txt"], ["merged.txt", "side.txt"],
    ]);
    expect(f.calls.filter((url) => url.includes("/git/trees/"))).toHaveLength(1);
  });

  it("fetches another seed tree when a first parent is outside the window", async () => {
    const f = fixture([detail("A", ["outside"]), detail("B", ["other-outside"])],
      { A: ["A.txt", "stable-a.txt"], B: ["B.txt", "stable-b.txt"] });
    const result = await loadRepositoryHistory({ input: "acme/tool", fetcher: f.fetcher });
    expect(result.commits[1].snapshot).toEqual(["B.txt", "stable-b.txt"]);
  });

  it("resolves a first parent appearing later in the returned order", async () => {
    const f = fixture([detail("A", []), detail("C", ["B"]), detail("B", ["A"])], { A: ["A.txt"] });
    const result = await loadRepositoryHistory({ input: "acme/tool", fetcher: f.fetcher });
    expect(result.commits[1].snapshot).toEqual(["A.txt", "B.txt", "C.txt"]);
    expect(result.commits[2].snapshot).toEqual(["A.txt", "B.txt"]);
  });

  it("follows commit file pages and applies all changes to later snapshots", async () => {
    const f = fixture([detail("A", []), detail("B", ["A"])], { A: ["A.txt"] });
    const pageRequests: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/commits/B")) return json(detail("B", ["A"],
        Array.from({ length: 300 }, (_, index) => file(`file-${index}.txt`))),
      { link: '<https://api.github.com/repos/acme/tool/commits/B?page=2>; rel="next"' });
      if (url.endsWith("?page=2")) {
        pageRequests.push(url);
        return json(detail("B", ["A"], [file("last.txt"), file("A.txt", "removed")]));
      }
      return f.fetcher(input);
    };
    const result = await loadRepositoryHistory({ input: "acme/tool", fetcher });
    expect(pageRequests).toHaveLength(1);
    expect(result.commits[1].changes).toHaveLength(302);
    expect(result.commits[1].snapshot).toContain("last.txt");
    expect(result.commits[1].snapshot).not.toContain("A.txt");
  });

  it("uses a real tree and warns when the file listing reaches the API cap", async () => {
    const f = fixture([detail("A", []), detail("B", ["A"],
      Array.from({ length: 3000 }, (_, index) => file(`file-${index}.txt`)))],
    { A: ["A.txt"], B: ["actual-tree.txt", "beyond-cap.txt"] });
    const result = await loadRepositoryHistory({ input: "acme/tool", fetcher: f.fetcher });
    expect(result.notice).toContain("3000-file limit");
    expect(result.commits[1].snapshot).toEqual(["actual-tree.txt", "beyond-cap.txt"]);
  });

  it("accepts GitHub's numeric repository links across multiple file pages", async () => {
    const f = fixture([detail("A", []), detail("B", ["A"])], { A: ["A.txt"] });
    const requests: string[] = [];
    const result = await loadRepositoryHistory({ input: "acme/tool", fetcher: async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/commits/B")) return json(detail("B", ["A"]), {
        link: '<https://api.github.com/repositories/2325298/commits/B?page=2>; rel="next"',
      });
      if (url.endsWith("/commits/B?page=2")) return json(detail("B", ["A"], [file("second.txt")]), {
        link: '<https://api.github.com/repositories/2325298/commits/B?page=3>; rel="next"',
      });
      if (url.endsWith("/commits/B?page=3")) return json(detail("B", ["A"], [file("third.txt")]));
      return f.fetcher(input);
    } });
    expect(result.commits[1].snapshot).toEqual(["A.txt", "B.txt", "second.txt", "third.txt"]);
    expect(requests).toContain("https://api.github.com/repos/acme/tool/commits/B?page=3");
  });

  it.each([
    "/repositories/999/commits/A?page=2",
    "/repositories/2325298/commits/other?page=2",
    "/repos/other/tool/commits/A?page=2",
  ])("rejects pagination for another repository or commit: %s", async (link) => {
    const f = fixture([detail("A", [])], { A: ["A.txt"] });
    await expect(loadRepositoryHistory({ input: "acme/tool", fetcher: async (input) =>
      String(input).endsWith("/commits/A")
        ? json(detail("A", []), { link: `<https://api.github.com${link}>; rel="next"` })
        : f.fetcher(input),
    })).rejects.toThrow("Invalid commit file pagination");
  });

  it("never follows a pagination link to another host with the token", async () => {
    const f = fixture([detail("A", [])], { A: ["A.txt"] });
    const fetcher = async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/commits/A")) return json(detail("A", []),
        { link: '<https://other.example/steal>; rel="next"' });
      return f.fetcher(input);
    };
    await expect(loadRepositoryHistory({ input: "acme/tool", token: "test", fetcher }))
      .rejects.toThrow("Invalid commit file pagination");
    expect(f.calls.every((url) => url.startsWith("https://api.github.com/"))).toBe(true);
  });

  it("uses analyzer snapshots at boundaries and merges without mixing sibling histories", async () => {
    const commits = [
      { id: "M", parents: ["C", "B"], snapshot: ["resolved.txt"] },
      { id: "C", parents: ["A"] }, { id: "B", parents: ["A"] },
      { id: "A", parents: ["outside"], snapshot: ["stable.txt"] },
    ].map((commit) => ({ ...commit, author: "Ada", date: "2026-01-01T00:00:00Z", title: commit.id,
      changes: [{ path: `${commit.id}.txt`, status: "added" }] }));
    const result = await loadRepositoryHistory({ input: "acme/tool", analyzerUrl: "https://analyzer.example",
      fetcher: async () => json({ type: "result", repository: { owner: "acme", name: "tool", branch: "main" }, commits }) });
    expect(result.source).toBe("service");
    expect(result.commits.map((commit) => commit.snapshot)).toEqual([
      ["stable.txt"], ["B.txt", "stable.txt"], ["C.txt", "stable.txt"], ["resolved.txt"],
    ]);
  });

  it("falls back within browser limits if an older analyzer cannot supply a boundary tree", async () => {
    const f = fixture([detail("A", [])], { A: ["A.txt"] });
    const result = await loadRepositoryHistory({ input: "acme/tool", analyzerUrl: "https://analyzer.example", maxCommits: 500,
      fetcher: async (input) => String(input).includes("analyzer.example") ? json({
        type: "result", repository: { owner: "acme", name: "tool" },
        commits: [{ id: "B", parents: ["outside"], changes: [], title: "B" }],
      }) : f.fetcher(input) });
    expect(result.source).toBe("browser");
    expect(f.calls.find((url) => url.includes("/commits?"))).toContain("per_page=20");
  });
});
