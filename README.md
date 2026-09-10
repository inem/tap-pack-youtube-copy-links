# YouTube Copy Links pack for TAP

An independently released example pack for
[TAP Core](https://github.com/inem/tap-core). It adds a **Copy** action to
YouTube cards, watch pages and Shorts and writes a `https://youtu.be/<id>` URL
to the clipboard with visible toast/button feedback. The installed live evidence
currently covers the watch-page path only; cards and Shorts remain fixture/source
expectations.

The repository is intentionally both a pack and a page-resource provider:

- `tap-resource.json` publishes `youtube.ui@0.1.0` under
  `tap.page-resource/v1`;
- `pack.json` freezes that provider plus the feature resource and declares an
  ordered `uses` list;
- TAP installs the verified bytes into its profile-local shared resource store;
- when several enabled packs use the same ID, version and hash, TAP injects it
  once per document. Version or byte conflicts fail before page code runs.

GitHub distributes source and release artifacts; the browser runtime never
fetches GitHub, npm or a CDN. The `.tap-pack` is self-contained so install and
rollback continue to work offline.

## Files

| File | Role |
| --- | --- |
| `youtube-ui.js` | Reusable DOM adapter exposed as `window.YouTubeUI` |
| `copy-links.js` | Copy-links feature bootstrap |
| `tap-resource.json` | Standalone `youtube.ui` provider declaration |
| `pack.json` | Pack identity, access requests, frozen resources and ordered uses |
| `PROVENANCE.md` | Source hashes, attribution and license review |
| `tools/check_seams.py` | Offline bridge/injection seam check |
| `tools/check_live.py` | Fresh-profile public YouTube check |

## Subtitles (unreleased)

Copy already requests the preferred caption track in the YouTube page. It now
reports `fetched` after a nonempty successful HTTP response; that alone does not
claim that TAP saved the response. The independent clipboard action still works
when captions are missing, fetching fails, or WS is unavailable.

Three independently enabled artifacts live in this repository:

| Artifact | Role | Needs Hub? |
| --- | --- | --- |
| `example.youtube-copy-links@0.2.0` | Existing page UI and caption request, plus optional confirmation | No for page behavior |
| `youtube.subtitles@0.1.1` | Reader writes retained player/details and timedtext bodies | No for reader-only profile |
| `youtube.subtitle-status@0.1.0` | Read-only handler confirms matching videoId + text hash | Yes |

The confirmation helper only uses an already connected `TapBridge`; it never
creates a socket. With no connection, missing handler, or disconnect, the page
shows “Subtitles fetched · local confirmation unavailable”. An available handler
is queried at most eight times to allow the reader to catch up. Only matching
saved content produces “Subtitles saved locally”; an old different body is not
success. Read-only checks may be retried; caption requests and other effects are
not automatically replayed after a WS error.

**Current Core limitation:** managed `components` together with
`bridge.enabled=true` currently starts/requires Hub even without handlers.
Thus the independent reader has a proven hubless path, while a single managed
profile combining page injection and reader still requires Hub today. Decoupling
page injection from WS enablement belongs to [Core #10](https://github.com/inem/tap-core/issues/10).
Do not interpret the reader-only test as evidence that this combined profile
already works without Hub/Bun. Adding/removing reader or handler packs still
requires stopping that profile; classic-script updates require page reload.

Output is private to the selected profile:
`data/readers/youtube.subtitles/<videoId>/details.json` and `subtitles.json`.
The latter is a `youtube.subtitles/v1` snapshot containing `videoId`, `lang`,
`fmt`, exact retained **text** in `raw`, and its UTF-8 SHA-256. Each new retained
track replaces that video's latest subtitle snapshot; this slice does not keep
all languages/versions or export Markdown. Streamed/omitted/empty/oversize bodies
leave the previous snapshot intact. Replay safely overwrites the same files.
The status pack reads this explicit same-profile reader output by convention;

Version 0.1.1 declares that output directory as a generic folder feature so TAP
presentations can show and reveal it without understanding subtitle semantics.
this is a trusted local pack relationship, not filesystem sandboxing. Its reply
contains neither transcript text nor file paths.

Build the three artifacts using current TAP Core on `PYTHONPATH`:

```sh
python3 -B -m tap_core.pack_store build . --output /tmp/copy-0.2.0.tap-pack
python3 -B -m tap_core.pack_store build packs/subtitles --output /tmp/subtitles-0.1.1.tap-pack
python3 -B -m tap_core.pack_store build packs/subtitle-status --output /tmp/subtitle-status-0.1.0.tap-pack
```

Install them with `tap --profile … pack install <artifact>`. Enable Copy with
`page.inject`, reader with `capture.read`, and optionally status with
`bridge.handle`; each declares exactly `https://www.youtube.com` and
`https://youtube.com`. A managed reader profile needs its explicit Python runtime;
a handler profile additionally needs the Core-managed Bun runtime and enabled
bridge. No manual session credentials are needed by these packs.

Validation (Core on `PYTHONPATH`):

```sh
python3 -B -m unittest discover -s tests
bun tests/caption-status.mjs
python3 -B tools/check_seams.py
python3 -B tools/check_subtitles.py --bun /absolute/path/to/bun --output /tmp/subtitles.json
node tests/caption-browser.cjs /absolute/path/to/playwright /absolute/path/to/Chrome
```

[Installed fixture evidence](evidence/subtitles-installed-fixture.json) covers
real reader subprocess/checkpoint and real local Hub/WS using synthetic capture
input. [Browser fixture evidence](evidence/subtitles-browser-fixture.json)
covers the real Chrome page scripts with synthetic DOM, HTTP and receipt replies.
Neither proves public YouTube caption delivery; the earlier live Copy report below
is for 0.1.0 and does not certify this subtitle slice. The missing public/live
caption check remains recorded in this repository's #1.

## Install the prerelease

Download the self-contained `.tap-pack` and checksum from
[v0.1.0](https://github.com/inem/tap-pack-youtube-copy-links/releases/tag/v0.1.0),
then, with the TAP profile stopped:

```sh
./tap --profile /absolute/profile pack install \
  /path/to/example.youtube-copy-links-0.1.0.tap-pack
./tap --profile /absolute/profile pack enable example.youtube-copy-links \
  --version 0.1.1 \
  --grant-origin https://www.youtube.com \
  --grant-origin https://youtube.com \
  --grant-capability page.inject
./tap --profile /absolute/profile on
```

The profile's base bridge must be enabled. It does not need source-checkout
paths or the pack origins: the installed pack contributes both to the effective
startup plan.

## Validate from source

Use a TAP Core checkout that contains `tap.page-resource/v1`:

```sh
PYTHONPATH=/absolute/path/to/tap-core \
  python3 -B -m tap_core.page_resources .
PYTHONPATH=/absolute/path/to/tap-core \
  python3 -B -m tap_core.packs .
PYTHONPATH=/absolute/path/to/tap-core \
  python3 -B tools/check_seams.py
```

Builds are deterministic:

```sh
PYTHONPATH=/absolute/path/to/tap-core \
  python3 -B -m tap_core.pack_store build . \
  --output /tmp/example.youtube-copy-links-0.1.0.tap-pack
```

## Evidence and limits

The [installed-artifact live report](evidence/youtube-installed-live-2026-09-07.json)
records Chrome 152 loading immutable profile paths on public YouTube and the Copy
action producing the expected short URL. That run ignored browser certificate
errors and encountered no source nonce, so it does not establish system CA trust
or live nonce reuse. The scripts preserve CSP and the fixture covers nonce reuse.

The Copy path supplies SVG DOM nodes to `youtube-ui.js`, so it does not execute
the library's generic string-icon `innerHTML` branches. Those branches remain
untested under YouTube Trusted Types and require separate evidence or a provider
revision before another pack should rely on them.

All injected scripts share the authority of the YouTube document. This contract
provides deterministic composition and integrity, not a JavaScript sandbox.

## License

MIT. See [PROVENANCE.md](PROVENANCE.md) for the migrated source review.
