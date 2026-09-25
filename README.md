# sentinel-nvr-web

Shared browser code for the [Sentinel NVR](https://github.com/Muggedadscher/sentinel-nvr)
plugin for Scrypted. Two consumers use these packages so their camera UI stays
identical and bugs are fixed once:

- the plugin's own web UI (`sentinel-nvr/ui`)
- the native Sentinel NVR integration in the [HAPulse](https://github.com/Muggedadscher/hapulse) dashboard

## Package

One npm package, **`@sentinel-nvr/web`**, with subpath entry points (one version, one bump in both consumers):

| Entry point | Status | Contents |
|---|---|---|
| `@sentinel-nvr/web/api` | **available** | DOM-free data model + types mirroring the plugin's `docs/API.md`, URL/setup parsing, event classification, storage forecast, timeline clip-run merge, locale formatters, and a `fetch`/WebSocket `SentinelClient`. No framework deps. |
| `@sentinel-nvr/web/player` | **available** | `PlayerController`, WebRTC signaling, the no-reneg recorded-playback relay client, watchdog and the live/recorded fallback chain. |
| `@sentinel-nvr/web/ui` | **available** | React components — the whole **camera page** (`CameraPage`: stage, control pill, info bar, tabs, class filters, vertical timeline, events list, date chip; `CameraTitle` header row), class badges, event strip, camera tiles, date picker, stat cards — the i18n dictionaries (`nvr.*`, 7 locales) and the theme system (4 identities × light/dark/auto + accent hue). Styles in `@sentinel-nvr/web/ui/ui.css` (HAPulse tokens). |

The earlier `@sentinel-nvr/api@0.1.0` is deprecated in favour of `@sentinel-nvr/web/api`.

### Server compatibility (recorded playback)

The player talks to the plugin's relay endpoints (`docs/API.md` in `sentinel-nvr`). Newer packages degrade gracefully
on older servers, but only get their full behaviour with the matching plugin:

| Package | Needs plugin from | Relay feature |
|---|---|---|
| 0.7.x | 2026-09-23 | scrub by target: `api/relay-target` (server-side servo stops at the timeline centre), `relay-pos` returns `{t, r}` |
| 0.8.x | 2026-09-24 | jumps with a still picture: `relay-seek&mark=1&avoid=W` answers `{w}`; the still is lifted on the first frame of that width (older servers: timer) |
| 0.9.x | 2026-09-25 | speed buttons in place: `api/relay-speed` (older servers: a seek to the displayed position); stills fade out two frames after the video runs |

Lab note: headless Chromium reports an 800×600 screen unless `screenWidth/screenHeight` are emulated; the Scrypted
sink then transcodes every stream to 800 px / 15 fps, which distorts latency and resolution measurements.

The plugin's server code (`sentinel-nvr/src`) also imports `@sentinel-nvr/api`
for its API types, so server and both clients share one contract.

## Design contracts (for `ui`)

- **Theming:** components read only `--*` CSS custom properties (HAPulse token
  names). `applyTheme(identity, mode, accentHue)` sets them on `<html>`; hosts that
  already define the tokens (HAPulse) skip it. Fonts and radii are static host tokens.
- **i18n:** components take a `t(key, vars)` + `locale` via `SentinelUiProvider`. `ui`
  ships the `nvr.*` dictionaries (`@sentinel-nvr/web/ui/locales/<code>.json`); hosts merge them.
- **Camera page:** hosts render `<CameraPage …/>` with `header` (their page header, e.g.
  `<CameraTitle/>` + actions) and `renderDatePicker` (their modal around `useDatePicker`).
  Everything visible inside comes from the package, so both consumers look identical.

## Develop

```bash
npm install
npm run typecheck
npm test
npm run build
```

Releases use [Changesets](https://github.com/changesets/changesets):
`npx changeset` to record a change, then the release workflow publishes to npm.

## License

MIT — see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
