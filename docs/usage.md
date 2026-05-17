# Usage Guide

Git History Explorer lets you load GitHub repository history and review how the
file tree changes across commits.

## Start The App

```powershell
npm install
npm run dev
```

Open the local Vite URL printed by the command.

## Demo Mode

On first load, the app shows bundled demo data. Demo mode is useful for testing
the timeline, file tree, themes, and export flow without making GitHub API
requests.

## API Mode

Use the repository field to load real data:

- `owner/name`
- `https://github.com/owner/name`
- `https://github.com/owner/name.git`
- `https://github.com/owner/name/tree/feature`

The app loads repository branches, starts with the default branch unless the
input URL names another branch, fetches a bounded set of commits, normalizes
changed files, and reconstructs file-tree snapshots for timeline navigation.

Use the branch picker in the command bar to switch branches without clearing the
repository input, token, theme, or cache controls. If the requested branch is not
available, the app falls back to the repository default branch and shows a
warning.

## Token Handling

The token field is optional. Use it when the GitHub API rate limit is too low
for the repository you are inspecting.

- Tokens are stored in `localStorage`.
- Tokens are sent only to `api.github.com`.
- Clearing the token field removes the saved value.

Use a token with the narrowest access needed for the repositories you inspect.

## Timeline Workflow

1. Load a repository or use demo data.
2. Drag the timeline slider to jump between commits.
3. Use previous/next for precise navigation.
4. Press play to loop through the commit sequence.
5. Adjust speed when reviewing dense histories.

The selected commit controls both the file tree and the commit panel.

## File Tree Workflow

- Folders start collapsed.
- Folders containing files touched by the selected commit open automatically.
- Use the chevron beside a folder to open or close it manually.
- Use **Search** to filter by path.
- Enable **Changed only** to focus on files touched by the selected commit.
- Watch change badges for added, modified, deleted, and renamed paths.
- Use the visible/total count to understand how much the current filters hide.

The tree renders a virtualized row window so large trees remain responsive.

## Cache Workflow

Loaded histories are cached in IndexedDB using the repository input, selected
branch, history mode, and commit limit as the cache key. Repeat loads reuse
cached data when possible.

Use **Clear cache** to remove cached histories. This does not remove the saved
token.

## Export Workflow

Use **Export WebM** to record a short canvas-based playback of the timeline.
When recording succeeds, the app exposes a browser object URL for the generated
clip.

Export depends on `MediaRecorder`. Chrome and Edge currently provide the most
reliable support.

## Analyzer Workflow

The optional analyzer endpoint extracts commit metadata with Git for cases where
browser API loading is not enough.

```powershell
npm run analyzer
```

The endpoint listens on `http://127.0.0.1:8787`.

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

The endpoint streams newline-delimited JSON. Each request uses a temporary clone
and removes it after the job completes or fails.
