# route-planner

Takes an established route supplied as a GPX, adds researched detours (peaks, wild
swims, camps, points of interest), measures everything honestly, and produces a
browsable itinerary plus GPX exports for offline navigation — per day and for the
whole trip.

Built for the Lakeland Way, designed to be reused for other routes.

## Quick start

```bash
node scripts/build.mjs                # build routes/lakeland-way -> site/ + gpx-exports/
npm test                              # 33 output checks + headless run of the page
npx serve site                        # or: python3 -m http.server --directory .
```

The build calls external APIs and caches every response in `cache/`, which is
committed. A second build is offline and instant. Netlify only serves `site/` — it
never runs the build, so a deploy cannot fail on a third-party API.

## Deploying

**`site/` is the whole deployment.** 36 files, 6 MB raw / 0.8 MB gzipped. Nothing else
is served: not `routes/`, not `scripts/`, not `cache/`.

```bash
npm run build     # regenerates site/ — run this before deploying
npm test          # 54 output checks + page + features + exports
```

### Netlify Drop

```bash
npm run package
```

Builds, runs all four test suites, then writes `dist/<route-id>-<date>.zip`. **It
refuses to package if any check fails** — the point of the step is that what you drop
has been verified. Drop the zip at <https://app.netlify.com/drop>.

The archive holds the *contents* of `site/`, not the folder: Netlify Drop treats the
archive root as the site root, so zipping the folder itself would serve the page at
`/site/index.html` and every relative path would miss. The script asserts
`index.html` is at the archive root before it finishes.

Current output: 36 files, 6.04 MB on disk, **0.84 MB zipped**.

### Netlify CLI

Better than Drop for repeat deploys, because it goes to the **same site and URL** every
time. Drop creates a new site on each upload.

```bash
npx netlify-cli login          # once
npx netlify-cli link           # once, to bind this folder to the existing site
npm run deploy                 # build + test + deploy to production
npm run deploy:preview         # same, but a preview URL instead of production
```

`npm run deploy` runs the build and all four test suites first, so nothing unverified
reaches a URL. It sends `site/` directly — no zip needed.

There is also a true equivalent of Drop's anonymous upload, which needs no login and
gives you an hour to claim the site:

```bash
npm run deploy:anon            # netlify deploy --dir=site --allow-anonymous
```

Authentication for the non-anonymous commands comes from `netlify login` or a
`NETLIFY_AUTH_TOKEN` environment variable.

### Why the GitHub repository is not connected to Netlify

`git@github.com:bdfitzgerald/route-planner.git` is source history only. Deployment is
`npm run deploy`, on purpose:

- The build calls external APIs, so running it locally means a deploy can never fail
  because the DEM or routing service is down.
- `npm run deploy` runs the full test suite first. A push cannot.
- `site/config.js` carries the OS Maps key and is gitignored, so a git-triggered build
  would have no key and would fall back to OpenStreetMap tiles.

If you later want push-to-deploy: set `OS_MAPS_KEY` in the Netlify site environment,
add `command = "npm run build"` to `netlify.toml`, and connect the repository.

`site/` must be committed, since Netlify does not build. `npm run build` writes:
`route-data.json`, `resolve.js` (generated from `scripts/lib/resolve.mjs`), and
`gpx/<route-id>/*.gpx`.

The GPX files are written twice on purpose: `routes/<id>/gpx-exports/` is the
canonical per-route copy, and `site/gpx/<id>/` is the served copy. Everything the page
requests must sit inside the publish root — an earlier version linked to
`../routes/<id>/gpx-exports/`, which resolved above the site root and 404'd on Netlify
while working locally only because the dev server was rooted at the repo. `verify.mjs`
now asserts that every advertised GPX exists under `site/` and that no runtime path
contains `../`.

### Checking a deploy the way Netlify sees it

Serve the publish directory alone, not the repo root:

```bash
npx serve site          # or: python3 -m http.server --directory site
```

Serving the repo root will mask exactly the class of bug described above.

## Tidying up

```bash
npm run analyse
```

A read-only report — it finds things, it never changes them. Dependency-free, and
aimed at this project rather than generic lint noise:

