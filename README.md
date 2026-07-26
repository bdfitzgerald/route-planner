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

Other options if you prefer:

- **Git-connected Netlify** — commit and push. `netlify.toml` sets `publish = "site"`
  with no build command, so Netlify uploads `site/` as-is.
- **CLI** — `netlify deploy --prod --dir=site`.

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

- **Chains.** Summits that cluster (Coniston Old Man + Dow Crag) are re-routed as a
  single line over both, cheaper than two separate traverses.
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

The page offers a **Detours** control, and the build ships a plan and a GPX for the
middle one:

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

Which traverses to use is solved as **weighted interval scheduling** — the
maximum-saving set of non-overlapping stretches — rather than in route order, which
would let a small saving shut out a large one.

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
- **Presets.** Six built-in ones, plus your own: *Save preset…* stores the current
  selection (with its direction and peaks setting) in this browser. The active preset
  is highlighted, and a **modified** badge appears when the selection no longer
  matches any of them. Switching preset while modified asks first, and offers to save
  what you have rather than making you choose between losing it and cancelling.
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
