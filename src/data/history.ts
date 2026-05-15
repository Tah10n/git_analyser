import type { ExplorerCommit } from "../types";

export const repository = {
  owner: "open-source",
  name: "git-history-explorer",
  url: "https://github.com/open-source/git-history-explorer",
  branch: "main",
};

export const commits: ExplorerCommit[] = [
  {
    id: "c1",
    shortHash: "8b19c2a",
    message: "Initialize app shell",
    author: "Mira Chen",
    date: "2026-04-02T10:16:00Z",
    branch: "main",
    changes: [
      {
        path: "src/App.tsx",
        status: "added",
        summary: "Add primary application shell",
      },
      {
        path: "src/styles.css",
        status: "added",
        summary: "Add base interface styles",
      },
      {
        path: "package.json",
        status: "added",
        summary: "Add project metadata and scripts",
      },
    ],
    snapshot: ["package.json", "src/App.tsx", "src/styles.css"],
  },
  {
    id: "c2",
    shortHash: "12f6ad4",
    message: "Add typed sample history",
    author: "Jon Bell",
    date: "2026-04-04T13:48:00Z",
    branch: "main",
    changes: [
      {
        path: "src/data/history.ts",
        status: "added",
        summary: "Add mocked commit history",
      },
      {
        path: "src/types.ts",
        status: "added",
        summary: "Add shared explorer types",
      },
      {
        path: "src/App.tsx",
        status: "modified",
        summary: "Read commit data from typed fixtures",
      },
    ],
    snapshot: [
      "package.json",
      "src/App.tsx",
      "src/data/history.ts",
      "src/styles.css",
      "src/types.ts",
    ],
  },
  {
    id: "c3",
    shortHash: "9ac42ef",
    message: "Render tree playback",
    author: "Mira Chen",
    date: "2026-04-07T09:22:00Z",
    branch: "main",
    changes: [
      {
        path: "src/components/FileTree.tsx",
        status: "added",
        summary: "Add file tree renderer",
      },
      {
        path: "src/lib/tree.ts",
        status: "added",
        summary: "Add snapshot-to-tree conversion",
      },
      {
        path: "src/App.tsx",
        status: "modified",
        summary: "Wire selected commit to file tree",
      },
    ],
    snapshot: [
      "package.json",
      "src/App.tsx",
      "src/components/FileTree.tsx",
      "src/data/history.ts",
      "src/lib/tree.ts",
      "src/styles.css",
      "src/types.ts",
    ],
  },
  {
    id: "c4",
    shortHash: "fe40712",
    message: "Rename tree utilities",
    author: "Ari Singh",
    date: "2026-04-10T16:03:00Z",
    branch: "main",
    changes: [
      {
        path: "src/lib/buildTree.ts",
        previousPath: "src/lib/tree.ts",
        status: "renamed",
        summary: "Move tree construction into clearer module name",
      },
      {
        path: "src/components/FileTree.tsx",
        status: "modified",
        summary: "Show renamed paths in node metadata",
      },
    ],
    snapshot: [
      "package.json",
      "src/App.tsx",
      "src/components/FileTree.tsx",
      "src/data/history.ts",
      "src/lib/buildTree.ts",
      "src/styles.css",
      "src/types.ts",
    ],
  },
  {
    id: "c5",
    shortHash: "d55e903",
    message: "Remove unused global styles",
    author: "Jon Bell",
    date: "2026-04-12T11:37:00Z",
    branch: "main",
    changes: [
      {
        path: "src/styles.css",
        status: "deleted",
        summary: "Delete obsolete global stylesheet",
      },
      {
        path: "src/App.tsx",
        status: "modified",
        summary: "Move layout styles into component modules",
      },
    ],
    snapshot: [
      "package.json",
      "src/App.tsx",
      "src/components/FileTree.tsx",
      "src/data/history.ts",
      "src/lib/buildTree.ts",
      "src/types.ts",
    ],
  },
  {
    id: "c6",
    shortHash: "3bc8a77",
    message: "Polish playback controls",
    author: "Mira Chen",
    date: "2026-04-15T18:20:00Z",
    branch: "main",
    changes: [
      {
        path: "src/components/Timeline.tsx",
        status: "added",
        summary: "Add scrubber and playback controls",
      },
      {
        path: "src/App.tsx",
        status: "modified",
        summary: "Connect playback to selected commit",
      },
      {
        path: "src/components/FileTree.tsx",
        status: "modified",
        summary: "Tune change highlight timing",
      },
    ],
    snapshot: [
      "package.json",
      "src/App.tsx",
      "src/components/FileTree.tsx",
      "src/components/Timeline.tsx",
      "src/data/history.ts",
      "src/lib/buildTree.ts",
      "src/types.ts",
    ],
  },
];
