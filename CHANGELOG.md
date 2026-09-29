# Changelog — @sentinel-nvr/web

Every published version has a git tag `v<version>` (v0.6.0–v0.9.0 were tagged afterwards; their `dist` was
rebuilt from the tagged commit and is byte-identical to the npm tarball). Server features some versions rely on
are listed in the README compatibility table.

## 0.16.0 — 2026-09-29

- Events as time spans (plugin ≥ 1.3.0): the vertical timeline draws a thin bar in the class colour from an event's
  first sighting to the last movement of its objects; a running event (`open`) reaches up to now and pulses (still
  with `prefers-reduced-motion`). The event list shows the duration („· 0:42“) or „· läuft“. New model fields
  `endTs`/`open` (`SentinelEvent`, `SentinelRecentEvent`), `boxes[].ts`; helpers `sentinelEventSpan`,
  `sentinelDuration`. Key `nvr.events.running` in all 7 locales. Older servers: no spans, nothing else changes.

## 0.15.0 — 2026-09-29

- Event classes by priority: `sentinelClassOf` returns the most important class (person > animal > bike > car >
  package) instead of the first one, `sentinelClassesOf` sorts by it (new export `SENTINEL_CLASS_PRIORITY`). A cyclist
  (car + person) is a person in markers, colours and the list — also with older servers that send classes
  alphabetically.
- Class filters hide an event only when ALL of its classes are off (`sentinelEventHidden`); the chips count every
  event that contains their class (a cyclist counts for person and vehicle). Before, „vehicle off“ also hid cyclists
  and the person chip missed them.

## 0.14.0 — 2026-09-28

