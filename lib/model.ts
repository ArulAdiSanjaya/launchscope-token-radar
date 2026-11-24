// LaunchScope model: one sealed DefiLlama snapshot in, one ranked launch board out.
//
// The question the board answers: if a protocol that records no token issued one
// today, what would the snapshot's own figures say it is worth — and what should
// a reader do, concretely, to be positioned for that launch?
//
// Implied value is built only from figures the snapshot itself carries:
//
//   comps       = the live-token protocols in the same snapshot. For each one the
//                 market already prices TVL: ratio = mcap_usd / tvl_usd. A
//                 category's multiple is the MEDIAN ratio of its live protocols
//                 (the global median when a category has too few live comps), so
//                 the market — not a hand-picked constant — prices each sector.
//   base        = tvl_usd x category multiple
//   growth      = clamp(change_7d, -50, 100); growthMult = 1 + growth/100 x 0.6
//   endurance   = 0.72 + 0.28 x min(age_days, 1460)/1460 — a protocol that has
//                 run for years at size with no token is a stronger launch
//                 candidate than a week-old one (unknown age counts as 365 days)
//   reach       = 1 + 0.02 x min(chains - 1, 5) — multi-chain presence, capped
//   momentum    = the category's own direction of travel: the median 7-day TVL
//                 change of its live-token protocols (the global median when a
//                 category has too few live comps reporting one);
//                 momentumMult = 1 + clamp(momentum, -50, 100)/100 x 0.3, so a
//                 sector whose live tokens are growing lifts its pre-token
//                 names, and a cooling sector discounts them
//   relative     = the protocol's own velocity against its sector: its 7-day TVL
//                 change minus the category momentum above (0 when the snapshot
//                 reports no 7-day change for it);
//                 relativeMult = 1 + clamp(relative, -50, 100)/100 x 0.2, so a
//                 protocol gaining share inside its own sector rises above a
//                 peer that merely rides the sector's tide — growth rewards
//                 absolute momentum, relative rewards winning share
//   implied     = max(1, round(base x growthMult x endurance x reach x momentumMult x relativeMult))
//
// A separate radar score (0-100) grades launch readiness from size, momentum,
// endurance, reach and category heat. It is shown beside the value, never used
// to rank: the board ranks by implied value alone, as the gate requires.
//
// No protocol name is ever special-cased: one function scores every row, and the
// dashboard restates the model and recomputes every row from the same figures.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, restated in the dashboard so a reader can audit them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  endurance_floor: number;
  endurance_range: number;
  endurance_days: number;
  unknown_age_days: number;
  reach_per_chain: number;
  reach_max_extra_chains: number;
  multiple_floor: number;
  multiple_cap: number;
  min_category_comps: number;
  momentum_weight: number;
  relative_weight: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  endurance_floor: 0.72,
  endurance_range: 0.28,
  endurance_days: 1460,
  unknown_age_days: 365,
  reach_per_chain: 0.02,
  reach_max_extra_chains: 5,
  multiple_floor: 0.04,
  multiple_cap: 2.5,
  min_category_comps: 3,
  momentum_weight: 0.3,
  relative_weight: 0.2,
};

/** The model's version label: the dashboard names it and board.json carries it. */
export const MODEL_VERSION = 'launchscope-4';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 30;

/** One row of board.json: the ranked board's row, with its full model breakdown. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  tier: 'watchlist' | 'early';
  age_days: number | null;
  implied_value_usd: number;
  radar_score: number;
  score_parts: { size: number; momentum: number; endurance: number; reach: number; heat: number };
  model: {
    category_multiple: number;
    multiple_source: 'category' | 'global';
    comps_used: number;
    growth_pct: number;
    growth_multiplier: number;
    endurance_multiplier: number;
    reach_multiplier: number;
    category_momentum_pct: number;
    momentum_multiplier: number;
    momentum_source: 'category' | 'global';
    momentum_comps: number;
    relative_pct: number;
    relative_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
  tvl_multiple: number | null;
}

/** One category's comp set: how the market prices that sector's TVL today, and how fast its live tokens' TVL is moving. */
export interface CategoryStat {
  category: string;
  live_protocols: number;
  median_multiple: number;
  board_protocols: number;
  median_change_7d: number | null;
  momentum_source: 'category' | 'global';
}

