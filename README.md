# sentinel-nvr-web

Shared browser code for the Sentinel NVR plugin for Scrypted (a private repository, `Muggedadscher/sentinel-nvr`;
its HTTP/WebSocket API is described in that repository's `docs/API.md`). Two consumers use these packages so their camera UI stays
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
on older servers, but only get their full behaviour with the matching plugin version (plugin tags `v<version>`;
1.1.0 = 2026-09-26, 1.2.0 = 2026-09-28, 1.3.0 = 2026-10-03):

| Package | Needs plugin | Relay feature |
|---|---|---|
| 0.7.x | ≥ 1.1.0 | scrub by target: `api/relay-target` (server-side servo stops at the timeline centre), `relay-pos` returns `{t, r}` |
| 0.8.x | ≥ 1.1.0 | jumps with a still picture: `relay-seek&mark=1&avoid=W` answers `{w}`; the still is lifted on the first frame of that width (older servers: timer) |
| 0.9.x | ≥ 1.1.0 | speed buttons in place: `api/relay-speed` (older servers: a seek to the displayed position); stills fade out two frames after the video runs |
| 0.10.x | any | calendar days instead of ±24 h (DST days are 23/25 h: no duplicate clips/events on 25.10., "next day" works, time picker and axis on the wall clock), `SentinelSetup.prefix` / `sentinelPublicBase(origin, prefix)` / `exchangeSentinelToken(…, prefix)` for a reverse-proxy path prefix. No server change needed. |
| 0.11.x | any (storage warning: ≥ 1.1.0) | robustness: the chosen speed survives a new relay session (pause/play, tab switch, recovery), control/seek/poll requests time out, answers of a finished session are ignored, a camera switch stops the old stream at once, forced TURN relay only for 10 min, live watchdog (frozen WebRTC → restart → fallback, WebRTC retried out of a fallback with back-off), MJPEG retry, telemetry rate limit, keyboard shortcuts leave modifiers/buttons alone, fallback transport shown, second deep link to the same camera works, storage-unavailable warning in the hero (`stats.storageOk`). `sideEffects` keeps the CSS, NOTICE.md shipped, react/lucide-react optional peers. |
| 0.12.x | any | +15 s at the recording edge goes live; 0.12.1: `open` telemetry per camera opening. |
| 0.13.x | any (smaller pictures: ≥ 1.2.0; older plugins ignore `w=` and send full-size snapshots) | opening a camera: the tile's loaded picture is the poster at once (tiles load with `crossOrigin="anonymous"`, `rememberTileSnapshot` exported for host cards), live starts without waiting for the day loads (a failed load no longer blocks it), tiles ask for `api/snapshot&w=640/960`, the fresh poster for 1280. 0.13.1: an MJPEG fallback taken before the codec was known switches to MSE-live once the day loads bring it — client only. |
| 0.14.x | any | Picture-in-Picture note + "Open in Safari" in iPhone/iPad Home-Screen apps (Apple blocks PiP there); `PlayerController.pip()` resolves its outcome. Client only. |
| 0.15.x | any (priority order from the server: ≥ 1.3.0; older servers are sorted client-side) | event classes by priority (a cyclist is a person), class filters hide an event only when all its classes are off, chips count every contained class — client only. |
| 0.16.x | any (spans: ≥ 1.3.0) | events as time spans: bar from first sighting to last movement on the timeline, running events pulse, duration/„running“ in the list (`endTs`/`open`); older servers show plain markers. 0.16.5: storage values in the UI language, today refresh during playback — client only. 0.16.7: overlapping timeline markers grouped with a count, a tap zooms in — client only. 0.16.8: the events tab counts the centred day — client only. 0.16.9: "yesterday" in front of the time in the overview events strip — client only. 0.16.10: "recording stalled" on tiles and in the status pill (`stalled` from plugin ≥ 2026-10-05; older servers: no change). 0.16.11: `header`/`externalUrl` may take the playback position — client only. |
| 0.17.x | plugin with `features: ["export"]` (older plugins: no clip button, everything else as 0.16.x) | clip download on the camera page: "Download clip" in the info bar and per event in the list, range as a band on the timeline, edges set over the playhead line, `api/export` → `api/export-status` → `api/export-file` (save, or share up to 100 MB); `SentinelClient.startExport/exportStatus/exportFileUrl/cancelExport`, `SentinelHttpError.code`. |
| 0.18.x | any | opt-in immersive camera page: `CameraPage appearance="immersive"` (`data-nvr-appearance` on the page) — picture edge to edge with the header over it on phones, floating controls, tabs as a segment, styled by the host through `--nvr-ctl-*`, `--nvr-float-*`, `--nvr-seg-*`, `--nvr-live-*`, `--nvr-shade-top`/`-bottom`, `--nvr-ease`/`--nvr-dur`; `header(at, { live })`, `CameraTitle` `live`/`at` (LIVE badge or the picture's time). Without the prop the page is unchanged. Client only. |
| 0.19.x | any (clip download: as 0.17.x) | immersive clip mode: the clip bar as a floating card with the edges as a segment (`ClipBar` `immersive`), the picture edge to edge on phones; the clip bar's close button never wraps (both appearances); optional `icon` in front of the `EventsStrip` / `CameraGrid` titles. Client only. |

Lab note: Scrypted's WebRTC sink re-encodes (1280 px, 15 fps) for clients that are not Windows/macOS/iOS and report a
screen below 1920 physical pixels, unless the source declares a width ≤ 1280. Plugin ≥ 1.2.0 declares it for recorded
playback, so the sink passes it through; for lab measurements still emulate `screenWidth/screenHeight` (headless
Chromium reports 800×600).

The server keeps its own types; `docs/API.md` in the plugin repository is the contract both sides follow.

## Design contracts (for `ui`)

- **Theming:** components read only `--*` CSS custom properties (HAPulse token
  names). `applyTheme(identity, mode, accentHue)` sets them on `<html>`; hosts that
  already define the tokens (HAPulse) skip it. Fonts and radii are static host tokens.
- **i18n:** components take a `t(key, vars)` + `locale` via `SentinelUiProvider`. `ui`
  ships the `nvr.*` dictionaries (`@sentinel-nvr/web/ui/locales/<code>.json`); hosts merge them.
- **Camera page:** hosts render `<CameraPage …/>` with `header` (their page header, e.g.
  `<CameraTitle/>` + actions) and `renderDatePicker` (their modal around `useDatePicker`).
  Everything visible inside comes from the package, so both consumers look identical.
  Optional `externalUrl` = this camera outside the app (Sentinel's public entry, no token): offered as "Open in
  Safari" when an iPhone/iPad Home-Screen app refuses Picture-in-Picture.
- **Immersive camera page** (0.18.0, opt-in): `appearance="immersive"` puts `data-nvr-appearance="immersive"` on
  `.nvr-cam`; every rule for it is scoped to that attribute, so the default page stays as it is. Below 900 px the page
  owns the screen: the host hides its own bars and gives the page the viewport (`.nvr-cam__body` is `100dvh`, at least
  27rem; on a short screen the picture yields first). The picture runs edge to edge and the header row (`CameraTitle`:
  back, name + badge, host actions) lies over it with a gradient — give icon actions the class `nvr-iconbtn` to get
  the same round button as back. The controls float as capsules, the tabs are a segment with a sliding lens
  (`.nvr-tabs[data-active]`, only on this page), the timeline reaches the bottom edge (safe areas kept). From 900 px
  the header stays above the columns, the picture has no card frame. The timeline keeps its geometry. Meant for dark
  tokens: the host scopes its theme dark on the page (the package re-derives its own `--nvr-*` colours there). Hooks,
  all optional (fallback = the default look): over the picture `--nvr-ctl-bg`, `-filter`, `-rim` (1-px edge, may be a
  gradient), `-shadow`, `-fg`, `-text-shadow`; over the timeline (date chip, zoom) `--nvr-float-bg`, `-filter`,
  `-rim`, `-shadow`, `-fg`, `-accent` (the chip's text while a recording plays); segment `--nvr-seg-track`, `-lens`,
  `-shadow`; LIVE badge, live jump and the live line's label `--nvr-live-bg`, `-fg` (badge and live jump also
  `--nvr-live-shadow`); the gradients' dark end `--nvr-shade-top` (under the header, default black 70 %) and
  `--nvr-shade-bottom` (under the controls, default black 35 %; on devices with a hovering pointer it shows with the
  controls); the lens' motion `--nvr-ease`, `--nvr-dur` (with reduced motion the chosen tab's fill fades over in 200
  ms instead). The name and time in the header lie on the top gradient, which is dark in every theme: without
  `--nvr-ctl-fg` they are white. `header` as a function gets `(at, { live })`; pass both to `CameraTitle` (`live`, `at`) for the LIVE
  badge or the picture's time next to the name. Clip mode (0.19.0): the clip bar floats as a card with the
  `--nvr-float-*` hooks, its edges are a segment with the `--nvr-seg-*` hooks (`.nvr-clipbar__edges[data-edge]`).

## Develop

```bash
npm install
npm run typecheck
npm test
npm run build
```

Releases: bump `version` in `package.json`, add a `CHANGELOG.md` entry, merge, tag `v<version>` on `main` and push
the tag. The `release` workflow publishes from the tag via npm Trusted Publishing (no stored token; typecheck, lint,
format check, tests in three time zones, build, pack check, `npm publish --provenance`, registry tarball compared
with `dist`). A manual run with `dry` checks a tag without publishing. The maintainer's `snvrweb-publish.sh <version>`
remains the fallback; it needs an npm token, so with "disallow tokens" set in the package's npm settings tokens have to
be allowed again for that publish. `prepublishOnly` refuses any publish without the matching tag.

## License

MIT — see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
