[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ArulAdiSanjaya/launchscope-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ArulAdiSanjaya/launchscope-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# LaunchScope — Token Launch Radar

A token launch radar built from one sealed DefiLlama snapshot: it finds the
protocols that record no token yet, ranks them by an implied launch value, and
gives each one a concrete farm plan. The board covers the snapshot's full
40-protocol watchlist and adds every other rankable pre-token protocol the
snapshot carries — the early finds below the $50M floor are the point of a
radar — while protocols whose token already trades are kept apart in a Live
view and never ranked.

**The model** (version `launchscope-4`, restated in full inside the
dashboard): the market itself prices each category. For every live-token
protocol in the snapshot, market cap ÷ TVL is computed; a category's multiple
is the median of its live protocols. A pre-token protocol's implied value is
then

```
implied = TVL × category multiple × growth × endurance × reach × momentum × relative
growth    = 1 + clamp(7-day TVL change, −50, +100)/100 × 0.6
endurance = 0.72 + 0.28 × min(days with no token, 1460)/1460
reach     = 1 + 0.02 × min(chains − 1, 5)
momentum  = 1 + clamp(category 7-day change, −50, +100)/100 × 0.3
relative  = 1 + clamp(own 7-day change − category 7-day change, −50, +100)/100 × 0.2
```

The momentum factor is the category's own direction of travel: the median
7-day TVL change of its live-token protocols (the global median when a
category has too few live comps reporting one). A sector whose live tokens are
growing lifts its pre-token names; a cooling sector discounts them.

The relative factor is the protocol's own velocity against that sector: its
7-day TVL change minus the category's median live-token change. Growth
rewards absolute momentum; relative rewards winning share — a protocol
outgrowing its own sector rises above a peer that merely rides the sector's
tide, and one lagging its sector is discounted even when its absolute growth
looks fine. A protocol the snapshot gives no 7-day change for carries no
adjustment here (0), rather than borrowing its sector's move. On this
snapshot the factor re-ranks 92 of 198 rows (top 10 unchanged): the biggest
movers are protocols whose own growth diverges most from their sector, e.g.
Anemoy Capital #84 → #98 (−72.7% own vs −1.0% sector) and Theo Network
#94 → #83 (+94.0% own vs −1.0% sector).

Alongside the value, each row carries a 0–100 radar score for launch
readiness (size, momentum, endurance, category heat, reach). The score never
changes the ranking — the board ranks by implied value alone. No protocol
name is special-cased; one function scores every row, and the dashboard's
model page lets a reader re-run the ranking with different weights, live.

**The dashboard** is a static page with no framework and no network: a
sortable, filterable board (search, category, chain, watchlist/early tiers,
plus five signal cards for the fastest riser, the largest tokenless TVL, a
fresh listing, the hottest category by live-token momentum, and the protocol
gaining share fastest against its own sector), a detail view per protocol with the full model breakdown,
generated risk notes, its live category comps and a seven-step farm plan with
a cost and a time on every step, a Live tokens view, and the model page with
the category-multiple table and sandbox.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

That reads the snapshot, writes `out/board.json` and `out/data.js`, copies
`dashboard/` and `screenshots/` into `out/`, and writes the `dossier.json`
hand-in with the vendored make.fun library. Open `out/dashboard/index.html`
from any static file server to use the radar.

## Layout

- `main.ts` — the hand-in program described above.
- `lib/model.ts` — the model: snapshot parsing, category comp multiples,
  implied value, radar score, board building and farm-plan generation.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `screenshots/` — three real renders of the dashboard in a browser: the
  board, a protocol detail view, and a filtered watchlist view.
- `vendor/makefun-board.ts` — the make.fun kit's dossier library, unchanged.

## License

MIT — see `LICENSE`.

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
