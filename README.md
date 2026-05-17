# Git History Explorer

Git History Explorer is an IDE-like browser app for inspecting how a GitHub
repository changes over time. Paste a GitHub URL or `owner/name`, choose a
branch, and scrub through commits while the file tree and change list update
together.

## Features

- GitHub URL and `owner/name` input.
- Bounded selected-branch history loading through the GitHub REST API.
- Repository branch loading with a branch picker and default-branch fallback.
- Static demo data fallback when no repository has been loaded.
- Optional browser-local GitHub token for higher API limits.
- IDE-style file tree with folder/file icons and change badges.
- Search, changed-only filtering, and virtualized rows for larger trees.
- Commit panel with author, date, short hash, message, and changed files.
- Timeline slider with play, pause, previous, next, and speed controls.
- Dark, light, and JetBrains-style themes.
- IndexedDB history cache with an explicit clear action.
- Browser-side WebM export for short timeline clips.
- Optional analyzer service for larger repositories and broader history windows.

## Requirements

- Node.js 20.19+ or 22.12+.
- npm 10 or newer.
- A modern Chromium, Firefox, or Safari browser.
- GitHub API access from the browser.

## Quick Start

```powershell
npm install
npm run dev
```

Open the printed local Vite URL in a browser.

## Loading A Repository

1. Enter a GitHub repository as `owner/name`,
   `https://github.com/owner/name`, or a branch URL such as
   `https://github.com/owner/name/tree/feature`.
2. Optionally enter a GitHub personal access token. The app stores it in
   `localStorage` and only sends it to `api.github.com`.
3. Press **Load**.
4. Use the branch picker to switch between loaded repository branches.
5. Use the timeline, file tree, and commit panel to inspect the loaded history.

The browser path intentionally loads a bounded commit window. When a repository
is too large for comfortable browser use, the app shows a warning instead of
freezing the interface.

## Interface Guide

- **Command bar**: repository input, token field, branch picker, theme switcher,
  API rate display, and cache clearing.
- **File tree**: searchable tree for the selected commit. Folders start
  collapsed, folders containing current commit changes open automatically, and
  each folder can be opened or closed manually. Enable **Changed only** to show
  only files touched by the current commit.
- **Commit panel**: selected commit metadata and changed-file list.
- **Timeline**: scrubber, playback controls, speed selector, and WebM export.

## Browser Storage

The app uses two browser storage areas:

- `localStorage` for the optional GitHub token.
- IndexedDB for loaded history cache entries.

Use **Clear cache** in the command bar to delete cached histories. Clear the
token field to remove the saved token.

## WebM Export

Press **Export WebM** in the timeline to record a compact canvas playback of the
loaded commit sequence. Export requires `MediaRecorder` support. Current Chrome
and Edge versions provide the best results.

## Optional Analyzer

The analyzer service is optional; the browser app works without it and falls
back to direct GitHub API loading when the service is unavailable.

Point the app at a service instance with:

```powershell
$env:VITE_ANALYZER_URL="http://127.0.0.1:8787"
npm run dev
```

Health check:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8787/health
```

Analyze a repository:

```powershell
$body = @{
  url = "https://github.com/owner/name"
  ref = "main"
  maxCommits = 200
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri http://127.0.0.1:8787/history/analyze `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

The response is newline-delimited JSON with progress messages and a final
result. When configured, the app uses the service for larger history loads,
renders the returned branch graph data without extra parent lookups, and keeps
the browser-only path as a fallback.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server. |
| `npm run build` | Type-check and create a production build. |
| `npm run preview` | Preview the production build locally. |
| `npm run test` | Run Vitest tests. |
| `npm run typecheck` | Run TypeScript project references. |
| `npm run analyzer` | Start the optional analyzer endpoint. |
| `npm run analyzer:self-test` | Run analyzer guardrail checks. |

## Troubleshooting

- **403 or low rate limit**: add a GitHub token or wait for the rate window to
  reset.
- **Repository stays on demo data**: check the repository input format and press
  **Load** again.
- **Branch falls back to the default**: confirm the selected branch still exists
  on GitHub and reload.
- **No WebM file is produced**: try Chrome or Edge and confirm the browser
  supports `MediaRecorder`.
- **Large tree warning**: use a smaller repository, reduce the commit window in
  code, or use the analyzer endpoint for temporary extraction.
