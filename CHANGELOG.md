# Changelog — @sentinel-nvr/web

Every published version has a git tag `v<version>` (v0.6.0–v0.9.0 were tagged afterwards; their `dist` was
rebuilt from the tagged commit and is byte-identical to the npm tarball). Server features some versions rely on
are listed in the README compatibility table.

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
