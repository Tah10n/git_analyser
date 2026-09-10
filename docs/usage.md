# Usage guide

See [Run locally](../README.md#run-locally) for installation. The interface uses
Russian labels; English explanations below match the current controls.

## Load a repository

The initial screen contains bundled demo commits. The example repository shown
in demo mode is illustrative; it is not automatically fetched from GitHub.

1. Enter `owner/name`, an HTTPS GitHub repository URL, or a branch URL:
   `https://github.com/owner/name/tree/feature/graph`. URLs ending in `.git` work too.
2. If needed, open **Настройки** (Settings) and enter a GitHub token with only
   the repository access you need.
3. Press **Загрузить** (Load). The source label distinguishes demo, browser,
   and service data.
4. Use **Ветка** (Branch) to load another branch. A missing requested branch
   falls back to the default branch in browser mode and produces a warning.

Browser mode loads up to **20 recent commits**, displayed oldest to newest in
the loaded sequence. It loads the first 100 branch refs and separately resolves
a branch explicitly named in the input URL. Parent links outside the loaded
window do not appear as graph nodes.

When an analyzer URL is configured, the app tries the service first, requesting
up to **500 commits**. Service failure falls back to browser mode with a notice.
The bundled service exposes only the selected branch in its response; enter a
different branch URL to analyze another one. See [Analyzer setup](analyzer.md).

## Graph and timeline

Selecting a graph node or moving **Позиция в истории** (History position)
updates the file tree, change list, and metadata inspector together.

| Control | Behavior |
| --- | --- |
| **Объём** | Switch to 3D; drag with the pointer or touch to rotate |
| **2D** | Show fixed lanes; click a visible node to select it |
| Mouse wheel over graph | Zoom in or out |
| **Сбросить вид** | Restore the graph's initial rotation and zoom |
| Previous / next buttons | Move one commit backward or forward |
| **Воспроизвести** / **Пауза** | Start or pause looping playback |
| **0.75×**, **1×**, **1.5×**, **2×** | Change timeline playback speed |

Focus the graph with Tab for keyboard controls:

| Key | Action |
| --- | --- |
| Left / right in 2D | Select the previous / next commit |
| Arrow keys in 3D | Rotate; hold Shift for a larger step |
| `+` / `-` | Zoom |
| Home | Reset the view |

The graph shows ancestry within the loaded window. Lanes represent parent
chains; they are not a complete record of historical branch names.

## File tree and inspector

- **Поиск по пути** filters paths; **Только изменённые** focuses on the selected
  commit's changes, including deleted paths.
- Folders start collapsed, and paths touched by the selected commit expand
  automatically. Use the chevron to open or close a folder manually.
- The visible/total count reflects tree filtering and collapsed folders.
- The inspector shows the author, date, branch, SHA, parent SHAs, and refs.
- On narrow screens, **Репозиторий** opens or closes the file-tree panel.

This view displays file metadata and changes, not source contents or text diffs.

## Settings and stored data

Open **Настройки** to switch between **Тёмная**, **Светлая**, and **IDE**, manage
the token, see available GitHub rate-limit information, or clear cached history.

The optional token is stored in `localStorage` and attached only to requests to
`api.github.com`. Clearing the field removes its saved value. The analyzer does
not receive it. Clearing a token does not erase previously cached repository data.

IndexedDB stores history metadata and file paths, keyed by source, repository
input, branch, history mode, and commit limit. Branch-name case is preserved.
Entries have no expiry. For fresh data, use **Очистить кэш**, then **Загрузить**.
Clearing the cache does not remove the token or the history already on screen.
If browser storage is unavailable, loading can still work for the current session.

## Export

Press **Экспорт WebM**, wait for recording to finish, then use **Скачать WebM**
to save `git-history-explorer.webm`.

The export is a 1280 × 720 commit-summary animation of the loaded sequence. Each
commit gets roughly 420 ms and shows up to eight changed paths. Graph rotation,
tree filters, theme, and timeline speed do not alter this export. MP4 and GIF
are not implemented.

The browser must support `MediaRecorder`, a WebM codec, and canvas capture.
If recording fails, try a Chromium browser and keep the tab active until it ends.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Demo still displayed | Enter an actual repository and press **Загрузить**; the demo URL is illustrative |
| 403 or 429 response | Check the displayed rate limit, wait for reset, or add a suitable GitHub token |
| 404 response | Check repository spelling, token access, and the requested branch |
| Unexpected default branch | Check the warning and enter the full branch URL |
| Recent commits missing | Clear cache and reload; browser mode still stops at 20 commits |
| Incomplete tree or changes | Read the size/truncation warning; GitHub API caps can limit the result |
| Service fallback warning | Check the analyzer health endpoint, URL, and browser console; restart Vite after changing configuration |
| WebM unavailable | Confirm WebM recording support in the browser |

If the problem persists, [open a bug report](https://github.com/Tah10n/git_analyser/issues/new/choose)
with reproduction steps, browser/OS, and the displayed error. Remove tokens and
any repository data you do not want to share from logs and screenshots.