/** Everything the dashboard renders, written to data.js by main.ts. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  global_momentum_pct: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  categories: CategoryStat[];
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list, or null for an empty one. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all in the snapshot. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a wrapped product may begin with. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether an early (below-floor) protocol may be ranked: it records no token and
 * is not itself a wrapped, staked or bridged product of one that already trades —
 * the same exclusions the house's watchlist rule states, applied below the floor.
 */
export function isRankableEarly(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The comp multiples the snapshot's live-token protocols imply, global and per category. */
export interface Multiples {
  global: number;
  byCategory: Map<string, { multiple: number; comps: number; source: 'category' | 'global' }>;
}

export function compMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): Multiples {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = ratiosByCategory.get(key) ?? [];
    list.push(ratio);
    ratiosByCategory.set(key, list);
  }
  const globalRaw = median(all) ?? model.multiple_floor;
  const global = clamp(globalRaw, model.multiple_floor, model.multiple_cap);
  const byCategory = new Map<string, { multiple: number; comps: number; source: 'category' | 'global' }>();
  for (const [key, ratios] of ratiosByCategory) {
    if (ratios.length >= model.min_category_comps) {
      byCategory.set(key, { multiple: clamp(median(ratios)!, model.multiple_floor, model.multiple_cap), comps: ratios.length, source: 'category' });
    } else {
      byCategory.set(key, { multiple: global, comps: ratios.length, source: 'global' });
    }
  }
  return { global, byCategory };
}

/** The category momentum the snapshot's live-token protocols imply, global and per category. */
export interface Momentum {
  global: number;
  byCategory: Map<string, { momentum: number; comps: number; source: 'category' | 'global' }>;
}

/**
 * Category momentum: the median 7-day TVL change of the live-token protocols
 * in a category — the sector's own direction of travel, priced by the market
 * the same way the category multiple is. A category with too few live comps
 * reporting a 7-day change falls back to the global median, so no protocol is
 * priced on a single noisy reading.
 */
export function categoryMomentum(snapshot: Snapshot, model: ModelConstants = MODEL): Momentum {
  const changesByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.change_7d === null || !Number.isFinite(p.change_7d)) continue;
    all.push(p.change_7d);
    const key = p.category ?? 'Uncategorised';
    const list = changesByCategory.get(key) ?? [];
    list.push(p.change_7d);
    changesByCategory.set(key, list);
  }
  const global = median(all) ?? 0;
  const byCategory = new Map<string, { momentum: number; comps: number; source: 'category' | 'global' }>();
  for (const [key, changes] of changesByCategory) {
    if (changes.length >= model.min_category_comps) {
      byCategory.set(key, { momentum: median(changes)!, comps: changes.length, source: 'category' });
    } else {
      byCategory.set(key, { momentum: global, comps: changes.length, source: 'global' });
    }
  }
  return { global, byCategory };
}

/** The momentum one protocol is priced with, how many live comps stand behind it, and which price it is. */
function momentumFor(p: SnapshotProtocol, momentum: Momentum): { momentum: number; comps: number; source: 'category' | 'global' } {
  const hit = momentum.byCategory.get(p.category ?? 'Uncategorised');
  return hit ?? { momentum: momentum.global, comps: 0, source: 'global' };
}

/** The multiple one protocol is priced with, how many live comps stand behind it, and which price it is. */
function multipleFor(p: SnapshotProtocol, multiples: Multiples): { multiple: number; comps: number; source: 'category' | 'global' } {
  const hit = multiples.byCategory.get(p.category ?? 'Uncategorised');
  return hit ?? { multiple: multiples.global, comps: 0, source: 'global' };
}

