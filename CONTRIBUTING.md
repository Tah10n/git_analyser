# Contributing

This package is a Vite, React, and TypeScript app. Keep changes focused on the
product surface: loading GitHub history, navigating the file tree, inspecting
commits, exporting short clips, and keeping the experience fast in the browser.

## Setup

```powershell
npm install
npm run dev
```

## Checks

Run these before sending a change:

```powershell
npm run test
npm run typecheck
npm run build
npm run analyzer:self-test
```

Use a browser smoke test for UI changes:

1. Start `npm run dev`.
2. Load the demo data.
3. Test repository input, search, changed-only mode, theme switching, timeline
   playback, cache clearing, and WebM export.
4. Check desktop and narrow mobile widths for overflow.

## Code Guidelines

- Prefer typed data models over ad hoc objects.
- Keep browser data fetching bounded and failure states visible.
- Keep GitHub tokens in browser storage only.
- Avoid file contents unless a feature explicitly needs them.
- Use virtualized rendering for lists that can grow.
- Keep components focused: command bar, tree, commit panel, timeline, and data
  hooks should remain separate.
- Add tests around parsers, limit handling, data normalization, caching logic,
  and export fallbacks.

## Documentation Guidelines

- Document user-visible behavior, setup, scripts, and troubleshooting.
- Keep release mechanics and root-level repository layout details out of this
  package.
- Update `README.md` or `docs/usage.md` when a change alters setup or user
  workflow.
- Keep examples copy-pasteable for PowerShell where commands span lines.
