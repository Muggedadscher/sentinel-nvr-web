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
| `@sentinel-nvr/web/player` | planned | `PlayerController`, WebRTC signaling, the no-reneg recorded-playback relay client, watchdog and the live/recorded fallback chain. |
| `@sentinel-nvr/web/ui` | planned | React components (vertical timeline, class badges, event list/strip, camera tiles, date picker, stat cards), the i18n dictionaries (`nvr.*`, 7 locales) and a themeable CSS foundation (HAPulse tokens × 4 identities). |

The package is published once `player` and `ui` are in. Until then, the earlier
`@sentinel-nvr/api@0.1.0` (same code as `/api`) stays on npm as a transitional release.

The plugin's server code (`sentinel-nvr/src`) also imports `@sentinel-nvr/api`
for its API types, so server and both clients share one contract.

## Design contracts (for `ui`)

- **Theming:** components read only `--*` CSS custom properties (HAPulse token
  names). Each host maps its own tokens; `ui` ships a `foundation.css` with the
  four HAPulse identities × light/dark for hosts (like the Sentinel UI) that do
  not already define them.
- **i18n:** components take a `t(key, vars)` + `locale` via a provider. `ui` ships
  the `nvr.*` dictionaries; hosts merge them.

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