- **Payload weight**, per file, raw and gzipped
- **What makes `route-data.json` big**, broken down by field. Currently geometry is
  88.7% of it, and out-and-back spurs alone are 67% — so the lever that matters is
  `DISPLAY_TOLERANCE_M` in `build.mjs`, not minifying anything
- **CSS** rules nothing references
- **Exports** nothing imports, split into genuinely dead code versus helpers that are
  only used inside their own module and could simply be private
- **Data quality**: points with no description, unroutable spurs, anything more than
  5 km off route, peaks with no height
- **Drift** between the canonical and served copies of the GPX exports

Two false positives it used to report, now fixed and worth knowing about if you extend
it: `#a8452a` in the CSS is a colour literal, not an id selector; and an exported
helper used inside its own module is not dead code.

## Local and production mode

`APP_MODE` decides where a saved preset goes, because the two situations are genuinely
different: locally there is a filesystem, on Netlify there is not, and there is no login
either way.

| Mode | Set by | A saved preset goes to | Lasts |
| --- | --- | --- | --- |
| `local` | `npm run dev` | `routes/<route-id>/presets.json`, via the dev server | permanently, and deploys |
| `production` | the default, and forced by `deploy`/`package` | the browser's `localStorage` | that browser only |

*Save preset…* only appears in local mode. On the deployed site a save would go to that
browser alone, which reads as making a preset when it does not — so instead each
browser-saved preset carries a **⤴** button that copies the one command which promotes
it (`npm run preset add "name" "<link>"`). *Copy link* is available in both modes: it is
how a plan travels, and how one built on a phone gets promoted later.

```bash
npm run dev        # build in local mode + serve on :8080 with the write API
```

Planning happens locally: save a preset there and it lands in a committed file, so
`npm run deploy` publishes it and it is on the phone next time. On the deployed site a
saved preset stays in that browser — which is the right behaviour for a tweak on the
hill, not a plan you want to keep. If you do want to keep one made on the phone, use
**Copy link** and turn it into a shipped preset back at the laptop.

`production` is the default so a stray build can never ship a page expecting a dev API,
and `npm run package` refuses outright if it finds `mode: "local"` in the config.

## Shipping presets

There is no login and no backend, so a preset that lives only in one browser is a
preset you will lose. Anything worth keeping is committed to
`routes/<route-id>/presets.json` and baked into the build, which puts it on every origin
— production, previews, and a local dev server — with nothing to import.

In local mode you can just use the page: save a preset and it is written to
`presets.json` for you. The CLI is for turning a **Copy link** URL into a preset —
handy for a plan made on your phone, since the link already encodes direction, peaks
mode and the whole selection:

```bash
npm run preset list
npm run preset add "Over the top only" "<paste the copied link>"
npm run preset remove "Over the top only"
npm run deploy                       # or npm run build
```

`scripts/preset.mjs` decodes the link with the same module the page encodes it with
(`scripts/lib/share.mjs`, generated into `site/share.js` for the browser), so the two
cannot disagree. A link made against an older build fails the fingerprint check and is
refused with an explanation, rather than being decoded into a different set of points.
Stale ids in a committed preset are dropped at build time with a warning.

## Pre-commit hook

```bash
npm run hooks:install      # points core.hooksPath at .githooks
```

Committed and shared rather than living untracked in `.git/hooks`, and with no husky or
other dependency. It takes under a second and:

- **blocks on lint errors** — warnings are counted and reported, not blocking, since
  several are deliberate (see below)
- **blocks if the generated browser copies are stale.** `site/resolve.js` and
  `site/share.js` come from `scripts/lib/*.mjs`; committing a source edit without
  rebuilding ships a page whose logic disagrees with the exports and the CLI, which on
  this project has repeatedly meant the figures shown not matching the GPX downloaded
- **blocks on test failures** — all 202 checks, ~5s
- **reports the analysis summary** without blocking

Every check runs even when an earlier one fails, and all failures are reported together
— fixing lint, re-committing, and only then finding a test failure is worse than seeing
both at once. About six seconds either way.

If the linter cannot be fetched (no network, cold `npx` cache) the hook warns and lets
the commit through — refusing to commit offline is worse than deferring the check.
Bypass entirely with `git commit --no-verify`.

