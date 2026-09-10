import { beforeEach, describe, expect, it, vi } from "vitest";
import { commits } from "../data/history";
import type { LoadedHistory } from "../lib/github";
import { useRepositoryHistory } from "./useRepositoryHistory";

// A minimal hook host lets requests finish in a controlled order without a DOM.
const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, cleanups: [] as (() => void)[] }));
const api = vi.hoisted(() => ({ load: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock("react", () => ({
  useState: <T,>(initial: T | (() => T)) => {
    const index = host.cursor++;
    if (!(index in host.slots)) host.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [host.slots[index], (next: T | ((value: T) => T)) => {
      host.slots[index] = typeof next === "function" ? (next as (value: T) => T)(host.slots[index] as T) : next;
    }];
  },
  useRef: <T,>(initial: T) => {
    const index = host.cursor++;
    return host.slots[index] ??= { current: initial };
  },
  useCallback: <T,>(callback: T) => callback,
  useEffect: (effect: () => (() => void)) => {
    const index = host.cursor++;
    if (!(index in host.slots)) {
      host.slots[index] = true;
      host.cleanups.push(effect());
    }
  },
}));
vi.mock("../lib/github", async (original) => ({
  ...await original<typeof import("../lib/github")>(), loadRepositoryHistory: api.load,
}));
vi.mock("../lib/cache", async (original) => ({
  ...await original<typeof import("../lib/cache")>(), getCachedHistory: api.get, saveCachedHistory: api.save,
}));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const history = (name: string): LoadedHistory => ({
  repository: { owner: "acme", name, url: `https://github.com/acme/${name}`, branch: "main", defaultBranch: "main" },
  branches: [{ name: "main", sha: name, isDefault: true }], commits: [{ ...commits[0], id: name }],
  checkpoints: [], selectedBranch: "main", historyMode: "recent", source: "browser", treeFileCount: 1,
});
const render = () => { host.cursor = 0; return useRepositoryHistory("acme/A"); };

beforeEach(() => {
  host.slots = []; host.cleanups = []; host.cursor = 0;
  vi.clearAllMocks();
  api.get.mockResolvedValue(undefined);
  api.save.mockResolvedValue(undefined);
});

describe("repository load ownership", () => {
  it.each(["success", "error"])("allows retry after A -> B -> A while the old load ends in %s", async (outcome) => {
    const old = deferred<LoadedHistory>();
    api.load.mockReturnValueOnce(old.promise).mockResolvedValueOnce(history("A"));
    const pending = render().load();
    await Promise.resolve();
    render().setInput("acme/B");
    render().setInput("acme/A");
    expect(render().status).toBe("idle");
    if (outcome === "success") old.resolve(history("A")); else old.reject(new Error("cancelled load"));
    await pending;
    expect(render().status).toBe("idle");
    await render().load();
    expect(render().status).toBe("ready");
  });

  it("keeps an unchanged input's request active", async () => {
    const old = deferred<LoadedHistory>();
    api.load.mockReturnValue(old.promise);
    const pending = render().load();
    await Promise.resolve();
    render().setInput("acme/A");
    old.resolve(history("A"));
    await pending;
    expect(render().status).toBe("ready");
  });

  it("preserves the last loaded history when cancelling a reload", async () => {
    api.load.mockResolvedValueOnce(history("A"));
    await render().load();
    const old = deferred<LoadedHistory>();
    api.load.mockReturnValue(old.promise);
    const pending = render().load();
    await Promise.resolve();
    render().setInput("acme/B");
    render().setInput("acme/A");
    expect(render().status).toBe("ready");
    expect(render().repository?.name).toBe("A");
    old.resolve(history("outdated"));
    await pending;
    expect(render().repository?.name).toBe("A");
  });
  it.each(["success", "error"])("ignores stale network %s after a new repository finishes", async (outcome) => {
    const old = deferred<LoadedHistory>();
    api.load.mockImplementation(({ input }) => input === "acme/A" ? old.promise : Promise.resolve(history("B")));
    const a = render().load();
    await Promise.resolve();
    render().setInput("acme/B");
    await render().load();
    if (outcome === "success") old.resolve(history("A")); else old.reject(new Error("old failure"));
    await a;
    expect(render().repository?.name).toBe("B");
    expect(render().status).toBe("ready");
    expect(render().error).toBeUndefined();
  });

  it("ignores a stale cache hit", async () => {
    const cache = deferred<LoadedHistory>();
    api.get.mockReturnValueOnce(cache.promise);
    api.load.mockResolvedValue(history("B"));
    const a = render().load();
    render().setInput("acme/B");
    await render().load();
    cache.resolve(history("A"));
    await a;
    expect(render().repository?.name).toBe("B");
  });

  it("rechecks ownership after an in-flight cache write", async () => {
    const write = deferred<void>();
    api.load.mockResolvedValueOnce(history("A")).mockResolvedValueOnce(history("B"));
    api.save.mockReturnValueOnce(write.promise);
    const a = render().load();
    await vi.waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    render().setInput("acme/B");
    await render().load();
    write.resolve();
    await a;
    expect(render().repository?.name).toBe("B");
  });

  it("invalidates a pending load on unmount", async () => {
    const old = deferred<LoadedHistory>();
    api.load.mockReturnValue(old.promise);
    const pending = render().load();
    await Promise.resolve();
    host.cleanups.forEach((cleanup) => cleanup());
    old.resolve(history("A"));
    await pending;
    expect(api.save).not.toHaveBeenCalled();
    expect(render().repository).toBeUndefined();
  });
});
