/* Mayfair Sports Capital: asset comparison tool.
   Reads the sample data embedded in #compare-data and draws into #compare.
   Everything shown here is illustrative; the data file is the only thing to swap.
*/
(function () {
  'use strict';

  const root = document.getElementById('compare');
  const dataEl = document.getElementById('compare-data');
  if (!root || !dataEl) return;

  let data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!data || !data.assets || !data.metrics) return;

  const metrics = data.metrics;
  const assets = data.assets;
  const clubs = assets.filter((a) => !a.peer); // the clubs on show; the rest only feed the peer median
  const MAX = clubs.length;
  const START = clubs.length;
  const byId = {};
  assets.forEach((a) => { byId[a.id] = a; });
  const metricById = {};
  metrics.forEach((m) => { metricById[m.id] = m; });

  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const state = {
    sel: clubs.slice(0, START).map((a) => a.id),
    metric: metrics[0].id,
    q: ''
  };
  let armed = reduce || !('IntersectionObserver' in window); // bars grow in once the tool is on screen
  let announce = false; // only speak after the person has done something

  /* ------------------------------------------------------------- helpers */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  const fmt = (v, m) => {
    if (!isNum(v)) return 'Not disclosed';
    const s = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: m.dp, maximumFractionDigits: m.dp });
    const isZero = Number(s.replace(/,/g, '')) === 0;
    let out = s;
    if (m.unit === '£m') out = '£' + s + 'm';
    else if (m.unit === '%') out = s + '%';
    else if (m.unit === 'x') out = s + 'x';
    return (v < 0 && !isZero ? '−' : '') + out;
  };

  const median = (arr) => {
    const a = arr.filter(isNum).sort((x, y) => x - y);
    const n = a.length;
    if (!n) return null;
    const h = n >> 1;
    return n % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
  };

  const medianFor = (m) => median(assets.map((a) => a.v[m.id]));
  const disclosedCount = (m) => assets.filter((a) => isNum(a.v[m.id])).length;

  const direction = (m) => {
    if (m.better === 'high') return 'Higher is better';
    if (m.better === 'low') return 'Lower is better';
    return 'Shown for context, not ranked';
  };

  const ICON_SEARCH = '<svg class="icon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 12l5 5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
  const ICON_X = '<svg class="icon" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.5 1.5l13 13M14.5 1.5l-13 13" stroke="currentColor" stroke-width="2" fill="none"/></svg>';

  /* ------------------------------------------------------------ skeleton */
  root.innerHTML = [
    '<div class="tool__head">',
    '  <h3 class="tool__title">Benchmark clubs</h3>',
    '  <p class="tool__sub">Below is an example of some of the data our platform shows: three clubs, each read against the typical club in its peer group, with the date and price of its last transaction.</p>',
    '  <span class="badge">Illustrative data' + (data.asOf ? ' \u00b7 ' + esc(data.asOf) : '') + '</span>',
    '</div>',
    '<div class="tool__body">',
    '  <div class="tool__side">',
    '    <p class="field-label" id="cmp-clubs">Clubs <span data-hint></span></p>',
    '    <ul class="asset-list" aria-labelledby="cmp-clubs" data-list></ul>',
    '    <p class="tool__empty" data-none hidden></p>',
    '    <input id="cmp-q" type="hidden">',
    '    <div data-chips hidden></div>',
    '  </div>',
    '  <div class="tool__main">',
    '    <p class="field-label">Figure</p>',
    '    <div class="metrics" role="group" aria-label="Figure" data-metrics></div>',
    '    <div class="chart">',
    '      <p class="chart__title" data-title></p>',
    '      <div class="bars" role="img" data-bars hidden></div>',
    '      <p class="chart__empty" data-empty hidden>Choose a club from the list to begin.</p>',
    '    </div>',
    '    <details class="allfig"><summary>See every figure side by side</summary>',
    '      <div class="table-wrap" tabindex="0" role="region" aria-label="Comparison table, scrolls sideways on small screens" data-table></div>',
    '    </details>',
    '    <p class="tool__note">Figures are illustrative and the clubs are not real. This is how we show the figures we gather.</p>',
    '    <div class="tool__live" aria-live="polite" aria-atomic="true" data-live></div>',
    '  </div>',
    '</div>'
  ].join('\n');

  const q = (sel) => root.querySelector(sel);
  const listEl = q('[data-list]');
  const noneEl = q('[data-none]');
  const hintEl = q('[data-hint]');
  const chipsEl = q('[data-chips]');
  const metricsEl = q('[data-metrics]');
  const titleEl = q('[data-title]');
  const barsEl = q('[data-bars]');
  const emptyEl = q('[data-empty]');
  const tableEl = q('[data-table]');
  const liveEl = q('[data-live]');
  const searchEl = q('#cmp-q');

  /* -------------------------------------------------------------- list */
  const itemEls = {};
  clubs.forEach((a) => {
    const li = document.createElement('li');
    li.innerHTML = '<button class="asset" type="button" aria-pressed="false" data-id="' + esc(a.id) + '">' +
      '<span class="asset__name">' + esc(a.name) + '</span>' +
      '<span class="asset__where">' + esc(a.where) + '</span>' +
      (a.tx ? '<span class="asset__tx"><span>Last transaction</span><b>' + esc(a.tx.date) + '</b><b>' + esc(a.tx.price) + '</b></span>' : '') +
      '<span class="asset__state" aria-hidden="true"></span></button>';
    listEl.appendChild(li);
    itemEls[a.id] = { li: li, btn: li.firstChild, state: li.querySelector('.asset__state') };
  });

  const syncList = () => {
    const full = state.sel.length >= MAX;
    const term = state.q.trim().toLowerCase();
    let shown = 0;
    clubs.forEach((a) => {
      const it = itemEls[a.id];
      const on = state.sel.indexOf(a.id) > -1;
      it.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      it.btn.disabled = full && !on;
      it.btn.title = full && !on ? 'Remove one to add another' : '';
      it.state.textContent = '';
      const match = !term || (a.name + ' ' + a.where).toLowerCase().indexOf(term) > -1;
      it.li.hidden = !match;
      if (match) shown += 1;
    });
    noneEl.hidden = shown > 0;
    hintEl.textContent = '';
  };

  /* ------------------------------------------------------------- chips */
  const syncChips = () => {
    if (!state.sel.length) {
      chipsEl.innerHTML = '<span class="chips__empty">No assets selected.</span>';
      return;
    }
    chipsEl.innerHTML = state.sel.map((id) => (
      '<button class="chip" type="button" data-remove="' + esc(id) + '" aria-label="Remove ' + esc(byId[id].name) + '">' +
      esc(byId[id].name) + ICON_X + '</button>'
    )).join('') + '<button class="chips__clear" type="button" data-clear>Clear all</button>';
  };

  /* ----------------------------------------------------------- metrics */
  metricsEl.innerHTML = metrics.map((m) => (
    '<button class="pill" type="button" aria-pressed="' + (m.id === state.metric ? 'true' : 'false') + '" data-metric="' + esc(m.id) + '">' + esc(m.label) + '</button>'
  )).join('');

  const syncMetrics = () => {
    $$('[data-metric]').forEach((b) => b.setAttribute('aria-pressed', b.getAttribute('data-metric') === state.metric ? 'true' : 'false'));
  };
  function $$(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  /* ------------------------------------------------------------- chart */
  const rows = {}; // asset id -> row element (kept between renders so bars can animate)
  let plotEl = null;
  let medianEl = null;
  let zeroEl = null;
  let medianTag = null;

  const ensurePlot = () => {
    if (plotEl) return;
    plotEl = document.createElement('div');
    plotEl.className = 'bars__plot';
    plotEl.setAttribute('aria-hidden', 'true');
    zeroEl = document.createElement('span');
    zeroEl.className = 'zero';
    medianEl = document.createElement('span');
    medianEl.className = 'median';
    medianTag = document.createElement('span');
    medianTag.className = 'median__tag';
    medianEl.appendChild(medianTag);
    plotEl.appendChild(zeroEl);
    plotEl.appendChild(medianEl);
    barsEl.appendChild(plotEl);
  };

  const makeRow = (a) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = '<div class="bar-row__label">' + esc(a.name) + '<small>' + esc(a.where) + '</small></div>' +
      '<div class="bar-row__track"><span class="bar"></span><span class="bar-row__na">Not disclosed</span></div>' +
      '<div class="bar-val"></div>';
    return row;
  };

  const domainFor = (m, values, med) => {
    const all = values.filter(isNum).concat(isNum(med) ? [med] : []);
    let lo = Math.min.apply(null, [0].concat(all));
    let hi = Math.max.apply(null, [0].concat(all));
    if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * 0.04;
    if (hi > 0) hi += pad;
    if (lo < 0) lo -= pad;
    return { lo: lo, hi: hi };
  };

  const pct = (v, dom) => ((v - dom.lo) / (dom.hi - dom.lo)) * 100;
  const r1 = (n) => Math.round(n * 10) / 10;

  const renderChart = () => {
    const m = metricById[state.metric];
    const med = medianFor(m);
    const sel = state.sel.map((id) => byId[id]);

    titleEl.innerHTML = '<strong>' + esc(m.label) + ' (' + esc(m.unit === '£m' ? '£m' : m.unit) + ')</strong>' +
      '<span>' + esc(direction(m)) + ' · Typical for similar clubs ' + esc(fmt(med, m)) + '</span>' +
      (m.why ? '<em class="chart__why">' + esc(m.why) + '</em>' : '');

    if (!sel.length) {
      barsEl.hidden = true;
      emptyEl.hidden = false;
      Object.keys(rows).forEach((id) => { rows[id].remove(); delete rows[id]; });
      return;
    }
    barsEl.hidden = false;
    emptyEl.hidden = true;
    ensurePlot();

    const dom = domainFor(m, sel.map((a) => a.v[m.id]), med);
    const zero = pct(0, dom);

    // drop rows for assets no longer selected
    Object.keys(rows).forEach((id) => {
      if (state.sel.indexOf(id) === -1) { rows[id].remove(); delete rows[id]; }
    });

    sel.forEach((a) => {
      let row = rows[a.id];
      const fresh = !row;
      if (fresh) {
        row = makeRow(a);
        rows[a.id] = row;
        const bar0 = row.querySelector('.bar');
        bar0.style.left = r1(zero) + '%';
        bar0.style.width = '0%';
        barsEl.insertBefore(row, plotEl);
        void row.offsetWidth; // let the starting state paint so the bar can grow
      }
      const v = a.v[m.id];
      const bar = row.querySelector('.bar');
      const val = row.querySelector('.bar-val');
      if (!isNum(v)) {
        row.classList.add('is-na');
        val.textContent = '';
      } else {
        row.classList.remove('is-na');
        const p = pct(v, dom);
        const left = v >= 0 ? zero : p;
        const width = Math.abs(p - zero);
        bar.classList.toggle('is-neg', v < 0);
        bar.style.left = r1(armed ? left : zero) + '%';
        bar.style.width = r1(armed ? width : 0) + '%';
        val.textContent = fmt(v, m);
      }
    });

    // keep DOM order equal to selection order
    sel.forEach((a) => { barsEl.insertBefore(rows[a.id], plotEl); });

    // zero line and median line
    zeroEl.style.display = dom.lo < 0 ? '' : 'none';
    zeroEl.style.left = r1(zero) + '%';
    if (isNum(med)) {
      const mp = pct(med, dom);
      medianEl.style.display = '';
      medianEl.style.left = r1(mp) + '%';
      medianTag.textContent = 'Typical ' + fmt(med, m);
      medianEl.setAttribute('data-align', mp > 80 ? 'right' : (mp < 20 ? 'left' : 'mid'));
    } else {
      medianEl.style.display = 'none';
    }

    barsEl.setAttribute('aria-label', 'Bar chart of ' + m.label + ' (' + m.unit + '): ' +
      sel.map((a) => a.name + ' ' + fmt(a.v[m.id], m)).join(', ') + '. Typical for similar clubs ' + fmt(med, m) + '.');
  };

  /* ------------------------------------------------------------- table */
  const bestIds = (m, sel) => {
    if (!m.better || sel.length < 2) return [];
    const vals = sel.filter((a) => isNum(a.v[m.id]));
    if (vals.length < 2) return [];
    const target = m.better === 'high'
      ? Math.max.apply(null, vals.map((a) => a.v[m.id]))
      : Math.min.apply(null, vals.map((a) => a.v[m.id]));
    return vals.filter((a) => a.v[m.id] === target).map((a) => a.id);
  };

  const renderTable = () => {
    const sel = state.sel.map((id) => byId[id]);
    if (!sel.length) { tableEl.hidden = true; return; }
    tableEl.hidden = false;

    let html = '<table class="cmp"><caption class="sr-only">Selected clubs against the typical figure for similar clubs' + (data.asOf ? ', ' + esc(data.asOf) : '') + '. Illustrative data.</caption><thead><tr><th scope="col">Figure</th>';
    sel.forEach((a) => { html += '<th scope="col">' + esc(a.name) + '<small>' + esc(a.where) + '</small></th>'; });
    html += '<th scope="col">Typical<small>for similar clubs</small></th></tr></thead><tbody>';
    html += '<tr><th scope="row">Last transaction</th>' + sel.map((a) => '<td>' + esc(a.tx ? a.tx.date : 'Not disclosed') + '</td>').join('') + '<td class="is-median"></td></tr>';
    html += '<tr><th scope="row">Transaction price</th>' + sel.map((a) => '<td>' + esc(a.tx ? a.tx.price : 'Not disclosed') + '</td>').join('') + '<td class="is-median"></td></tr>';
    metrics.forEach((m) => {
      const best = bestIds(m, sel);
      html += '<tr' + (m.id === state.metric ? ' class="is-active"' : '') + '><th scope="row">' + esc(m.label) + '</th>';
      sel.forEach((a) => {
        const v = a.v[m.id];
        const cls = !isNum(v) ? 'is-na' : (best.indexOf(a.id) > -1 ? 'is-best' : '');
        html += '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(fmt(v, m)) +
          (cls === 'is-best' ? '<span class="sr-only"> (best of the selection)</span>' : '') + '</td>';
      });
      html += '<td class="is-median">' + esc(fmt(medianFor(m), m)) + '</td></tr>';
    });
    html += '</tbody></table>';
    tableEl.innerHTML = html;
  };

  /* ------------------------------------------------------------ render */
  const say = (text) => {
    if (!announce) return;
    liveEl.textContent = '';
    window.setTimeout(() => { liveEl.textContent = text; }, 40);
  };

  const renderAll = () => {
    syncList();
    syncChips();
    syncMetrics();
    renderChart();
    renderTable();
  };

  /* ------------------------------------------------------------ events */
  const toggle = (id) => {
    const i = state.sel.indexOf(id);
    if (i > -1) {
      state.sel.splice(i, 1);
      say(byId[id].name + ' removed. ' + state.sel.length + ' of ' + MAX + ' selected.');
    } else if (state.sel.length < MAX) {
      state.sel.push(id);
      say(byId[id].name + ' added. ' + state.sel.length + ' of ' + MAX + ' selected.');
    }
    renderAll();
  };

  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('.asset');
    if (!b || b.disabled) return;
    announce = true;
    toggle(b.getAttribute('data-id'));
  });

  chipsEl.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    const clr = e.target.closest('[data-clear]');
    if (!rm && !clr) return;
    announce = true;
    if (rm) {
      toggle(rm.getAttribute('data-remove'));
    } else {
      state.sel = [];
      say('All assets cleared.');
      renderAll();
    }
    // the button that had focus has just been replaced: put focus somewhere sensible
    const next = chipsEl.querySelector('.chip') || searchEl;
    next.focus();
  });

  metricsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-metric]');
    if (!b) return;
    announce = true;
    state.metric = b.getAttribute('data-metric');
    const m = metricById[state.metric];
    say('Showing ' + m.label + '. Typical for similar clubs ' + fmt(medianFor(m), m) + '.');
    renderAll();
  });

  searchEl.addEventListener('input', () => {
    state.q = searchEl.value;
    syncList();
  });

  /* ------------------------------------------------------------ start */
  renderAll();

  if (!armed) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        armed = true;
        io.disconnect();
        renderChart();
      }
    }, { threshold: 0.25 });
    io.observe(root);
  }
})();