## Linting

Nothing is installed — everything runs through `npx`, so there is no `node_modules`.
Config files are committed so the results are reproducible.

```bash
npm run lint          # oxlint: correctness, suspicious patterns, dead code
npm run lint:fix      # the subset oxlint can fix automatically
npm run lint:dead     # knip: unused files and exports
npm run format:check  # prettier, report only
npm run check         # lint + all tests + analyse, in one go
```

### What each tool does

| Tool | What it is for |
| --- | --- |
| **oxlint** | A linter, written in Rust, ~50x faster than ESLint. Catches unused variables, shadowed names, `==` vs `===`, mutation hazards, discarded error causes. Ran in about a second on this repo. |
| **knip** | Finds code nothing reaches: unused files, unused exports, unused dependencies. Answers "can I delete this?", which a linter cannot, because it works across the whole module graph. |
| **prettier** | Formats code to one style so diffs show real changes rather than whitespace. Opinionated; it does not check correctness. |
| **lighthouse** | Audits the *deployed* page for performance, accessibility and best practice. The only one of these that needs a live URL. |

### Configuration decisions

`.oxlintrc.json` — `correctness` is an error, `suspicious` and `perf` are warnings.
Several rules are off on purpose, and the reasons matter more than the settings:

- **`unicorn/no-array-sort`** off. It wants `toSorted()` because `sort()` mutates. Every
  `.sort()` call site here was audited: all sort a freshly-created array, and `.slice()`
  is used where the receiver is shared (see `camps` in `build.mjs`). Turning it on would
  be 13 edits of churn and a Safari 16 floor for no bug fixed. The audit was worth doing
  though — that is what the rule is for.
- **`no-underscore-dangle`** allows `_cat`, the deliberate marker for the category
  attached to an item at runtime.
- **`require-await`** off: the test harnesses use `async` stubs that mirror the shape of
  the real API without awaiting anything.
- **`site/resolve.js` is ignored.** It is generated from `scripts/lib/resolve.mjs`, so
  linting it reports every finding twice and tempts you to fix the copy.

`knip.json` declares the research scripts and `site/app.js` as entry points. Without
that, knip called eleven files unused: the research scripts are run by hand, and
`app.js` is loaded by a `<script>` tag knip does not parse.

Both knip and `npm run analyse` independently flag the same three helpers
(`smoothElevations`, `escapeXml`, `gridrefToEastingNorthing`) as exported but only used
inside their own module. They are not dead — making them private is a style call.

### Formatting is not applied

`prettier` would rewrite 22 files. `.prettierrc.json` matches the existing style
(100 columns, single quotes, trailing commas) which brought that down from 26, but the
remaining drift is real. Run `npm run format` if you want it; it has deliberately not
been run, because reformatting the whole codebase would bury every real change in the
next diff.

### On the deployed site

```bash
npx lighthouse <your-netlify-url> --view
npm run serve                      # serve site/ the way Netlify does, on :8080
```

### The OS Maps API key

The key is a credential and is **not in the repository**. Supply it once:

```bash
cp .env.example .env       # then paste your key in
npm run build
```

`OS_MAPS_KEY` may come from the environment or from `.env`. The build writes it into
`site/config.js`, which is **gitignored but included in the packaged zip** — so the
deployed site has the key and git never does. `verify.mjs` asserts that no key is
hardcoded in `site/app.js`, so it cannot creep back in.

Without a key the planner uses OpenStreetMap tiles: the OS button is disabled with an
explanatory tooltip, and OSM becomes the default rather than the map appearing blank.
An empty `OS_MAPS_KEY=` is treated the same as not setting it, and `npm run package`
warns before it seals a zip with no key in it.

Note for a **git-connected** Netlify deploy: because `site/config.js` is gitignored it
would not be pushed, so that deploy would fall back to OSM. Either use `npm run package`
and Drop (which includes it), or add a Netlify build step that writes `config.js` from a
Netlify environment variable.

If OS tiles are refused on the deployed domain, the key is domain-restricted — add the
domain in the OS Data Hub. The page also falls back to OSM automatically after six
failed tiles, so the map is never simply blank.

