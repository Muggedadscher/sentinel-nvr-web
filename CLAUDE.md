# CLAUDE.md — sentinel-nvr-web

Working notes for AI coding tools (Claude Code and others) and new contributors. This repository is **public**
(MIT): never write internal addresses, host names, container or machine names, credentials or where credentials are
kept into it — not here, not in code, tests, examples or commit messages. Examples use documentation addresses
(`192.0.2.x`, RFC 5737). Lab, deploy and server details live in the private plugin repository
(`Muggedadscher/sentinel-nvr`, its `CLAUDE.md`); link to it, don't copy from it. `.claude/` is git-ignored for local
notes.

## What this is

One npm package, **`@sentinel-nvr/web`**: the shared browser code of the Sentinel NVR plugin for Scrypted. Two
consumers render the same code, so their camera UI is identical by construction and a bug is fixed once:

- the plugin's own web UI (`sentinel-nvr`, folder `ui/`, a thin shell: routing, page header, date dialog)
- the native Sentinel integration in [HAPulse](https://github.com/Muggedadscher/hapulse) (`apps/dashboard/src/nvr/`)

**HAPulse leads the design, and both UIs stay 1:1.** A visible fix to the camera page, tiles, timeline or player
belongs in this package, not in one consumer. The theme tokens in `src/ui/themes-data.ts` are a verbatim copy of
upstream HAPulse `packages/core/src/themes.ts` (MIT, see `NOTICE.md`); keep them verbatim.

The server contract is the plugin's `docs/API.md`. The package keeps its own types mirroring it.

## Layout (`src/`)

| Entry point | Folder | Rules |
|---|---|---|
| `@sentinel-nvr/web/api` | `src/api/` | DOM-free, no framework: data model + types (`model.ts`), `SentinelClient` (`client.ts`, fetch/WebSocket), Intl formatters (`format.ts`, no dictionary words). |
| `@sentinel-nvr/web/player` | `src/player/` | Framework-free. `PlayerController` (`controller.ts`) owns the `<video>`, the freeze canvas and the MJPEG `<img>` and reports state; pure decisions are split into small tested modules (`stills.ts`, `relaystate.ts`, `settle.ts`, `skip.ts`, `clips.ts`). `rlog.ts` = client telemetry to the plugin. |
| `@sentinel-nvr/web/ui` | `src/ui/` | React components (`components/`, the whole `CameraPage`), i18n (`i18n.ts`, `locales/*.json`), themes (`theme.ts`, `themes-data.ts`), styles `ui.css`. DOM-free page logic in `camera-logic.ts`, `timeline-groups.ts`, `clip-logic.ts` (clip download). |

Tests mirror this in `test/api/` and `test/ui/` (vitest; jsdom where a test needs the DOM).

## Build and test

```bash
npm ci
npm run typecheck
npm run lint            # ESLint; errors fail, warnings are listed
npm run format:check    # Prettier (Markdown is excluded, see .prettierignore)
npm run test:tz         # vitest in UTC, Europe/Berlin and America/New_York
npm run build           # tsup → dist/, plus ui.css and locales
```

CI (`.github/workflows/ci.yml`) runs exactly these on every PR and on `main`. Run them all before pushing. Format-only
commits go into `.git-blame-ignore-revs`.

## Rules for code

- **Playback logic only in `PlayerController`.** React renders its state and calls its methods; no player decisions in
  components. Status labels are i18n key suffixes (`nvr.player.<label>`) that the host translates.
- **Frame counting:** stalls and "the video really runs" are measured with presented frames via
  `requestVideoFrameCallback`. Never rely on `getVideoPlaybackQuality().totalVideoFrames` for MediaStream
  (`srcObject`) elements — Safari leaves it at 0, which once made a watchdog tear down healthy sessions. With
  `srcObject`, `currentTime` advances without frames and `canplay`/`loadeddata` fire before the first picture.
- **Still pictures** stay until the new content's first presented frame (then a short fade); they are never painted
  from the video element again and never replaced by a thumbnail while visible.
- **Styling:** components read only `--*` CSS custom properties (HAPulse token names). No hex literals in components.
- **Texts:** every user-visible string is an `nvr.*` key in **all 7 locales** (`src/ui/locales/`; `test/ui/i18n.test.ts`
  fails otherwise). HAPulse translates the package keys with its own locale files, so new keys must be added there too
  when HAPulse takes the new version.
- **Numbers, dates, times:** through `Intl` with the UI locale (German shows a decimal comma, English a point). Days are
  calendar days in the viewer's time zone; DST days have 23/25 hours — that is why tests run in three time zones.
- **Older servers:** a new client feature must degrade gracefully when the plugin does not support it yet. Where the
  plugin announces a capability in `features` (e.g. `"export"` for the clip download, checked in `src/api/model.ts`),
  the client offers it only then. Note the needed plugin version or feature in the README's server-compatibility table.
- Telemetry (`rlog`) also logs success paths: phones have no console, and silence was ambiguous more than once.

## Changes and releases

- Branch → pull request → CI green → merge. No direct commits to `main`.
- Every user-visible change gets a `CHANGELOG.md` entry (English). Changes merged before a release go under
  `## Unreleased` at the top; the release turns that heading into `## <version> — <date>`.
- A release: bump `version` in `package.json` and `package-lock.json`, finalise the changelog heading, add the version
  to the README compatibility table, merge, then push the tag `v<version>` on the merge commit on `main`. The `release`
  workflow publishes from the tag via npm Trusted Publishing (no stored token, with provenance) and compares the
  registry tarball with `dist`. A manual run with `dry` checks a tag without publishing. A plain `npm publish` from a
  working copy is refused by `scripts/prepublish-check.mjs`.
- `files` ships only `dist` and `NOTICE.md`; docs and this file never reach npm, so doc-only changes need no release.
- After a release both consumers bump `@sentinel-nvr/web` (package.json and lock file). Their CI fails `npm ci` with
  "No matching version found" while a PR already needs a version that is not on npm yet — expected, not a bug.
- How an unpublished package is tried in the plugin's UI before a release, and the browser probes run there, is
  described in the private plugin repository.
