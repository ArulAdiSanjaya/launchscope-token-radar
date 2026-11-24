/* LaunchScope — the token launch radar page.
   Renders window.RADAR (written by main.ts from the sealed snapshot) with no
   network and no framework: a ranked board, a detail view per protocol, a
   live-token view that keeps already-trading protocols apart, and a model
   view that restates the valuation and lets a reader re-run it live. */
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('app');
  var M = DATA.model;

  /* ---------- formatting ---------- */
  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function pctClass(n) { return n === null || n === undefined || n === 0 ? 'flat' : n > 0 ? 'up' : 'down'; }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30.4) + ' mo';
    return (days / 365.25).toFixed(1) + ' yrs';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      if (Array.isArray(c)) { c.forEach(function (x) { if (x) node.appendChild(x); }); }
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  /* ---------- the model, recomputed in the page (mirrors lib/model.ts) ---------- */
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function impliedOf(row, sb) {
    var multiple = sb ? DATA.global_multiple + (row.model.category_multiple - DATA.global_multiple) * sb.blend : row.model.category_multiple;
    var growthPct = clamp(row.change_7d === null ? 0 : row.change_7d, M.growth_floor, M.growth_cap);
    var gw = sb ? sb.growth : M.growth_weight;
    var growthMult = 1 + (growthPct / 100) * gw;
    var age = row.age_days === null ? M.unknown_age_days : row.age_days;
    var range = sb ? M.endurance_range * sb.endurance : M.endurance_range;
    var enduranceMult = M.endurance_floor + (clamp(age, 0, M.endurance_days) / M.endurance_days) * range;
    return Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * enduranceMult * row.model.reach_multiplier * row.model.momentum_multiplier));
  }

  /* ---------- routing / state ---------- */
  var state = { view: 'board', q: '', cat: 'all', chain: 'all', tier: 'all', sort: 'rank', dir: 1, slug: null };
  function readHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var qAt = h.indexOf('?');
    var path = qAt >= 0 ? h.slice(0, qAt) : h;
    var query = qAt >= 0 ? h.slice(qAt + 1) : '';
    var parts = path.split('/');
    state.view = 'board'; state.slug = null;
    if (parts[0] === 'p' && parts[1]) { state.view = 'detail'; state.slug = decodeURIComponent(parts[1]); return; }
    if (parts[0] === 'live') { state.view = 'live'; return; }
    if (parts[0] === 'model') { state.view = 'model'; return; }
    if (parts[0] === 'board' || parts[0] === '') {
      var qs = new URLSearchParams(query);
      state.q = qs.get('q') || ''; state.cat = qs.get('cat') || 'all';
      state.chain = qs.get('chain') || 'all'; state.tier = qs.get('tier') || 'all';
      state.sort = qs.get('sort') || 'rank'; state.dir = Number(qs.get('dir') || 1);
    }
  }
  function boardHash() {
    var qs = new URLSearchParams();
    if (state.q) qs.set('q', state.q);
    if (state.cat !== 'all') qs.set('cat', state.cat);
    if (state.chain !== 'all') qs.set('chain', state.chain);
    if (state.tier !== 'all') qs.set('tier', state.tier);
    if (state.sort !== 'rank') qs.set('sort', state.sort);
    if (state.dir !== 1) qs.set('dir', String(state.dir));
    var s = qs.toString();
    return '#/board' + (s ? '?' + s : '');
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  /* ---------- shared chrome ---------- */
  function header() {
    var totalTvl = DATA.rows.reduce(function (a, r) { return a + r.tvl_usd; }, 0);
    var implied = DATA.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var median = implied[Math.floor(implied.length / 2)];
    function stat(k, v, em) {
      return el('div', { class: 'stat' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v' }, [em ? el('em', { text: v }) : document.createTextNode(v)])]);
    }
    var tabs = el('nav', { class: 'tabs' }, [
      el('button', { type: 'button', 'aria-pressed': state.view === 'board' || state.view === 'detail' ? 'true' : 'false', text: 'Launch board', onclick: function () { go('#/board'); } }),
      el('button', { type: 'button', 'aria-pressed': state.view === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { go('#/live'); } }),
      el('button', { type: 'button', 'aria-pressed': state.view === 'model' ? 'true' : 'false', text: 'The model', onclick: function () { go('#/model'); } }),
    ]);
    return el('header', { class: 'top' }, [el('div', { class: 'top-in' }, [
      el('div', { class: 'brand' }, [
        el('span', { class: 'logo' }, ['LAUNCH', el('b', { text: 'SCOPE' })]),
        el('span', { class: 'tagline' }, [el('span', { class: 'blip' }), document.createTextNode('Token launch radar — protocols that record no token yet, ranked by what the snapshot\u2019s own figures say a launch would be worth.')]),
      ]),
      el('div', { class: 'stats' }, [
        stat('Protocols ranked', String(DATA.board_size), true),
        stat('Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size),
        stat('Early finds below floor', String(DATA.early_size)),
        stat('TVL under watch', fmtUsd(totalTvl)),
        stat('Median implied value', fmtUsd(median)),
        stat('Snapshot date', DATA.as_of),
      ]),
      tabs,
    ])]);
  }
  function footer() {
    return el('footer', {}, [
      el('p', { text: 'Data: ' + DATA.source + '. The watchlist floor is ' + fmtUsd(DATA.floor_usd) + ' of TVL; the board ranks it in full and adds every other rankable protocol that records no token.' }),
      el('p', { text: 'Implied value is this radar\u2019s own model claim (model ' + DATA.model_version + '), derived only from the snapshot above. It is not a prediction that any protocol will issue a token, and \u201crecords no token\u201d means the snapshot carries none — a protocol may still have one its record does not show.' }),
    ]);
  }
  function shell(main) {
    app.innerHTML = '';
    app.appendChild(header());
    var wrap = el('div', { class: 'wrap' }, [main, footer()]);
    app.appendChild(wrap);
    app.removeAttribute('aria-busy');
  }

  /* ---------- board view ---------- */
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (state.cat !== 'all' && (r.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }
  function sortedRows(list) {
    var key = state.sort, dir = state.dir;
    var val = {
      rank: function (r) { return r.rank; }, name: function (r) { return r.name.toLowerCase(); },
      cat: function (r) { return (r.category || 'Uncategorised').toLowerCase(); },
      tvl: function (r) { return r.tvl_usd; }, change: function (r) { return r.change_7d === null ? -1e9 : r.change_7d; },
      age: function (r) { return r.age_days === null ? -1 : r.age_days; },
      implied: function (r) { return r.implied_value_usd; }, score: function (r) { return r.radar_score; },
    }[key] || function (r) { return r.rank; };
    var ascending = key === 'rank' || key === 'name' || key === 'cat';
    return list.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      var cmp = x < y ? -1 : x > y ? 1 : a.rank - b.rank;
      return cmp * (ascending ? dir : -dir);
    });
  }
  function sortHead(key, label, cls) {
    var arrow = state.sort === key ? (state.dir === 1 ? ' \u25B2' : ' \u25BC') : '';
    return el('th', { class: cls || '' }, [el('button', { type: 'button', text: label + arrow, onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = 1; }
      go(boardHash());
    } })]);
  }
  function signals() {
    var byGrowth = DATA.rows.slice().sort(function (a, b) { return (b.change_7d || -999) - (a.change_7d || -999); })[0];
    var byTvl = DATA.rows.slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; })[0];
    var fresh = DATA.rows.filter(function (r) { return r.age_days !== null && r.age_days <= 120; }).sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; })[0];
    var hotCat = DATA.categories.filter(function (c) { return c.board_protocols > 0 && c.median_change_7d !== null; }).sort(function (a, b) { return b.median_change_7d - a.median_change_7d; })[0];
    function card(cls, k, row, d, fn) {
      return el('button', { type: 'button', class: 'signal ' + cls, onclick: fn }, [
        el('div', { class: 'k', text: k }), el('div', { class: 'v', text: row.name }), el('div', { class: 'd', text: d(row) }),
      ]);
    }
    return el('div', { class: 'signals' }, [
      card('', 'Signal · fastest riser', byGrowth, function (r) { return fmtPct(r.change_7d) + ' TVL in 7d · implied ' + fmtUsd(r.implied_value_usd); }, function () { state.sort = 'change'; state.dir = 1; go(boardHash()); }),
      card('amber', 'Signal · largest tokenless TVL', byTvl, function (r) { return fmtUsd(r.tvl_usd) + ' TVL · no token recorded'; }, function () { go('#/p/' + encodeURIComponent(byTvl.slug)); }),
      card('blue', 'Signal · fresh listing', fresh, function (r) { return 'tracked for ' + fmtAge(r.age_days) + ' · implied ' + fmtUsd(r.implied_value_usd); }, function () { state.sort = 'age'; state.dir = -1; go(boardHash()); }),
      hotCat ? card('blue', 'Signal · hottest category', { name: hotCat.category }, function () { return 'live ' + hotCat.category + ' protocols ' + fmtPct(hotCat.median_change_7d) + ' in 7d · ' + hotCat.board_protocols + ' on the board'; }, function () { state.cat = hotCat.category; state.tier = 'all'; go(boardHash()); }) : null,
    ]);
  }
  function boardView() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains; }))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name, slug, category\u2026', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; history.replaceState(null, '', boardHash()); renderBoardTable(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' }, [el('option', { value: 'all', text: 'All categories' })].concat(cats.map(function (c) { return el('option', { value: c, text: c, selected: c === state.cat ? 'selected' : null }); })));
    catSel.addEventListener('change', function () { state.cat = catSel.value; go(boardHash()); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' }, [el('option', { value: 'all', text: 'All chains' })].concat(chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; go(boardHash()); });
    function segBtn(tier, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tier === tier ? 'true' : 'false', text: label, onclick: function () { state.tier = tier; go(boardHash()); } });
    }
    var controls = el('div', { class: 'controls' }, [
      search, catSel, chainSel,
      el('span', { class: 'seg' }, [segBtn('all', 'All'), segBtn('watchlist', 'Watchlist'), segBtn('early', 'Early finds')]),
    ]);
    var tableHost = el('div', { id: 'table-host' });
    var main = el('div', {}, [signals(), controls, tableHost]);
    shell(main);
    renderBoardTable();
    function renderBoardTable() {
      var list = sortedRows(filteredRows());
      var maxTvl = Math.max.apply(null, DATA.rows.map(function (r) { return r.tvl_usd; }));
      var maxImp = Math.max.apply(null, DATA.rows.map(function (r) { return r.implied_value_usd; }));
      var count = el('p', { class: 'count-line' }, [
        el('b', { text: String(list.length) }), document.createTextNode(' of ' + DATA.board_size + ' ranked protocols · click a row for its detail, farm plan and model breakdown · click a column to sort'),
      ]);
      var host = document.getElementById('table-host');
      host.innerHTML = '';
      host.appendChild(count);
      if (list.length === 0) {
        host.appendChild(el('div', { class: 'empty' }, [
          el('p', { text: 'No protocol matches these filters.' }),
          el('button', { type: 'button', class: 'back', text: 'Clear filters', onclick: function () { state.q = ''; state.cat = 'all'; state.chain = 'all'; state.tier = 'all'; go('#/board'); } }),
        ]));
        return;
      }
      var rows = list.map(function (r) {
        var scoreCls = r.radar_score >= 65 ? 'score' : r.radar_score >= 45 ? 'score mid' : 'score low';
        return el('tr', { tabindex: '0', onclick: function () { go('#/p/' + encodeURIComponent(r.slug)); }, onkeydown: function (e) { if (e.key === 'Enter') go('#/p/' + encodeURIComponent(r.slug)); } }, [
          el('td', { class: 'rank', text: '#' + r.rank }),
          el('td', {}, [el('div', { class: 'pname', text: r.name }), el('div', { class: 'pslug', text: r.slug })]),
          el('td', { class: 'hide-s', text: r.category || 'Uncategorised' }),
          el('td', { class: 'chains hide-s', text: r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }),
          el('td', { class: 'num' }, [document.createTextNode(fmtUsd(r.tvl_usd)), el('div', { class: 'bar blue' }, [el('i', { style: 'width:' + Math.max(2, (r.tvl_usd / maxTvl) * 100) + '%' })])]),
          el('td', { class: pctClass(r.change_7d), text: fmtPct(r.change_7d) }),
          el('td', { class: 'num hide-s', text: fmtAge(r.age_days) }),
          el('td', { class: 'num' }, [el('b', { text: fmtUsd(r.implied_value_usd) }), el('div', { class: 'bar' }, [el('i', { style: 'width:' + Math.max(2, (r.implied_value_usd / maxImp) * 100) + '%' })])]),
          el('td', {}, [el('span', { class: scoreCls, text: String(r.radar_score) })]),
          el('td', { class: 'hide-s' }, [el('span', { class: r.tier === 'watchlist' ? 'tag' : 'tag early', text: r.tier === 'watchlist' ? 'WATCHLIST' : 'EARLY' })]),
        ]);
      });
      host.appendChild(el('table', { class: 'board' }, [
        el('thead', {}, [el('tr', {}, [
          sortHead('rank', '#'), sortHead('name', 'Protocol'), sortHead('cat', 'Category', 'hide-s'),
          el('th', { class: 'hide-s', text: 'Chains' }), sortHead('tvl', 'TVL', 'num'), sortHead('change', '7d %'),
          sortHead('age', 'Age', 'num hide-s'), sortHead('implied', 'Implied value', 'num'), sortHead('score', 'Score'), el('th', { class: 'hide-s', text: 'Tier' }),
        ])]),
        el('tbody', {}, rows),
      ]));
    }
  }

  /* ---------- detail view ---------- */
  function riskNotes(r) {
    var notes = [];
    if (r.age_days === null) notes.push(['amber', 'Age unknown: the snapshot gives no listing date, so the model scores endurance at its 365-day default and the farm plan holds 45 days. Treat the endurance factor as a placeholder, not evidence.']);
    else if (r.age_days < 180) notes.push(['amber', 'Young protocol: tracked for only ' + fmtAge(r.age_days) + '. Young protocols fail or pivot more often; the plan\u2019s longer 75-day hold is the price of that uncertainty.']);
    if (r.change_7d !== null && r.change_7d < -10) notes.push(['red', 'TVL is falling fast (' + fmtPct(r.change_7d) + ' in 7 days). The growth factor already discounts the implied value; a falling protocol can also mean users are leaving before any launch.']);
    if (r.chains.length <= 1) notes.push(['amber', 'Single-chain presence: the reach factor is at its floor. A launch, if it comes, likely starts and ends on ' + (r.chains[0] || 'one chain') + '.']);
    if (r.model.multiple_source === 'global') notes.push(['amber', 'Thin comp set: ' + (r.category || 'its category') + ' has ' + (r.model.comps_used === 0 ? 'no live-token protocols' : 'only ' + r.model.comps_used + ' live comp' + (r.model.comps_used === 1 ? '' : 's')) + ' in the snapshot, so the implied value uses the global median multiple (' + DATA.global_multiple + '\u00D7 TVL) instead of a category price. Read it as rougher than its neighbours.']);
    if (r.model.category_momentum_pct < -10) notes.push(['red', 'Cooling category: live ' + (r.category || 'Uncategorised') + ' protocols fell ' + fmtPct(r.model.category_momentum_pct) + ' in 7 days, so the momentum factor already discounts the implied value. A sector losing TVL can still launch a token — but it launches into a headwind.']);
    if (r.implied_value_usd / r.tvl_usd > 2) notes.push(['red', 'Rich implied multiple: the model prices this launch above 2\u00D7 current TVL. That is the category\u2019s market price carried over, not a promise — small errors in the multiple move this value a lot.']);
    if (notes.length === 0) notes.push(['amber', 'No structural flags: size, growth, age and reach are all inside the ranges the model handles well. The standing risk remains — the snapshot records no token, which is not proof none exists, and no model can say whether or when one is issued.']);
    return notes;
  }
  function detailView(slug) {
    var r = DATA.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) { shell(el('div', { class: 'empty', text: 'That protocol is not on the board.' })); return; }
    var recomputed = impliedOf(r, null);
    var comps = DATA.live.filter(function (l) { return (l.category || 'Uncategorised') === (r.category || 'Uncategorised'); }).slice(0, 5);
    function card(k, v, d) { return el('div', { class: 'card' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v }), d ? el('div', { class: 'd', text: d }) : null]); }
    function kv(label, value) { return el('tr', {}, [el('th', { text: label }), el('td', { text: value })]); }
    var parts = [['Size', r.score_parts.size, 30], ['Momentum', r.score_parts.momentum, 20], ['Endurance', r.score_parts.endurance, 20], ['Reach', r.score_parts.reach, 10], ['Category heat', r.score_parts.heat, 20]];
    var main = el('div', {}, [
      el('button', { type: 'button', class: 'back', text: '\u2190 Back to the board', onclick: function () { go(boardHash()); } }),
      el('div', { class: 'detail-head' }, [
        el('h1', { text: r.name }),
        el('span', { class: r.tier === 'watchlist' ? 'tag' : 'tag early', text: r.tier === 'watchlist' ? 'WATCHLIST' : 'EARLY FIND' }),
        el('span', { class: 'pslug', text: r.slug + ' · rank #' + r.rank + ' of ' + DATA.board_size }),
      ]),
      el('div', { class: 'grid' }, [
        card('Implied value', fmtUsd(r.implied_value_usd), 'model ' + DATA.model_version + ' · recomputed here: ' + fmtUsd(recomputed)),
        card('TVL', fmtUsd(r.tvl_usd), fmtPct(r.change_7d) + ' over 7 days'),
        card('Radar score', String(r.radar_score) + ' / 100', 'launch readiness, not value'),
        card('Tokenless for', fmtAge(r.age_days), r.listed_at ? 'tracked since ' + r.listed_at : 'listing date not recorded'),
      ]),
      el('h2', { class: 'sec', text: 'How the model prices this launch' }),
      el('table', { class: 'kv' }, [
        kv('Category multiple', r.model.multiple_source === 'category'
          ? r.model.category_multiple + '\u00D7 TVL — median of ' + r.model.comps_used + ' live ' + (r.category || 'Uncategorised') + ' comps'
          : r.model.category_multiple + '\u00D7 TVL — the global median: ' + (r.category || 'Uncategorised') + ' has only ' + r.model.comps_used + ' live comp' + (r.model.comps_used === 1 ? '' : 's') + ' in the snapshot'),
        kv('Base (TVL \u00D7 multiple)', fmtUsd(Math.round(r.tvl_usd * r.model.category_multiple))),
        kv('Growth factor', '\u00D7' + r.model.growth_multiplier + ' (7d change ' + fmtPct(r.model.growth_pct) + ', weight ' + M.growth_weight + ')'),
        kv('Endurance factor', '\u00D7' + r.model.endurance_multiplier + ' (' + fmtAge(r.age_days) + ' with no token)'),
        kv('Reach factor', '\u00D7' + r.model.reach_multiplier + ' (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ': ' + (r.chains.join(', ') || 'none recorded') + ')'),
        kv('Category momentum', '\u00D7' + r.model.momentum_multiplier + ' (live ' + (r.category || 'Uncategorised') + ' protocols moved ' + fmtPct(r.model.category_momentum_pct) + ' in 7 days' + (r.model.momentum_source === 'category' ? ', median of ' + r.model.momentum_comps + ' live comps' : ', the global median: too few live comps in this category') + ')'),
        kv('Implied value', fmtUsd(r.implied_value_usd)),
      ]),
      el('h2', { class: 'sec', text: 'Radar score breakdown' }),
      el('div', {}, parts.map(function (p) {
        return el('div', { class: 'part' }, [
          el('span', { class: 'lbl', text: p[0] }), el('span', { class: 'tr' }, [el('i', { style: 'width:' + (p[1] / p[2]) * 100 + '%' })]), el('span', { class: 'val', text: String(p[1]) }),
        ]);
      })),
      el('h2', { class: 'sec', text: 'Read the risks first' }),
      el('div', {}, riskNotes(r).map(function (n) { return el('div', { class: 'risk' + (n[0] === 'red' ? ' red' : ''), text: n[1] }); })),
      comps.length ? el('h2', { class: 'sec', text: 'Live comps in ' + (r.category || 'Uncategorised') + ' — where the multiple comes from' }) : null,
      comps.length ? el('table', { class: 'kv' }, comps.map(function (c) { return kv(c.name + (c.symbol ? ' (' + c.symbol + ')' : ''), 'mcap ' + fmtUsd(c.mcap_usd) + ' · TVL ' + fmtUsd(c.tvl_usd) + ' · ' + (c.tvl_multiple === null ? '—' : c.tvl_multiple + '\u00D7')); })) : null,
      el('h2', { class: 'sec', text: 'Farm plan — ' + r.farm_steps.length + ' steps' }),
      el('ol', { class: 'steps' }, r.farm_steps.map(function (s) { return el('li', { text: s }); })),
      el('p', { class: 'note', text: 'The plan is generated from this protocol\u2019s own record — its category sets the actions, its main chain (' + (r.chains[0] || 'its main chain') + ') sets the gas, its TVL sets the capital, its age sets the hold. It is a starting position, not financial advice.' }),
    ]);
    shell(main);
  }

  /* ---------- live view ---------- */
  function liveView() {
    var rows = DATA.live.map(function (l) {
      return el('tr', {}, [
        el('td', {}, [el('div', { class: 'pname', text: l.name }), el('div', { class: 'pslug', text: l.slug })]),
        el('td', { text: l.symbol || '—' }), el('td', { class: 'hide-s', text: l.category || 'Uncategorised' }),
        el('td', { class: 'num', text: fmtUsd(l.tvl_usd) }), el('td', { class: 'num', text: fmtUsd(l.mcap_usd) }),
        el('td', { class: 'num', text: l.tvl_multiple === null ? '—' : l.tvl_multiple + '\u00D7' }),
        el('td', { class: pctClass(l.change_7d), text: fmtPct(l.change_7d) }),
      ]);
    });
    shell(el('div', {}, [
      el('p', { class: 'note', text: 'These protocols already have a token that trades, so the radar never ranks them: the market has priced them itself. They are shown because they are the radar\u2019s evidence — each category\u2019s implied multiple on the board is the median of multiples like these, taken from this same snapshot.' }),
      el('table', { class: 'board' }, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Protocol' }), el('th', { text: 'Token' }), el('th', { class: 'hide-s', text: 'Category' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Mcap / TVL' }), el('th', { text: '7d %' })])]),
        el('tbody', {}, rows),
      ]),
    ]));
  }

  /* ---------- model view ---------- */
  var sb = { growth: M.growth_weight, endurance: 1, blend: 1 };
  function modelView() {
    var top10 = el('div', {});
    function drawTop() {
      var ranked = DATA.rows.map(function (r) { return { r: r, v: impliedOf(r, sb) }; }).sort(function (a, b) { return b.v - a.v || a.r.rank - b.r.rank; }).slice(0, 10);
      top10.innerHTML = '';
      top10.appendChild(el('table', { class: 'kv' }, ranked.map(function (x, i) {
        return el('tr', {}, [el('th', { text: '#' + (i + 1) + ' ' + x.r.name }), el('td', { text: fmtUsd(x.v) + (x.v === x.r.implied_value_usd ? '' : '  (board: ' + fmtUsd(x.r.implied_value_usd) + ')') })]);
      })));
    }
    function slider(label, key, min, max, step, fmt) {
      var val = el('b', { text: fmt(sb[key]) });
      var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(sb[key]), 'aria-label': label });
      input.addEventListener('input', function () { sb[key] = Number(input.value); val.textContent = fmt(sb[key]); drawTop(); });
      return el('div', { class: 'slider' }, [el('label', {}, [document.createTextNode(label + ' '), val]), input]);
    }
    var main = el('div', {}, [
      el('h2', { class: 'sec', text: 'The model, in full — ' + DATA.model_version }),
      el('div', { class: 'formula' }, [
        document.createTextNode('multiple(category) = median market-cap / TVL of the live-token protocols in it (global median '), el('b', { text: DATA.global_multiple + '\u00D7' }), document.createTextNode(' when a category has under ' + M.min_category_comps + ' comps), clamped to [' + M.multiple_floor + ', ' + M.multiple_cap + ']'),
        el('br'), document.createTextNode('implied = TVL \u00D7 multiple \u00D7 '), el('b', { text: 'growth' }), document.createTextNode(' \u00D7 '), el('b', { text: 'endurance' }), document.createTextNode(' \u00D7 '), el('b', { text: 'reach' }), document.createTextNode(' \u00D7 '), el('b', { text: 'momentum' }),
        el('br'), document.createTextNode('growth = 1 + clamp(7d change, ' + M.growth_floor + ', ' + M.growth_cap + ') / 100 \u00D7 ' + M.growth_weight),
        el('br'), document.createTextNode('endurance = ' + M.endurance_floor + ' + ' + M.endurance_range + ' \u00D7 min(tokenless days, ' + M.endurance_days + ') / ' + M.endurance_days + '  (unknown age counts ' + M.unknown_age_days + ' days)'),
        el('br'), document.createTextNode('reach = 1 + ' + M.reach_per_chain + ' \u00D7 min(chains \u2212 1, ' + M.reach_max_extra_chains + ')'),
        el('br'), document.createTextNode('momentum = 1 + clamp(category 7d change, ' + M.growth_floor + ', ' + M.growth_cap + ') / 100 \u00D7 ' + M.momentum_weight + '  (median 7d TVL change of the category\u2019s live-token protocols; the global median ' + fmtPct(DATA.global_momentum_pct) + ' when a category has under ' + M.min_category_comps + ' live comps reporting one)'),
      ]),
      el('p', { class: 'note', text: 'One function scores every protocol; no name is special-cased and no row is hand-picked. The board covers all ' + DATA.watchlist_size + ' watchlist protocols and adds ' + DATA.early_size + ' early finds below the ' + fmtUsd(DATA.floor_usd) + ' floor, excluding wrapped, staked, bridged and versioned products of tokens that already trade. The radar score (size 30, momentum 20, endurance 20, category heat 20, reach 10) grades launch readiness and never changes the ranking, which is by implied value alone.' }),
      el('h2', { class: 'sec', text: 'Re-run it yourself — the sandbox' }),
      el('p', { class: 'note', text: 'Move a weight and the top 10 re-ranks live, in this page only. board.json never changes: the sandbox exists so a reader can see exactly which assumptions the ranking stands on.' }),
      el('div', { class: 'sliders' }, [
        slider('Growth weight', 'growth', 0, 1, 0.05, function (v) { return v.toFixed(2); }),
        slider('Endurance strength', 'endurance', 0, 1, 0.05, function (v) { return Math.round(v * 100) + '%'; }),
        slider('Category blend (0 = global multiple)', 'blend', 0, 1, 0.05, function (v) { return Math.round(v * 100) + '%'; }),
      ]),
      top10,
      el('h2', { class: 'sec', text: 'Category multiples — the market\u2019s own prices, from this snapshot' }),
      el('table', { class: 'board' }, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live comps' }), el('th', { class: 'num', text: 'Median multiple' }), el('th', { class: 'num', text: 'Median 7d change' }), el('th', { class: 'num', text: 'Protocols on board' })])]),
        el('tbody', {}, DATA.categories.map(function (c) {
          return el('tr', {}, [el('td', { text: c.category }), el('td', { class: 'num', text: String(c.live_protocols) }), el('td', { class: 'num', text: c.median_multiple + '\u00D7' }), el('td', { class: pctClass(c.median_change_7d), text: fmtPct(c.median_change_7d) + (c.momentum_source === 'global' ? ' *' : '') }), el('td', { class: 'num', text: String(c.board_protocols) })]);
        })),
      ]),
      el('p', { class: 'note', text: '* A category with under ' + M.min_category_comps + ' live comps reporting a 7-day change uses the global median (' + fmtPct(DATA.global_momentum_pct) + ') for its momentum.' }),
    ]);
    shell(main);
    drawTop();
  }

  /* ---------- render ---------- */
  function render() {
    readHash();
    if (!DATA || !DATA.rows) { app.textContent = 'LaunchScope: no radar data (data.js) was written beside this page.'; return; }
    if (state.view === 'detail') detailView(state.slug);
    else if (state.view === 'live') liveView();
    else if (state.view === 'model') modelView();
    else boardView();
  }
  window.addEventListener('hashchange', render);
  render();
})();