## How a route is laid out

```
routes/<route-id>/
  base-route.gpx            the established route, used exactly as supplied
  route.json                name, dates, day count, directions, planning limits
  peaks/*.json              detour candidates    ─┐
  wild-swim-spots/*.json                          │  any number of files per
  wildcamp-spots/*.json     camps = day splits    │  directory, all merged
  camp-spots/*.json         campsites, bothies    │
  misc-poi/*.json           pubs, resupply, etc. ─┘
  gpx-exports/              generated
```

Every POI is one object. Only `title`, `lat`/`lon` (or `gridref`) are required:

```json
{
  "id": "peak-scafell-pike",
  "title": "Scafell Pike",
  "gridref": "NY215072",
  "lat": 54.4544, "lon": -3.2114,
  "heightM": 978,
  "labels": ["classic", "rocky"],
  "starred": true,
  "description": "…",
  "via": null
}
```

`via` is an optional chain of intermediate points. Without it a detour is routed as
an out-and-back from the nearest point on the line; with it you control the actual
line (which col, which side of the crag) and it can be a traverse that rejoins
elsewhere.

## Adding a new route

1. `cp -r routes/template-route routes/my-route`, drop the GPX in, edit `route.json`.
2. Put POIs in the category directories.
3. `node scripts/build.mjs my-route`

## How the numbers are produced

The point of this project is that the figures are measured rather than asserted.

- **Distance** is summed along the supplied track. No correction factor is applied.
- **Ascent** is sampled from a DEM when the GPX has no elevation (the Lakeland Way
  GPX has none), smoothed, then summed with a hysteresis threshold so DEM noise is
  not counted as climbing. On a closed loop ascent must equal descent — that is
  asserted in `verify.mjs`, and currently agrees to 13 m in 6,288 m.
- **Detours** are routed onto real paths with BRouter's `hiking-mountain` profile,
  then measured along the routed spur. Where the nearest point on the route turns
  out to be a poor place to leave it (a lake in the way, so the walk goes round),
  the build retries from other points and keeps the shortest.
- **Summits are walked over, not doubled back on, where the route allows it.** See
  below.

- **Peaks** are converted from OS grid references, then each is checked against the
  DEM: if the reading does not match the published height the coordinate is
  rejected rather than shipped. This caught several bad references, including three
  in the wrong 100 km grid square.
- **Wild swims** are discovered from OpenStreetMap rather than recalled, so names
  and positions are verifiable. Large lakes are flagged `needsEntryPoint` because
  an OSM centroid sits offshore.
- **Camps** are scored on altitude, gradient and distance to water, then the day
  boundaries are chosen by dynamic programming to keep days near-even and inside
  the limits in `route.json`.
- **Day plans** respect every limit in `route.json`: `maxDayKm`, `targetAverageKm`,
  `maxConsecutiveLongDays`, a tighter `endDayMaxKm` for the two travel days, and
  `minEasyMiddleDays` short days mid-trip (short walking days, not days off).
  Starring a detour marks it as worth doing; it does not mean it fits. The
  recommended set is chosen against the budget, then trimmed and topped up against
  the real resolver until every limit holds.

  The end-day cap applies to **both** ends, not just the first. Walked
  anticlockwise, today's final leg becomes day 1, so a cap on one end alone would be
  broken simply by changing direction.

## Traverses, chains and collection

An out-and-back is always available but rarely the natural way to take a summit in.
Where the route passes near the same fell twice, it is better to leave the line,
walk over the top, and rejoin further along. The cost is then the traverse *minus
the base route it replaces*, which is far less than doubling back — Scafell Pike
drops from +5.9 km to +1.6 km, Cat Bells from +12.9 km to +3.1 km.

Three refinements matter:

