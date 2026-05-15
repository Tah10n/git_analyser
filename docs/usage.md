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

The app loads the default branch, fetches a bounded set of commits, normalizes
changed files, and reconstructs file-tree snapshots for timeline navigation.

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

- Use **Search** to filter by path.
- Enable **Changed only** to focus on files touched by the selected commit.
- Watch change badges for added, modified, deleted, and renamed paths.
- Use the visible/total count to understand how much the current filters hide.

The tree renders a virtualized row window so large trees remain responsive.

## Cache Workflow

Loaded histories are cached in IndexedDB using the repository input and commit
limit as the cache key. Repeat loads reuse cached data when possible.

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
  maxCommits = 200
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri http://127.0.0.1:8787/analyze `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

The endpoint streams newline-delimited JSON. Each request uses a temporary clone
and removes it after the job completes or fails.
