# Changelog — @sentinel-nvr/web

Every published version has a git tag `v<version>` (v0.6.0–v0.9.0 were tagged afterwards; their `dist` was
rebuilt from the tagged commit and is byte-identical to the npm tarball). Server features some versions rely on
are listed in the README compatibility table.

## 0.16.10 — 2026-10-05

- Recording that hangs is shown: a camera tile says "Recording stalled" (badge top left, recording dot grey) and the
  status pill counts it ("1 recording stalled", next to "N cameras offline" when both happen). Until now such a
  camera looked healthy — the plugin only reported whether its ffmpeg was running, not whether it still wrote
  segments. The plugin's new recording watchdog (server ≥ 2026-10-05) restarts an ffmpeg that wrote no segment for
  3 minutes and sends `stalled: true` in `api/cameras` until a segment arrives again; it outranks `online: false`
  during that restart, so the tile does not flicker to "Offline". A hanging camera counts as online in the hero
  (its own count is the pill). New `sentinelRecordingState(cam)` (`off`/`stalled`/`offline`/`ok`) in `/api` for host
  cards; texts `nvr.hero.stalled`, `nvr.cameras.stalled`, `nvr.cameras.stalledHint` in all 7 languages. Older
  servers send no `stalled`: nothing changes there. Tests in `test/ui/camera-status.test.tsx`.

## 0.16.8 — 2026-10-04

- Camera page: the number in the "Events (N)" tab counts only the day centred in the timeline (the date chip's day).
  It used to count every loaded day — on opening today and yesterday, more after scrolling back — so it was larger
  than the overview tile's "N today" for the same camera. On today the two now agree (same local midnight; the tile
  counts with the class filter all on). The number changes while scrolling across midnight, and the list below still
  shows every loaded day, so it can hold more entries than the number. The class filter applies to the number as
  before. `eventsOnDay(events, day)` in `ui/camera-logic.ts`; tests in `test/ui/camerapage.test.ts` and
  `test/ui/camerapage-daycount.test.tsx`.

## 0.16.7 — 2026-10-04

- Camera-page timeline: event markers closer than 14 px (at the start scale of 2 h per screen about three minutes) lay
  on top of each other — the stack showed one marker and a tap opened the OLDEST event (drawn last), while the
  thumbnail beside it opened the newest. They now form one marker with the count, coloured by the most important class
  of the group (`ui/timeline-groups.ts`). A tap on it zooms in until the group fills half the timeline and puts the
  group's middle on the playhead line; the video jumps there like after an event click (still picture until the new
  picture), no event opens. If the middle falls into a recording gap, the newest event of the group is the target. At
  the finest scale (events a few seconds apart) the tap opens the newest event, like the thumbnail. Single markers,
  thumbnails and event spans behave as before. New optional `TimelineProps.onSeekTo(ts)` (CameraPage passes it;
  without it the tap lands like a scroll release). Tests in `test/ui/timeline-groups.test.tsx`.

## 0.16.6 — 2026-10-04

- No behaviour change. The player's playback rules are split out of `PlayerController` into small, tested pure
  functions: still-picture rules (`player/stills.ts`: `SWAP_MS`, `MARK_CAP_MS`, `LIFT_FRAMES`, `STILL_CAP_MS`, marker
  frame, how a seek answer lifts the still, the width to avoid) and relay state (`player/relaystate.ts`: which
  `relay-pos` answers count — only the current command generation, pre-swap positions ignored for 2.5 s — three dead
  polls, two recoveries before the MSE fallback). The controller calls them unchanged; the public API is the same.
  Tests in `test/ui/player-relay.test.ts`.

## 0.16.5 — 2026-10-03

- Storage values with the decimal separator of the UI language: the status page's storage card (hero tile, legend,
  rate, capacity) showed "7.7 GB" in every language. `sentinelHumanBytes(b, locale?)` and `humanBytes(b, locale?)`
  take the locale; the components pass the host's `locale`, so German reads "7,7 GB" and English "7.7 GB". Without a
  locale the output stays as before (decimal point).