- **Chains.** Overlapping traverses cannot both be spliced — each replaces the same
  stretch of route. So **every combination is routed as one line**: summits whose
  traverses overlap form a cluster, and every subset of two or more is routed
  entry → summits in order → exit. On the Lakeland Way that is 4 clusters, 126
  combinations, up to a seven-summit Scafell round. Whatever you tick has a real walk
  covering exactly those tops, so ticking a summit never silently does nothing.

  Two guards bound it: a chain may not replace more than `maxChainBypassKm` (12km, versus
  10km for a single traverse — a chain does more work for the ground it bypasses), and may
  not span a camp. Chains are judged against **doubling back**, not against walking their
  summits separately: those traverses overlap by definition, so that baseline is not
  available to the walker, and testing against it threw away the only line that delivered
  those tops.

  Net distance is **signed**. A high line can be shorter than the valley route it
  replaces while climbing far more — Scafell + Scafell Pike is 0.7km shorter than the
  Lakeland Way's dog-leg via Wasdale, and climbs 452m more.
- **Collection.** A traverse walks past things. Anything within 300 m of its line is
  collected on the way at no extra cost — the Esk Falls traverse picks up both
  Lingcove Beck falls, which would otherwise cost nearly 8 km each.
- **Orphaning.** A traverse deletes the stretch of base route it replaces. If
  another selected point's entry sat inside that stretch, its out-and-back would
  anchor onto the new line and add an unwalkable straight-line jump — so that
  traverse is withdrawn instead. This is a genuine either/or, not a bug: with the
  Scafell Pike traverse you would have to descend 1.9 km to reach Emerald Pools,
  and no spur exists for that. Untick the pool and the traverse activates.

### Three ways to take detours

The page offers a **Peaks** control, and the build ships a plan and a GPX for the middle
one:

| Mode | What it does |
| --- | --- |
| Over the top | Walk over a summit where a traverse exists, double back otherwise |
| No there-and-back | Refuse to double back at all: only summits you can walk over, chain, or pass on the way |
| There and back | Never leave the drawn line; every detour doubles back |

`No there-and-back` is more than a filter. With nothing spliced at its own entry
point, no traverse can orphan anything, so traverses that were withdrawn become
usable — Scafell Pike, Helvellyn, Blencathra and Blea Water all switch to being
walked over, and the count of points collected free rises from 6 to 11. On the
Lakeland Way it gives 241 km / 9,667 m at 20 km a day, against 299 km / 12,764 m for
the default and 351 km / 15,138 m if everything doubles back.

Which stretches to use is solved as **weighted interval scheduling** — the best set of
non-overlapping stretches — rather than in route order, which would let a small saving
shut out a large one.

Two details there are easy to get wrong, and both were:

- **Sort by finish, not start.** The predecessor of an interval is the last one that
  *ends* before it starts. Sorting by start makes "the nearest earlier non-overlapping
  interval" an invalid boundary, and the DP then picks two stretches that replace the same
  base route. It was latent with a handful of candidates; with 126 chains it produced a
  day 10km shorter than its own stated figures.
- **What to maximise depends on the mode.** With doubling back allowed, a summit that
  loses its stretch is still walked as an out-and-back, so only cost matters. With
  doubling back refused, losing the stretch means not being walked at all — so coverage of
  what was ticked must outrank kilometres saved, or ticking three summits yields the
  cheaper two-summit chain and drops the third.

**All of this lives in one file.** `scripts/lib/resolve.mjs` is imported by
`build.mjs` and `verify.mjs`, and the build generates `site/resolve.js` from it for
the browser. Three hand-maintained copies drifted three separate times, each time as
a silent disagreement between the figures displayed and the geometry exported. Do
not reintroduce a second copy; edit the module and rebuild.


## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/build.mjs` | Main build: geometry, detour routing, days, GPX, site data |
| `scripts/verify.mjs` | Asserts the output is internally consistent |
| `scripts/test-site.mjs` | Runs site/app.js headlessly against the real data |
| `scripts/test-features.mjs` | Behavioural tests for persistence and search |
| `scripts/test-server.mjs` | Tests the dev server's preset API against a real file |
| `scripts/serve.mjs` | Dev server: serves `site/` plus the local preset API |
| `scripts/preset.mjs` | Turn a Copy link URL into a shipped preset |
| `scripts/lib/resolve.mjs` | The single shared resolver (see above) |
| `scripts/research/try-traverse.mjs` | Explore traverse options for named summits |
| `scripts/research/screen-peaks.mjs` | Grid-ref → WGS84 + DEM height validation |
| `scripts/research/fetch-water.mjs` | Overpass query for water features (cached) |
| `scripts/research/screen-swims.mjs` | Filters water features by distance from route |
| `scripts/research/site-camps.mjs` | Scores pitches and picks day boundaries |
| `scripts/research/emit-pois.mjs` | Merges screened data with `curation.mjs` |