- Picture-in-Picture in iPhone/iPad Home-Screen apps: Apple disables PiP there (the video rejects with
  NotSupportedError, `webkitSupportsPresentationMode('picture-in-picture')` is false — seen in the `pip-fail` telemetry
  of HAPulse's home-screen app on iOS 18.7; Safari itself allows it). The PiP button no longer fails silently: the
  camera page shows a short note under the stage and, when the host passes `externalUrl` (new optional `CameraPage`
  prop: this camera outside the app, e.g. Sentinel's public entry without a token), an "Open in Safari" link —
  `x-safari-https://…` on iOS 17+ so it opens Safari itself instead of iOS's in-app browser sheet. Browsers without
  any PiP get a plain note. Telemetry `pip-outside` on that link.
- `PlayerController.pip()` resolves `PipResult` (`entered` | `exited` | `unsupported` | `failed`); the request still
  runs inside the click. New exports `isIosHomeScreenApp`, `outsideAppHref` (`/ui`). Keys `nvr.player.pipHomeScreen`,
  `pipUnsupported`, `openInSafari`, `dismiss` in all 7 locales.

### Docs (unreleased before)

- Docs: the README's server-compatibility table names plugin versions (≥ 1.1.0 / ≥ 1.2.0) instead of dates, the lab
  note describes the real cause of the sink re-encode, a wrong claim (the plugin importing `@sentinel-nvr/api`) is gone,
  and the link to the private plugin repository is marked as such.
- Examples and tests use a documentation address (192.0.2.10) instead of a LAN address; `.npmrc`/`.env*` ignored.

## 0.13.1 — 2026-09-27

- Live fallback before the day loads: since 0.13.0 live starts before `api/clips` brings the codec, so a WebRTC failure
  at once (WebSocket error, no `RTCPeerConnection`) went to MJPEG and stayed there until the 2-min WebRTC retry. Now
  the codec's arrival (`setClips`) switches such an MJPEG fallback to MSE-live (telemetry `live-mse-late`); only when
  the codec was the reason — a failed MSE is not retried this way. Lab probe `live-fallback-test.js` (Sentinel repo).

## 0.13.0 — 2026-09-27

Opening a camera shows a picture at once and goes live sooner (user 27.09., iPhone/HAPulse: grey stage; measured with
the 0.12.1 `open` telemetry: grey 374–479 ms although the tile picture was "cached", first frame 1.4–1.6 s).

- The tile snapshot cache keeps the loaded `<img>` itself, not its URL: the poster is drawn synchronously. The URL path
  meant a new full-size download (api/snapshot is `no-store`, and the poster's CORS mode differed from the tile's).
  Tiles load with `crossOrigin="anonymous"` (untainted freeze canvas); `rememberTileSnapshot` is exported for host
  cards (e.g. HAPulse's home card). `posterSrc` in the telemetry: `tile` / `url` / `net`.
- Live starts right away instead of after the day loads (`api/clips`); a failed load no longer keeps live from starting.
- Smaller pictures: tiles ask for `api/snapshot&w=640` (960 at devicePixelRatio ≥ 2), the fresh poster for 1280 —
  `SentinelClient.snapshotUrl(id, bust, width)`. Plugins before 2026-09-27 ignore `w`.

## 0.12.1 — 2026-09-27

- Telemetry `open`: one line per camera opening with the ms from opening to each milestone — `poster` (+ `posterSrc`
  tile/net), `clips`/`clipsErr`, `live`/`relay`, `ws`, `sdp`, `ice`, `track`, `frame` (first presented frame) — plus
  `end` (frame/leave/switch/timeout after 30 s), `via` and `mobile`. `PlayerController.openMark()` for hosts,
  `lastOpen` for lab probes. `WebRtcSession` reports the milestones through the optional `onPhase` callback.
  Groundwork for the grey-stage complaint (opening a camera takes long until the first picture).

## 0.12.0 — 2026-09-26

- +15 s (and →) from a recording that would land closer than 20 s to "now" — where no recording exists yet — goes
  live instead of fizzling out (it advanced ~2 s). New DOM-free helper `skipTarget` / `SKIP_LIVE_EDGE_MS`
  (`/player`), unit-tested.
- Lint: no warnings (stable `mergedNow` in the deps, trigger-only timeline effects documented).
- Dev tooling: vitest 5, vite 8 (tests only), `@types/node` 22, lucide-react 1.x as dev dependency (the peer range
  `>=0.400.0` already allows 1.x). Built `dist` of the tooling update was byte-identical.

## 0.11.0 — 2026-09-26

Player robustness.

- Speed survives a new relay session (pause/play, tab switch, recovery): the session starts at 1× and the chosen
  rate is sent once the session id is known.
- Timeouts: control requests 8 s, `relay-seek` 10 s, `relay-pos` 3 s with one poll in flight.
- Answers of a finished relay session no longer touch or recover the current one.
- Camera switch stops the old stream at once.
- Forced TURN relay after a connect timeout only for 10 minutes.
- Live watchdog on presented frames (frozen WebRTC → restart, then fallback); restart counter resets after 30 s of
  frames; WebRTC retried out of MSE/MJPEG with back-off 2/5/15 min; MJPEG retries on error.
- Telemetry rate limit: 20 lines/min per page, the same tag at most every 5 s, drops reported.
- Keyboard shortcuts ignore modifiers, editable content and SPACE on focused buttons/links; the MSE/native fallback
  is shown; a second deep link to the same camera moves playback; failed day loads are shown.
- `destroy()` also ends the MJPEG stream and the still timer; timeline listeners registered once.
- Hero: storage-unavailable warning (`stats.storageOk`, plugin storage guard).
- Package: `sideEffects` keeps CSS, `NOTICE.md` shipped, `react`/`lucide-react` optional peers.

## 0.10.0 — 2026-09-26

Daylight saving time.

- Calendar-day arithmetic (`sentinelAddDays`, `sentinelDayEnd`, `sentinelAtTime`) instead of ±24 h: no duplicate
  days, shifted requests or midnight lines on 29.03./25.10.
- Timeline axis labels and ruler ticks on local wall-clock positions (`sentinelWallMarks`, `sentinelWallSeconds`).
- `sentinelMergeDays` deduplicates clips/events/motion delivered with two days.
- Reverse-proxy path prefix: `SentinelSetup.prefix`, `sentinelPublicBase(origin, prefix)`,
  `exchangeSentinelToken(…, prefix)` (additive).
- Tests run in UTC, Europe/Berlin and America/New_York (`npm run test:tz`).

## 0.9.0 — 2026-09-25

- Speed buttons change the rate in place (`api/relay-speed`) instead of a seek.
- Stills are lifted two frames after the video runs, with a short fade (grey flash on iOS).

## 0.8.0 — 2026-09-24

- Stills stay until the new picture is really shown: jumps use marker widths reported by the server, no timers,
  no black stills.

## 0.7.0 — 2026-09-23

- Scrub by target: the client sends the timeline centre (`api/relay-target`), the server's feeder steers onto it.

## 0.6.2 — 2026-09-23

- Landing seek 3 s after the gesture (a new scroll cancels it); the tile snapshot is the poster when a camera opens.

## 0.6.1 — 2026-09-23

- No seek per wheel step: hold = rate 1 in place, landing after 1.5 s quiet; the timeline holds still while settling.

## 0.6.0 — 2026-09-23

- Seek-swap poster timing (measured 2.6 s), scrub profile without restart storms, deep-link race fix.

## 0.5.x — 2026-09-22/23

- 0.5.0: `exchangeSentinelToken` (Scrypted account → access token) and sign-in strings.
- 0.5.1–0.5.5: stage card sized to the picture, columns centred, no rules or hairlines around the picture.

## 0.4.0 — 2026-09-22

- Shared `AppearanceSection` (theme cards, light/dark/auto, language, accent hue).

## 0.3.x — 2026-09-22

- 0.3.0: the whole camera page as one shared component (`CameraPage`, `CameraTitle`).
- 0.3.1: republished with the locales directory intact.

## 0.2.x — 2026-09-18

- 0.2.0: `/ui` — shared React components, i18n dictionaries, themes.
- 0.2.1/0.2.2: timeline ruler fixes (runs to the top edge, guard against `px = 0`).

## 0.1.x — 2026-09-17/18

- One package with subpath exports `/api` and `/player` (`PlayerController`, WebRTC session, telemetry); client
  base override for proxy/login paths; shared playback fixes.