- The camera page refreshes today's clips, events and motion every 15 s also during playback and pause, not only live:
  new events appear in the timeline and the list, a running event grows, the recording band extends. The refresh waits
  while a timeline gesture runs or settles on its target, and skips a hidden tab. The player only gets the new clip list
  (no seek, no restart).
- `setClips` keeps the clip being played (native) and the next clip to feed (MSE) when the list changes underneath —
  clips added in front when an older day loads, the oldest dropped by retention (`carryClipIndex`). A plain index used
  to point at a different clip afterwards.
- README: plugin 1.3.0 (2026-10-03) in the compatibility dates.

## 0.16.4 — 2026-10-02

- Camera page on small phone viewports: below 900 px the body is a flex column, but it kept the desktop grid's
  `justify-content: center`. When picture and timeline were taller than the body (a 4:3 camera in the iPhone's in-app
  Safari, ~667 px viewport), the overflow was centred, so the picture slid ~13 px up under the title row. The column now
  starts at the top, and the timeline takes what the picture leaves (`min-height` 0 instead of 220 px), so it ends
  above the tab bar instead of running under it.

## 0.16.3 — 2026-10-02

- LIVE label above the playhead: while live the timeline follows now, so the red LIVE label and the orange playhead
  line sit at the same height, and the line (z-index 3) ran through the label (2). The label now lies above the line;
  the date chip and the live-jump button still cover it when it scrolls under them.
- Camera page header row as tall as HAPulse's: `CameraTitle` without host actions was 36 px (the back button), HAPulse's
  row carries a 40-px action button (desktop) and the 44-px avatar (mobile), so the picture sat 4–8 px closer to the
  title in Sentinel than in HAPulse. `.nvr-cam__head` now has `min-height` 40 px / 44 px below 900 px.

## 0.16.2 — 2026-10-01

- Zoom without a jumping frame: the zoom buttons and ctrl+wheel changed the scale in one frame and the scroll position
  only in the next animation frame, so for one frame the content showed the new scale at the old position, and the
  follow tick in between logged a false `follow-jump` (iPhone 30.09.: −3599.6 s right after a zoom step). Scale and
  scroll position now reach the screen in the same commit.
- Zooming while the timeline is parked on a scrub target (or paused) zooms around the centre it shows; it used to zoom
  around the playhead and lose the parked position. Live and following zoom around now/the playhead as before.
- First release published by the `release` workflow (npm Trusted Publishing with provenance) instead of the host script.

## 0.16.1 — 2026-09-30

- Timeline stays where you scrolled until the picture is there: after a scrub gesture on the relay the timeline used to
  hand back to the playhead after a fixed 1.5 s — while the time-lapse was still on its way (the picture trails the
  server's servo by 1.3 s, and at 3000× a fling of hours takes seconds). It jumped to the picture's position and chased
  it in 600-ms steps (`follow-jump` telemetry, `sinceIdle` ≈ 1.5 s, up to 3.8 h). Leaving the scrub mode also dropped
  the server's target, so a far fling stopped short of it. Now the gesture keeps its target (scrub profile stays on)
  until the picture plays at normal speed near it: `relay-pos` within 5 s of the target, the server's rate `r` = 1 and
  ~1× between the last two polls. It gives up after 3 s without progress or 30 s (telemetry `settle` when parked longer
  than the base delay). New DOM-free helper `settleStart`/`settleStep` (`/player`). No server change.
- Scrub target 30 s off: the page moves the timeline's range end forward every 30 s and the timeline compensates its
  scroll position at once, but the hold/idle timers of a gesture computed the centre with the previous range end — when
  the tick fell into those 700 ms, the target (and the video) landed 30 s before the centre and the timeline then jumped
  there. The centre now always comes from the current geometry; the compensation runs before paint and re-renders at
  once (the centre label showed +30 s until the next tick).
- Leaving the scrub mode read the playhead after dropping its clamp to the target — for one poll it could be
  extrapolated with the last servo rate (up to 30 min off).
- The timeline mounted neither live nor following (px still 0) computed a NaN centre and threw in the date label.
- Day separator: the date chip sits right of the recording band (the band painted over it) and the line starts right
  of the time column, so its „00:00“ stays readable; the playhead stays on top of the chip, thumbnails too.

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
