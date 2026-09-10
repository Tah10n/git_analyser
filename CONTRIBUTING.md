# Contributing

Git Analyzer is a React, TypeScript, and Vite application with an optional Node.js
analyzer. Start with the [README](README.md) and [usage guide](docs/usage.md).

## Development

Use Node.js 22.12+ and npm 10+, with Git on `PATH`:

```sh
npm ci
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite on loopback |
| `npm run test` | Run Vitest, including tests that create temporary Git repositories |
| `npm run typecheck` | Check TypeScript project references |
| `npm run build` | Type-check and build static assets into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run analyzer` | Start the optional local analyzer |
| `npm run analyzer:self-test` | Check analyzer input and parser guardrails |

Before opening a pull request:

```sh
npm run test
npm run typecheck
npm run build
npm run analyzer:self-test
git diff --check
```

[CI](https://github.com/Tah10n/git_analyser/actions/workflows/ci.yml) runs these
app checks on Linux with Node.js 22 and 24, and Windows with Node.js 22. There is
no lint command. A green CI run does not replace browser checks for UI changes.

## Browser checks

For UI changes, verify the demo on desktop and at a narrow mobile width:

- Graph selection, 2D/3D switching, rotation, zoom, reset, and keyboard controls.
- Repository and branch loading, plus loading, empty, error, and warning states.
- File search, changed-only mode, folder toggles, and the mobile repository panel.
- Themes, token entry/clearing, cache clearing and a subsequent reload.
- Timeline navigation, playback, speed, and WebM export in a supported browser.

State whether GitHub loading was tested with mocks or real requests. Do not
include tokens or sensitive repository data in screenshots or logs.

## Code and documentation

Keep changes focused and add regression coverage for behavior you change.
Preserve parent relationships when reconstructing snapshots, bound network work,
and keep errors visible. Tokens belong in browser storage and GitHub requests;
do not forward them to the analyzer. Avoid fetching file contents for metadata views.

Use the existing module boundaries: components for rendering, hooks for load and
selection orchestration, and `src/lib/` for data, storage, and export logic.
Keep the npm lockfile consistent when changing dependencies.

Update the README or relevant guide when controls, limits, setup, or service
contracts change. Document implemented behavior separately from future ideas.

## Pull requests and issues

Use a descriptive Conventional Commit title, such as
`fix: preserve file trees across merges`. Explain the problem, resulting behavior,
and checks performed. Include a screenshot for a visible UI change.

Search [existing issues](https://github.com/Tah10n/git_analyser/issues) before
opening a bug report or feature request. Use the provided forms for reproduction
steps and expected behavior.

Contributions are made under the project's [Apache-2.0 license](LICENSE).
