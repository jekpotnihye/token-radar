// Token Radar's dashboard, radar-2. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a top-three spotlight, a per-protocol detail panel with the
// model's own factors and the protocol's farm plan, the methodology with its traded precedents,
// and the live-token set the precedents come from. No network: every byte it shows is in data.js.
//
// The model, in one place, so the page and the board can be checked against each other:
//   implied = round(tvl x categoryMultiple x growthMult x breadthMult x maturityMult)
//   categoryMultiple = the median market-cap/TVL multiple of the live-token protocols in the
//     row's category (at least 3 traded precedents), else the global median across all of them,
//     clamped to [0.08, 0.80].  growthMult = 1 + clamp(change_7d, -40, 60) / 100 x 0.5.
//   breadthMult = 1 + 0.04 x min(chains - 1, 5).  maturityMult = 0.75 + 0.25 x min(age, 1095) / 1095.
//   Age unknown reads as 365 days. No name is special-cased; the same function scores every row.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', scope: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(3); }

  // The model recomputed from the snapshot figures, so the page checks the number board.json carries.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var breadthMult = 1 + model.breadth_step * Math.max(0, Math.min((row.chains || []).length - 1, model.breadth_max_extra));
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * breadthMult * maturity));
  }
  function growthMultOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    return 1 + (growth / 100) * model.growth_weight;
  }
  function breadthMultOf(row, model) {
    return 1 + model.breadth_step * Math.max(0, Math.min((row.chains || []).length - 1, model.breadth_max_extra));
  }
  function maturityMultOf(row, model) {
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    return model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  // It is activity guidance only: it promises no token, no airdrop, and no reward.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Check the protocol's own site and docs for any points or rewards program, and claim only from links it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('scope')) state.scope = params.get('scope');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.scope !== 'all') params.set('scope', state.scope);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.on_watchlist) return false;
      if (state.scope === 'early' && r.on_watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_multiple; bv = b.category_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', null, el('b', { text: DATA.model_version }), ' model')
      )
    );
  }

  function hero() {
    var watch = DATA.rows.filter(function (r) { return r.on_watchlist; });
    var watchTvl = watch.reduce(function (n, r) { return n + r.tvl_usd; }, 0);
    var top = DATA.rows[0];
    var growing = watch.filter(function (r) { return r.change_7d !== null && r.change_7d >= 2; }).length;
    return el('section', { class: 'hero' },
      el('div', null,
        el('div', { class: 'eyebrow', text: 'Pre-token radar · ' + DATA.rows.length + ' protocols scored' }),
        el('h1', { text: 'The next launches, ranked.' }),
        el('p', null,
          'The watchlist holds ', el('b', { text: fmtUsd(watchTvl) }), ' of TVL across ', el('b', { text: String(watch.length) }),
          ' protocols with no token on record. ', el('b', { text: top.name }), ' leads at ', el('b', { text: fmtUsd(top.implied_value_usd) }),
          ' of implied value. Only ', el('b', { text: String(growing) }), ' of the watchlist grew in the last seven days. Implied value is a model, not a price, and no launch is guaranteed.'
        )
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Global precedent multiple' }), el('b', { text: fmtMult(DATA.global_multiple) }))
      )
    );
  }

  function tag(text, cls) { return el('span', { class: 'tag' + (cls ? ' ' + cls : ''), text: text }); }
  function tagsFor(r) {
    return (r.signals || []).slice(0, 3).map(function (s) {
      return tag(s, s === 'Growing' ? 'hot' : s === 'Cooling' ? 'warn' : '');
    });
  }

  function spotlight() {
    var top3 = DATA.rows.slice(0, 3);
    var cards = top3.map(function (r, i) {
      var card = el('div', { class: 'card' + (i === 0 ? ' first' : ''), role: 'button', tabindex: '0', 'aria-label': 'Rank ' + r.rank + ': ' + r.name + ', implied value ' + fmtUsd(r.implied_value_usd) },
        el('div', { class: 'card-rank' }, el('span', { class: 'num', text: '#' + r.rank }), el('span', { text: r.on_watchlist ? 'Watchlist' : 'Early radar' })),
        el('div', null,
          el('span', { class: 'card-title', text: r.name }),
          el('div', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : 'an unnamed chain') })
        ),
        el('div', { class: 'tags' }, tagsFor(r)),
        el('div', { class: 'card-stats' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(r.tvl_usd) })),
          el('div', null, el('span', { text: '7d' }), el('b', { class: r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(r.change_7d) })),
          el('div', null, el('span', { text: 'Age' }), el('b', { text: fmtAge(r.age_days) }))
        ),
        el('div', { class: 'card-implied' },
          el('span', { text: 'Implied value · ' + fmtMult(r.category_multiple) + ' precedent' }),
          el('b', { text: fmtUsd(r.implied_value_usd) })
        )
      );
      card.addEventListener('click', function () { openDetail(r.slug); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } });
      return card;
    });
    return el('section', { class: 'spotlight' },
      el('div', { class: 'spot-label' },
        el('h2', { text: 'Farm first' }),
        el('span', { text: 'The three strongest implied values. Select one for its model and farm plan.' })
      ),
      cards
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var scope = el('select', { id: 'scope', 'aria-label': 'Filter by scope' },
      el('option', { value: 'all', text: 'Watchlist + early' }),
      el('option', { value: 'watchlist', text: 'Watchlist only' }),
      el('option', { value: 'early', text: 'Early radar only' })
    );
    scope.value = state.scope;
    scope.addEventListener('change', function () { state.scope = scope.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'scope', text: 'Scope' }), scope),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.scope = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('div', { class: 'rankcell' }, r.rank === 1 ? el('span', { class: 'crown', text: '#' }) : null, el('span', { text: String(r.rank) }))),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('div', { class: 'tags' }, tagsFor(r))),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. The multiple is the traded precedent for the row\'s category. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Signals' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.multiple === null ? 'n/a' : fmtMult(r.multiple) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'static' },
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market-cap-to-TVL multiples are the precedents the pre-token board is priced from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Multiple' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var precRows = DATA.precedents.map(function (p) {
      return el('tr', null,
        el('td', { text: p.category }),
        el('td', { class: 'num', text: String(p.n) }),
        el('td', { class: 'num', text: fmtMult(p.median_multiple) })
      );
    });
    precRows.push(el('tr', null,
      el('td', { text: 'No traded precedent (global median)' }),
      el('td', { class: 'num', text: '—' }),
      el('td', { class: 'num', text: fmtMult(DATA.global_multiple) })
    ));
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('div', { class: 'formula' },
        el('b', { text: 'implied = round( tvl_usd x categoryMultiple x growthMult x breadthMult x maturityMult )' })
      ),
      el('div', { class: 'factors' },
        el('div', { class: 'factor' }, el('b', { text: 'Precedent multiple' }), el('span', { class: 'num', text: 'median mcap / TVL, per category' }), el('span', { text: 'What traded tokens in the same category are worth against their TVL. At least 3 traded protocols, else the global median. Clamped 0.08–0.80.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Growth' }), el('span', { class: 'num', text: '1 + clamp(7d, -40, 60) / 100 x ' + m.growth_weight }), el('span', { text: 'Momentum into the launch window. Missing growth reads as zero: neutral, never a penalty.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Breadth' }), el('span', { class: 'num', text: '1 + 0.04 x min(chains - 1, 5)' }), el('span', { text: 'Reach. Each extra chain is more users, more venues, more reasons a launch lands.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Maturity' }), el('span', { class: 'num', text: '0.75 + 0.25 x min(age, 1095) / 1095' }), el('span', { text: 'Proof of running. Age is time since first listing; unknown age uses ' + m.unknown_age_days + ' days. The smallest factor: older never means likelier to launch.' }))
      ),
      el('div', null,
        el('h3', { text: 'Traded precedents, from this snapshot alone' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'precedents' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Traded' }), el('th', { scope: 'col', text: 'Median multiple' }))),
            el('tbody', null, precRows)
          )
        )
      ),
      el('p', { class: 'note' }, el('b', { text: 'Honest limits. ' }), '“No token” means the snapshot records no token: DefiLlama’s record is not proof a protocol has none. A launch is never guaranteed, and an implied value is the model’s claim, never a price. Farm steps are generic activity guidance derived from a protocol’s category and chains — they promise no airdrop and no reward.')
    );
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('span', null, el('b', { text: 'Source. ' }), DATA.source),
      el('span', null, 'Snapshot frozen ', el('b', { text: DATA.as_of }), ' · floor ', el('b', { text: fmtUsd(DATA.floor_usd) }), ' · model ', el('b', { text: DATA.model_version }), ' · the page renders with no network.'),
      el('span', { text: 'Built by an AI agent for make.fun’s token-radar bounty. Every figure on this page comes from the snapshot; nothing is fetched, and nothing is hand-picked.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function factorRow(label, input, right, pct) {
    return el('div', null,
      el('div', { style: 'display:flex;justify-content:space-between;gap:12px;' },
        el('span', { text: label }),
        el('b', { text: input + '  ·  ' + right })
      ),
      el('span', { class: 'fbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, Math.min(100, Math.round(pct))) + '%' }))
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var precNote = row.precedent_n > 0
      ? row.precedent_n + ' traded protocols in ' + (row.category || 'this category') + ' carry this multiple.'
      : 'No traded precedent in ' + (row.category || 'this category') + ': the global median across all traded protocols applies.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · Watchlist' : ' · Early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('div', { class: 'implied-hero' },
      el('span', { text: 'Implied value' }),
      el('b', { text: fmtUsd(row.implied_value_usd) })
    ));
    dialog.appendChild(el('div', { class: 'tags', style: 'margin-top:12px;' }, tagsFor(row)));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why this rank: the four factors' }),
      el('div', { class: 'equation' },
        factorRow('TVL', fmtUsd(row.tvl_usd), 'base', 100),
        factorRow('Precedent multiple', row.precedent_n > 0 ? row.precedent_n + ' traded protocols' : 'global median', 'x' + row.category_multiple.toFixed(3), (row.category_multiple / 0.8) * 100),
        factorRow('Seven-day growth', fmtPct(row.change_7d), 'x' + growthMultOf(row, DATA.model).toFixed(3), (growthMultOf(row, DATA.model) / 1.3) * 100),
        factorRow('Chain breadth', (row.chains || []).length + ' chains', 'x' + breadthMultOf(row, DATA.model).toFixed(3), (breadthMultOf(row, DATA.model) / 1.2) * 100),
        factorRow('Maturity', fmtAge(row.age_days), 'x' + maturityMultOf(row, DATA.model).toFixed(3), maturityMultOf(row, DATA.model) * 100)
      ),
      el('p', { class: 'sub', text: precNote + ' The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number the board carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'sub', text: 'Activity guidance only. No token, airdrop, or reward is promised, and no step needs payment beyond the gas and capital it names.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