/** Every factor of one protocol's implied value under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: Multiples,
  momentum: Momentum,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; comps: number; source: 'category' | 'global'; growthPct: number; growthMult: number; enduranceMult: number; reachMult: number; momentumPct: number; momentumMult: number; momentumSource: 'category' | 'global'; momentumComps: number; relativePct: number; relativeMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, comps, source } = multipleFor(protocol, multiples);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const enduranceMult = model.endurance_floor + (clamp(ageForModel, 0, model.endurance_days) / model.endurance_days) * model.endurance_range;
  const reachMult = 1 + model.reach_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.reach_max_extra_chains);
  const mom = momentumFor(protocol, momentum);
  const momentumPct = clamp(mom.momentum, model.growth_floor, model.growth_cap);
  const momentumMult = 1 + (momentumPct / 100) * model.momentum_weight;
  // Relative velocity: the protocol's own 7-day change against its sector's
  // median live-token change. A protocol with no reported 7-day change carries
  // no signal here (0), rather than borrowing its sector's move.
  const relativePct = protocol.change_7d === null || !Number.isFinite(protocol.change_7d)
    ? 0
    : clamp(protocol.change_7d - mom.momentum, model.growth_floor, model.growth_cap);
  const relativeMult = 1 + (relativePct / 100) * model.relative_weight;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * enduranceMult * reachMult * momentumMult * relativeMult));
  return { implied, multiple, comps, source, growthPct, growthMult, enduranceMult, reachMult, momentumPct, momentumMult, momentumSource: mom.source, momentumComps: mom.comps, relativePct, relativeMult, age };
}

/** The radar score's five parts and their sum: launch readiness, 0 to 100. */
export function radarScore(
  protocol: SnapshotProtocol,
  multiples: Multiples,
  age: number | null,
  model: ModelConstants = MODEL,
): { score: number; parts: { size: number; momentum: number; endurance: number; reach: number; heat: number } } {
  const { multiple } = multipleFor(protocol, multiples);
  const size = 30 * clamp((Math.log10(Math.max(protocol.tvl_usd, 1)) - Math.log10(5_000_000)) / (Math.log10(50_000_000_000) - Math.log10(5_000_000)), 0, 1);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const momentum = 20 * ((growthPct - model.growth_floor) / (model.growth_cap - model.growth_floor));
  const endurance = 20 * (clamp(age ?? model.unknown_age_days, 0, model.endurance_days) / model.endurance_days);
  const reach = 10 * (Math.min(protocol.chains.length, 6) / 6);
  const heat = 20 * clamp(multiple / model.multiple_cap, 0, 1);
  const parts = {
    size: Math.round(size),
    momentum: Math.round(momentum),
    endurance: Math.round(endurance),
    reach: Math.round(reach),
    heat: Math.round(heat),
  };
  return { score: clamp(parts.size + parts.momentum + parts.endurance + parts.reach + parts.heat, 0, 100), parts };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What gas costs on a chain, in plain words a farmer can budget with. */
function gasNote(chain: string): string {
  if (chain === 'Ethereum') return 'about $8 of ETH for gas on Ethereum mainnet';
  if (chain === 'Solana') return 'well under $1 of SOL in network fees';
  if (chain === 'Bitcoin') return 'about $2 of BTC in network fees';
  return `about $2 of gas on ${chain}`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 250_000_000) return 120;
  if (p.tvl_usd >= 50_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 75;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's main action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave the deposit open so it counts in weekly snapshots`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, split evenly across the pair`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in one app on that chain`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the staking receipt in the same wallet`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and place one position in its most liquid market`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares untouched`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the wallet`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield asset ${name} issues on ${chain} and hold it past the next snapshot`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active`;
  if (c.includes('launchpad')) return `Commit $${capital} on ${name} and complete one full launch cycle on ${chain}`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open`;
}

/** The category's second, diversifying action. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Borrow a small amount against the supply on ${name} once, repay it within a week, and keep the supply open`;
  if (c.includes('dex')) return `Make one swap a week through ${name}'s main pool on ${chain} so the wallet shows real trading, not only deposits`;
  if (c.includes('bridge')) return `Bridge a small amount back through ${name} once, so the wallet shows traffic in both directions`;
  if (c.includes('staking') || c.includes('restak')) return `Claim rewards on ${name} once and restake them, so the wallet shows an active staking history`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Open and close one small trade a week on ${name}; steady activity counts more than one large trade`;
  return `Make one extra qualifying action on ${name} — a swap, a vote or a small second deposit — in a different week from the first`;
}

/** A step as one string, held inside the gate's 20 to 600 characters. */
export function stepText(text: string, cost: string, time: string): string {
  let s = `${text}. Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with its cost and its time.
 * Every step is derived from the protocol's own record (category, chains, TVL,
 * age) — never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasNote(chain);
  return [
    stepText(
      `Start from a fresh wallet that holds only the funds you plan to farm ${p.name} with, and keep its seed phrase offline`,
      'nothing to set up, and never pay anyone to farm for you',
      '5 minutes',
    ),
    stepText(actionFor(p, capital, chain), `$${capital} of capital plus ${gas}`, '15 minutes to set up'),
    stepText(secondActionFor(p, chain), 'about $2 of gas', '10 minutes, in a later week'),
    stepText(
      `Repeat one qualifying action each week on ${p.name} — a deposit, a swap, a borrow or a vote — so the wallet builds a history, not a single spike`,
      'about $2 of gas a week',
      '10 minutes a week',
    ),
    stepText(
      `Hold the position for at least ${hold} days so it appears in more than one weekly snapshot of ${p.name}'s users`,
      `the $${capital} stays in the position for the whole window`,
      `${hold} days`,
    ),
    stepText(
      `Check ${p.name}'s own points or rewards page from the link the protocol itself publishes, and claim only there`,
      'no fee to check, and never pay a third party to claim',
      '10 minutes',
    ),
    stepText(
      `Log the wallet, the dates and every transaction hash, and set the exit rule now: withdraw only after a launch announcement names its snapshot date, or after ${hold} days with no announcement`,
      'nothing but the log',
      '5 minutes',
    ),
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = compMultiples(snapshot, model);
  const momentum = categoryMomentum(snapshot, model);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, { p: SnapshotProtocol; tier: 'watchlist' | 'early' }>();
  // The watchlist is the floor: every slug is ranked, whatever the early filter says.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, { p, tier: 'watchlist' });
  }
  // The early radar: every other rankable pre-token protocol, at any size.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankableEarly(p)) chosen.set(p.slug, { p, tier: 'early' });
  }
  const scored = [...chosen.values()].map(({ p, tier }) => {
    const v = impliedValue(p, snapshot.as_of, multiples, momentum, model);
    const s = radarScore(p, multiples, v.age, model);
    return { p, tier, v, s };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((row, i) => ({
    rank: i + 1,
    slug: row.p.slug,
    name: row.p.name,
    category: row.p.category,
    chains: row.p.chains,
    tvl_usd: row.p.tvl_usd,
    change_7d: row.p.change_7d,
    mcap_usd: row.p.mcap_usd,
    listed_at: row.p.listed_at,
    gecko_id: row.p.gecko_id,
    symbol: row.p.symbol,
    token_status: 'pre-token',
    tier: row.tier,
    age_days: row.v.age,
    implied_value_usd: row.v.implied,
    radar_score: row.s.score,
    score_parts: row.s.parts,
    model: {
      category_multiple: round4(row.v.multiple),
      multiple_source: row.v.source,
      comps_used: row.v.comps,
      growth_pct: row.v.growthPct,
      growth_multiplier: round4(row.v.growthMult),
      endurance_multiplier: round4(row.v.enduranceMult),
      reach_multiplier: round4(row.v.reachMult),
      category_momentum_pct: round4(row.v.momentumPct),
      momentum_multiplier: round4(row.v.momentumMult),
      momentum_source: row.v.momentumSource,
      momentum_comps: row.v.momentumComps,
      relative_pct: round4(row.v.relativePct),
      relative_multiplier: round4(row.v.relativeMult),
      age_days: row.v.age,
    },
    farm_steps: farmSteps(row.p, row.v.age),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
      tvl_multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Per-category comp and board counts, for the dashboard's model section. */
export function categoryStats(snapshot: Snapshot, board: BoardRow[], multiples: Multiples, momentum: Momentum): CategoryStat[] {
  const boardCounts = new Map<string, number>();
  for (const r of board) {
    const key = r.category ?? 'Uncategorised';
    boardCounts.set(key, (boardCounts.get(key) ?? 0) + 1);
  }
  const stats: CategoryStat[] = [];
  for (const [category, info] of multiples.byCategory) {
    const mom = momentum.byCategory.get(category) ?? { momentum: momentum.global, comps: 0, source: 'global' as const };
    stats.push({
      category,
      live_protocols: info.comps,
      median_multiple: round4(info.multiple),
      board_protocols: boardCounts.get(category) ?? 0,
      median_change_7d: mom.comps > 0 ? round4(mom.momentum) : null,
      momentum_source: mom.source,
    });
  }
  return stats.sort((a, b) => b.live_protocols - a.live_protocols || (a.category < b.category ? -1 : 1));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const multiples = compMultiples(snapshot, model);
  const momentum = categoryMomentum(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: round4(multiples.global),
    global_momentum_pct: round4(momentum.global),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => r.tier === 'early').length,
    live_size: live.length,
    categories: categoryStats(snapshot, board, multiples, momentum),
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, spread, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
