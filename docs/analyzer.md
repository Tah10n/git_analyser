# Optional analyzer

The frontend works without this service. The bundled analyzer uses local Git to
extract a larger selected-branch history window into a temporary directory.
It listens on loopback and is intended for local development.

## Start both processes

Install dependencies with `npm ci` first. Node.js and Git must be on `PATH`.

In terminal 1, from the repository directory:

```sh
npm run analyzer
```

In terminal 2, from the same directory, using PowerShell:

```powershell
$env:VITE_ANALYZER_URL = "http://127.0.0.1:8787"
npm run dev
```

Or with a POSIX shell:

```sh
VITE_ANALYZER_URL=http://127.0.0.1:8787 npm run dev
```

Alternatively, set `VITE_ANALYZER_URL=http://127.0.0.1:8787` in `.env.local`.
Restart Vite after changing this value. Production builds embed the setting;
set it before `npm run build`. A deployed frontend needs an endpoint its users'
browsers can reach, with compatible HTTPS and CORS configuration.

To return to browser-only mode, remove the setting from your environment and
`.env.local`, then restart Vite or rebuild. Stop each local process with Ctrl+C
in its terminal. `PORT` changes the analyzer port; update the frontend URL to match.

## Check the endpoint

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8787/health

$body = @{
  url = "https://github.com/Tah10n/git_analyser"
  ref = "main"
  maxCommits = 200
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri http://127.0.0.1:8787/history/analyze `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

`GET /health` returns an object with `ok: true`. `POST /analyze` is an alias for
`POST /history/analyze`. The POST body accepts:

| Field | Meaning |
| --- | --- |
| `url` | Required HTTPS GitHub repository URL, without a `/tree/` suffix |
| `ref` | Optional branch name; omitted means the clone's default branch |
| `maxCommits` | Positive number, rounded down and capped at 1,000; default 500 |

The app itself requests 500 commits. Repository data must be accessible to Git
on the analyzer host. The service does not use the frontend GitHub token and
does not implement a token-authenticated clone flow.

## Response contract

Responses use `application/x-ndjson`: one JSON record per line. Inspect the
records for errors even if the HTTP status is 200, because headers are sent
before the analysis finishes.

- `status` records describe stages such as `cloning`, `reading-history`, and
  `cleaned-up`.
- A `result` record contains `repository`, `ref`, and `commits`.
- An `error` record contains a `message`.

Each commit contains `id`, `parents`, `author`, `date`, `title`, and `changes`.
Changes carry a `path`, a normalized `status`, and an optional `previousPath`.
The `snapshot` field is an array of file paths. It is required for merges and
commits whose first parent is outside the returned window; the bundled analyzer
supplies it. Other snapshots can be reconstructed from the first parent and
changes. Parent IDs are retained for graph edges.

The bundled response contains only the selected branch. The frontend also
accepts compatible service responses with additional branch and graph metadata.
Services missing required boundary/merge snapshots trigger browser fallback.
The bundled analyzer emits progress records, but the current frontend waits for
the response before parsing it; it does not display a live progress stream.

## Operating limits

The service creates a shallow, single-branch clone with blob filtering and no
checkout. It reads commit metadata, name-status deltas, and boundary/merge trees,
then removes its temporary directory in a `finally` block after success or failure.

Commit count is bounded. Request-body size, concurrent jobs, execution time, and
total clone size are not independently limited. The service has no authentication
and allows cross-origin requests. Keep the bundled server on loopback; deploying
a shared endpoint requires additional access control and resource limits.

A service error or incompatible response causes the app to retry through the
GitHub API, capped at 20 commits, and show a warning. This fallback can still fail
if GitHub access or rate limits prevent the request.

## Verification

```sh
npm run analyzer:self-test
npm run test
```

The self-test checks URL/ref parsing, commit limits, and log parsing. The test
suite also creates disposable Git repositories to verify metadata and filenames.