`scripts/research/curation.mjs` holds the human judgement: which candidates are
worth a detour, what to say about them, and which OSM water is not swimmable.
Machine-verified facts stay in the screened JSON; the two are merged by
`emit-pois.mjs`. A candidate with no curated note still ships — it simply carries no
description rather than an invented one.

## Using the page

- **Search** (⌘K / Ctrl-K) finds any of the 236 points by name, label or description,
  ranking a prefix match above a substring one. A result shows which day it falls on
  and how it is reached; clicking it opens that day, scrolls to it, and centres the
  map on it. Each day also has its own filter box once it has more than three points.
- **Shareable links.** *Copy link* puts the whole plan in the URL hash — direction,
  peaks setting and selection — in about 120 characters. The selection is a bitmask
  over a canonical (sorted) id list, so it is compact but build-dependent: the hash
  also carries a fingerprint of that id list, and a link made before a rebuild is
  reported as out of date rather than silently decoded into a different set of
  points. A link outranks whatever this browser has saved.
- **Presets.** Two built-in ones — *Base route* and *Recommended* — plus your own: *Save preset…* stores the current
  selection (with its direction and peaks setting) in this browser. The active preset
  is highlighted, and a **modified** badge appears when the selection no longer
  matches any of them. Switching preset while modified asks first, and offers to save
  what you have rather than making you choose between losing it and cancelling.
- **Presets you want to keep ship with the site.** `localStorage` is per-origin, so a
  preset saved in the browser on `route-planner.test` will not appear on
  `lakeland-way.netlify.app`, and every Netlify preview deploy is a fresh origin again.
  With no auth and no backend there is nowhere to sync them to, so anything worth
  keeping is committed instead and baked in by the build — see
  [Shipping presets](#shipping-presets). Presets saved in the browser still work; they
  are just local to that browser, and are shown with a `×` to delete, whereas shipped
  ones are not deletable from the page.
- **Re-saving a preset never silently overwrites.** `savePreset()` returns `exists` on
  a name collision instead of replacing, and the caller asks: *overwrite it*, or
  *keep both* under a suggested free name (`Coniston plan 2`). Overwriting keeps the
  preset's original position and capitalisation so the buttons do not move around.
- **Update** appears as its own button, but only when there is something to update:
  a preset you applied and have since edited. It names its target — *Update "Coniston
  plan"* — and overwrites directly, because a button that names what it will replace
  is already unambiguous and does not need a confirmation of its own. *Save preset…*
  stays alongside it and always creates a new one.

  The preset being worked from is tracked separately from the derived active preset,
  because editing a selection makes the active preset `null` while you are plainly
  still working on that plan.
- **Your selection persists.** Direction, peak mode, ticked points, open days and
  per-day filters are saved to `localStorage`, namespaced per route and versioned.
  On load, ids that no longer exist are discarded rather than restored as phantom
  selections, and corrupt storage falls back to the recommended plan instead of
  breaking the page. **Reset** clears it and returns to the recommendation.
- **The bold line is what you walk**; the faint dashed line is the route as drawn, so
  where they differ you can see what a traverse bypasses. Faded markers are points
  not in the plan, including peaks left out by the no-there-and-back rule.

## Wild camping

There is no general right to wild camp in the Lake District. Pitches are chosen for
the accepted convention: high ground well above enclosed valley land, arrive late,
leave early, one night, no fires, no trace. Some may need the landowner's
permission.

## Data sources

- Base route: drawn in OS Maps, supplied as GPX
- Basemap: OS Maps API, falling back to OpenStreetMap
- Elevation: SRTM 30 m via [Open Topo Data](https://www.opentopodata.org/)
- Detour routing: [BRouter](https://brouter.de/), OpenStreetMap data
- Water features: OpenStreetMap via Overpass
