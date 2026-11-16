/* Mayfair Sports Capital: site behaviour. No dependencies, no frameworks.
   - header turns solid on scroll
   - left-hand menu drawer (focus trap, Esc, inert page behind, scroll lock)
   - reveal-on-scroll
   - cookie consent and consent-gated Google Analytics
   - contact form -> HubSpot Forms API
*/
(function () {
  'use strict';

  window.__msc = true; // lets the page know this script ran (see the failsafe in the base template)

  // A fresh page always opens at the top (some embedded viewers keep the previous page's scroll position).
  try {
    const nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || null;
    if (!location.hash && (!nav || nav.type === 'navigate')) {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      const toTop = () => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; };
      toTop();
      window.setTimeout(toTop, 60);
    }
  } catch (e) { /* ignore */ }

  const doc = document;
  const root = doc.documentElement;
  const body = doc.body;
  const mode = body.getAttribute('data-mode') || 'prod';
  const gaId = body.getAttribute('data-ga') || '';
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const $ = (sel, ctx) => (ctx || doc).querySelector(sel);
  const $$ = (sel, ctx) => Array.prototype.slice.call((ctx || doc).querySelectorAll(sel));

  /* Storage can throw (private windows, blocked site data), so never trust it. */
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  /* ---------------------------------------------------------------- header */
  const header = $('.site-header');
  if (header) {
    let ticking = false;
    const update = () => {
      header.classList.toggle('is-solid', (window.pageYOffset || root.scrollTop) > 24);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ----------------------------------------------------------------- menu */
  const drawer = $('#menu');
  const scrim = $('.scrim');
  const openers = $$('[data-menu-open]');
  let lastFocus = null;
  let subOpen = null;     // the open sub-panel element
  let subOpener = null;   // the button that opened it

  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  const closeSub = (restoreFocus) => {
    if (!subOpen) return;
    const panel = subOpen;
    panel.classList.remove('is-open');
    drawer.classList.remove('has-sub');
    if (subOpener) subOpener.setAttribute('aria-expanded', 'false');
    const done = () => { panel.hidden = true; };
    if (reduce) done(); else window.setTimeout(done, 420);
    if (restoreFocus !== false && subOpener) subOpener.focus();
    subOpen = null; subOpener = null;
  };

  const openSub = (btn) => {
    const panel = doc.getElementById(btn.getAttribute('data-sub-open'));
    if (!panel) return;
    subOpen = panel; subOpener = btn;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => {
      panel.classList.add('is-open');
      drawer.classList.add('has-sub');
      const back = $('.drawer__back', panel);
      if (back) back.focus();
    });
  };

  const setInert = (on) => {
    $$('[data-inertable], #consent').forEach((el) => {
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  };

  const openMenu = () => {
    if (!drawer || drawer.classList.contains('is-open')) return;
    lastFocus = doc.activeElement;
    drawer.classList.add('is-open');
    if (scrim) scrim.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    root.classList.add('menu-open');
    openers.forEach((b) => b.setAttribute('aria-expanded', 'true'));
    setInert(true);
    window.requestAnimationFrame(() => {
      const c = $('.drawer__close', drawer);
      if (c) c.focus();
    });
  };

  const closeMenu = (restoreFocus) => {
    if (!drawer || !drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    if (scrim) scrim.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    root.classList.remove('menu-open');
    openers.forEach((b) => b.setAttribute('aria-expanded', 'false'));
    setInert(false);
    closeSub(false);
    if (restoreFocus !== false && lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  };

  if (drawer) {
    openers.forEach((b) => b.addEventListener('click', openMenu));
    $$('[data-menu-close]').forEach((b) => b.addEventListener('click', () => closeMenu(true)));
    // Following a link closes the drawer (needed for links to a section on the same page).
    $$('a', drawer).forEach((a) => a.addEventListener('click', () => closeMenu(false)));

    $$('[data-sub-open]', drawer).forEach((b) => b.addEventListener('click', () => openSub(b)));
    $$('[data-sub-close]', drawer).forEach((b) => b.addEventListener('click', () => closeSub(true)));

    doc.addEventListener('keydown', (e) => {
      if (!drawer.classList.contains('is-open')) return;
      if (e.key === 'Escape') { e.preventDefault(); if (subOpen) closeSub(true); else closeMenu(true); return; }
      if (e.key !== 'Tab') return;
      const items = $$('a[href], button:not([disabled])', drawer).filter(visible);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!drawer.contains(doc.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // Back/forward cache: never come back to an open drawer.
    window.addEventListener('pageshow', (e) => { if (e.persisted) closeMenu(false); });
  }

  /* ------------------------------------------------- moving between pages */
  const sameSite = (a) => {
    if (!a || a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('href') === null) return false;
    let u; try { u = new URL(a.href, location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) return false;
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return false; // in-page jump
    return true;
  };

  // Prefetch a page the first time the pointer rests on a link to it.
  const fetched = {};
  const prefetch = (a) => {
    if (!sameSite(a)) return;
    const key = a.href.split('#')[0];
    if (fetched[key] || key === location.href.split('#')[0]) return;
    fetched[key] = true;
    const l = doc.createElement('link');
    l.rel = 'prefetch'; l.href = key; l.as = 'document';
    doc.head.appendChild(l);
  };
  doc.addEventListener('mouseover', (e) => { const a = e.target.closest && e.target.closest('a[href]'); if (a) prefetch(a); }, { passive: true });
  doc.addEventListener('touchstart', (e) => { const a = e.target.closest && e.target.closest('a[href]'); if (a) prefetch(a); }, { passive: true });

  // Browsers with cross-document view transitions animate through CSS (@view-transition).
  // Elsewhere, fade the page out before leaving and in on arrival.
  const hasVT = 'onpagereveal' in window;
  if (!hasVT && !reduce) {
    root.classList.add('vt-fallback');
    doc.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || !sameSite(a)) return;
      e.preventDefault();
      root.classList.add('is-leaving');
      window.setTimeout(() => { location.href = a.href; }, 230);
    });
    window.addEventListener('pageshow', (e) => { if (e.persisted) root.classList.remove('is-leaving'); });
  }

  /* ------------------------------------------------------------- counters */
  const counters = $$('.stat__n');
  const runCounter = (el) => {
    const raw = el.textContent.trim();
    const m = raw.match(/^([^\d]*)(\d[\d,.]*)(.*)$/);
    if (!m) return;
    const target = parseFloat(m[2].replace(/,/g, ''));
    const dp = (m[2].split('.')[1] || '').length;
    const t0 = performance.now();
    const dur = 1100;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = m[1] + (target * eased).toFixed(dp) + m[3];
      if (k < 1) window.requestAnimationFrame(step); else el.textContent = raw;
    };
    el.textContent = m[1] + (0).toFixed(dp) + m[3];
    window.requestAnimationFrame(step);
  };
  if (counters.length && !reduce && 'IntersectionObserver' in window) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { runCounter(en.target); cio.unobserve(en.target); } });
    }, { threshold: 0.6 });
    counters.forEach((el) => cio.observe(el));
  }

  /* ------------------------------------------------------- hero parallax */
  const heroImg = $('.hero__img');
  if (heroImg && !reduce) {
    let raf = false;
    const move = () => {
      const y = window.pageYOffset || root.scrollTop;
      const h = heroImg.parentElement.offsetHeight || 1;
      if (y < h) heroImg.style.transform = 'translate3d(0,' + Math.round(y * 0.18) + 'px,0) scale(1.08)';
      raf = false;
    };
    window.addEventListener('scroll', () => { if (!raf) { raf = true; window.requestAnimationFrame(move); } }, { passive: true });
  }

  /* --------------------------------------------------------------- reveal */
  const revealEls = $$('[data-reveal]');
  if (revealEls.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      revealEls.forEach((el) => el.classList.add('is-in'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      revealEls.forEach((el) => io.observe(el));
    }
  }

  /* ------------------------------------------------- bios: read more */
  $$('[data-more]').forEach((btn) => {
    const more = doc.getElementById(btn.getAttribute('aria-controls'));
    if (!more) return;
    btn.addEventListener('click', () => {
      const open = !more.classList.contains('is-open');
      more.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Read less' : 'Read more';
    });
  });

  /* ---------------------------------------------------- headline words */
  const h1 = $('.hero .h1, .chapter--page .chapter__h');
  if (h1 && !reduce) {
    const text = h1.textContent.trim();
    h1.setAttribute('aria-label', text);
    h1.textContent = '';
    text.split(/\s+/).forEach((w, i) => {
      const o = doc.createElement('span'); o.className = 'w'; o.setAttribute('aria-hidden', 'true');
      const n = doc.createElement('span'); n.textContent = w; n.style.setProperty('--d', (150 + i * 110) + 'ms');
      o.appendChild(n); h1.appendChild(o); h1.appendChild(doc.createTextNode(' '));
    });
    h1.classList.add('is-split');
    void h1.offsetWidth; // paint the masked start before the words rise
    window.setTimeout(() => h1.classList.add('is-ready'), 60);
    // once the words have risen, drop the mask so no letter is clipped
    window.setTimeout(() => h1.classList.add('is-done'), 60 + 150 + h1.children.length * 110 + 1200);
  }

  /* ------------------------------------------ scroll-linked motion */
  const bar = doc.createElement('div');
  bar.className = 'scroll-progress'; bar.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(bar);
  const pars = $$('[data-par]');
  const chInv = doc.getElementById('investors');
  const chOwn = doc.getElementById('owners');
  let sw = null, swA = null, swB = null;
  if (chInv && chOwn) {
    sw = doc.createElement('nav');
    sw.className = 'sideswitch'; sw.setAttribute('aria-label', 'Jump to');
    sw.innerHTML = '<a href="#investors">For investors</a><a href="#owners">For sports owners</a>';
    doc.body.appendChild(sw);
    swA = sw.children[0]; swB = sw.children[1];
  }
  const ctaMedia = $('.cta__media');
  const rail = $('[data-rail]');
  const railI = rail && $('i', rail);
  const railB = rail && $('b', rail);
  let sraf = false;
  const onScroll = () => {
    sraf = false;
    const y = window.pageYOffset || root.scrollTop;
    const vh = window.innerHeight;
    const max = root.scrollHeight - vh;
    bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
    if (sw) {
      const mid = vh * 0.5;
      const invTop = chInv.getBoundingClientRect().top;
      const ownTop = chOwn.getBoundingClientRect().top;
      const end = (doc.querySelector('.cta') || doc.querySelector('.site-footer')).getBoundingClientRect().top;
      sw.classList.toggle('is-on', y > vh * 0.6 && end > vh * 0.9);
      const side = ownTop <= mid ? 'b' : (invTop <= mid ? 'a' : '');
      swA.setAttribute('aria-current', side === 'a' ? 'true' : 'false');
      swB.setAttribute('aria-current', side === 'b' ? 'true' : 'false');
    }
    if (reduce) return;
    pars.forEach((p) => {
      const r = p.parentElement.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) p.style.transform = 'translate3d(0,' + ((r.top + r.height / 2 - vh / 2) * -0.12).toFixed(1) + 'px,0)';
    });
    if (ctaMedia) {
      const r = ctaMedia.parentElement.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) ctaMedia.style.transform = 'translate3d(0,' + ((r.top + r.height / 2 - vh / 2) * -0.14).toFixed(1) + 'px,0)';
    }
    if (rail) {
      const rr = rail.getBoundingClientRect();
      const q = Math.max(0, Math.min(1, (vh * 0.88 - rr.top) / (vh * 0.5)));
      railI.style.transform = 'scaleX(' + q + ')';
      railB.style.left = (q * 100) + '%';
    }
  };
  window.addEventListener('scroll', () => { if (!sraf) { sraf = true; window.requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ------------------------------------------------ typed statement */
  $$('[data-type]').forEach((el) => {
    if (reduce || !('IntersectionObserver' in window)) return;
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    const out = doc.createElement('span'); out.setAttribute('aria-hidden', 'true');
    const caret = doc.createElement('span'); caret.className = 'caret'; caret.setAttribute('aria-hidden', 'true');
    el.textContent = ''; el.appendChild(out); el.appendChild(caret);
    let started = false;
    const tio = new IntersectionObserver((es) => {
      if (started || !es.some((e) => e.isIntersecting)) return;
      started = true; tio.disconnect();
      let i = 0;
      const tick = () => {
        i += 1; out.textContent = text.slice(0, i);
        if (i < text.length) window.setTimeout(tick, text[i - 1] === ' ' ? 18 : 26 + Math.random() * 22);
      };
      window.setTimeout(tick, 250);
    }, { threshold: 0.35 });
    tio.observe(el);
  });

  /* --------------------------------------------- data field (canvas) */
  const fieldCv = $('[data-field]');
  if (fieldCv && fieldCv.getContext) {
    const host = fieldCv.parentElement;
    const ctx = fieldCv.getContext('2d');
    // The points settle into a sport drawn from above, then move on to the next: a handful of sports, one after another.
    const TAU = 6.2832;
    const mk = (name, w, h, draw) => {
      const s = [], step = w / 88;
      const L = (xa, ya, xb, yb) => { const n = Math.max(1, Math.round(Math.hypot(xb - xa, yb - ya) / step)); for (let q = 0; q <= n; q++) s.push([xa + (xb - xa) * q / n, ya + (yb - ya) * q / n]); };
      const A = (cx, cy, rx, ry, a0, a1) => { const n = Math.max(2, Math.round(Math.abs(a1 - a0) * (rx + ry) / 2 / step)); for (let q = 0; q <= n; q++) { const a = a0 + (a1 - a0) * q / n; s.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } };
      const B = (xa, ya, xb, yb) => { L(xa, ya, xb, ya); L(xb, ya, xb, yb); L(xb, yb, xa, yb); L(xa, yb, xa, ya); };
      // smooth curve through a list of points
      const P = (p, closed) => {
        const n = p.length, at = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
        for (let i = 0; i < (closed ? n : n - 1); i++) {
          const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
          const m = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
          for (let q = 0; q < m; q++) {
            const u = q / m, u2 = u * u, u3 = u2 * u;
            s.push([0.5 * (2 * p1[0] + (p2[0] - p0[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * u3),
              0.5 * (2 * p1[1] + (p2[1] - p0[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * u3)]);
          }
        }
        if (!closed) s.push(p[n - 1]);
      };
      draw(L, A, B, P);
      return { name: name, w: w, h: h, s: s };
    };
    const SHAPES = [
      mk('Football', 105, 68, (L, A, B) => { B(0, 0, 105, 68); L(52.5, 0, 52.5, 68); A(52.5, 34, 9.15, 9.15, 0, TAU);
        B(0, 13.85, 16.5, 54.15); B(88.5, 13.85, 105, 54.15); B(0, 24.85, 5.5, 43.15); B(99.5, 24.85, 105, 43.15);
        A(11, 34, 9.15, 9.15, -0.925, 0.925); A(94, 34, 9.15, 9.15, Math.PI - 0.925, Math.PI + 0.925); }),
      mk('Tennis', 23.77, 10.97, (L, A, B) => { B(0, 0, 23.77, 10.97); L(0, 1.37, 23.77, 1.37); L(0, 9.6, 23.77, 9.6);
        L(5.485, 1.37, 5.485, 9.6); L(18.285, 1.37, 18.285, 9.6); L(5.485, 5.485, 18.285, 5.485); L(11.885, -0.7, 11.885, 11.67); }),
      mk('Athletics', 100, 58, (L, A) => { for (let i = 0; i < 4; i++) { const r = 14 + i * 4.6;
        L(27, 29 - r, 73, 29 - r); A(73, 29, r, r, -Math.PI / 2, Math.PI / 2); L(73, 29 + r, 27, 29 + r); A(27, 29, r, r, Math.PI / 2, Math.PI * 1.5); } }),
      mk('Basketball', 28, 15, (L, A, B) => { B(0, 0, 28, 15); L(14, 0, 14, 15); A(14, 7.5, 1.8, 1.8, 0, TAU);
        B(0, 5.05, 5.8, 9.95); B(22.2, 5.05, 28, 9.95); A(5.8, 7.5, 1.8, 1.8, -Math.PI / 2, Math.PI / 2); A(22.2, 7.5, 1.8, 1.8, Math.PI / 2, Math.PI * 1.5);
        L(0, 0.9, 2.99, 0.9); L(0, 14.1, 2.99, 14.1); A(1.575, 7.5, 6.75, 6.75, -1.36, 1.36);
        L(28, 0.9, 25.01, 0.9); L(28, 14.1, 25.01, 14.1); A(26.425, 7.5, 6.75, 6.75, Math.PI - 1.36, Math.PI + 1.36);
        A(1.575, 7.5, 0.45, 0.45, 0, TAU); A(26.425, 7.5, 0.45, 0.45, 0, TAU); }),
      // swimming: a 50m pool, eight lanes, lane ropes and the T at each end
      mk('Swimming', 50, 25, (L, A, B) => { B(0, 0, 50, 25); for (let i = 1; i < 8; i++) { const y = i * 25 / 8; L(0, y, 50, y); }
        for (let i = 0; i < 8; i++) { const y = (i + 0.5) * 25 / 8; L(0, y, 2.2, y); L(47.8, y, 50, y); L(2.2, y - 0.6, 2.2, y + 0.6); L(47.8, y - 0.6, 47.8, y + 0.6); }
        L(15, 0, 15, 0.9); L(35, 0, 35, 0.9); L(15, 25, 15, 24.1); L(35, 25, 35, 24.1); })
    ];
    const N = Math.max.apply(null, SHAPES.map((sh) => sh.s.length));
    const HOLD = 3.4;
    let W = 0, H = 0, dpr = 1, pts = [], visible = false, running = false, mx = -9999, my = -9999, t = 0;
    let cur = 0, ms = -99, box = null;
    const target = (si, i) => {
      const sh = SHAPES[si], q = sh.s[i % sh.s.length], u = Math.min(box.w / sh.w, box.h / sh.h);
      return [box.cx - sh.w * u / 2 + q[0] * u, box.cy - sh.h * u / 2 + q[1] * u];
    };
    const build = () => {
      const r = host.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      fieldCv.width = Math.round(W * dpr); fieldCv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const narrow = W < 900;
      const bw = narrow ? W * 0.84 : Math.min(W * 0.4, 560), bh = narrow ? bw * 0.62 : Math.min(H * 0.56, bw * 0.68);
      box = { w: bw, h: bh, cx: narrow ? W / 2 : W * 0.95 - bw / 2, cy: narrow ? H - bh / 2 - 54 : H / 2 };
      pts = [];
      for (let i = 0; i < N; i++) {
        const q = target(cur, i);
        pts.push({ fx: q[0], fy: q[1], tx: q[0], ty: q[1], sx: Math.random() * W, sy: Math.random() * H,
          ph: Math.random() * 6.283, sp: 0.2 + Math.random() * 0.5, d: Math.random() * 0.45, ox: 0, oy: 0, a: 0.55 + Math.random() * 0.45 });
      }
      ms = -99;
    };
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const frame = (now) => {
      running = false;
      const r = host.getBoundingClientRect(), vh = window.innerHeight;
      // 0 while the section is arriving, 1 once it sits in the middle of the screen,
      // then back to 0 as it scrolls away, so the picture breaks up again on the way out
      const into = clamp((vh * 0.85 - r.top) / (vh * 0.75)), away = clamp((r.bottom - vh * 0.15) / (vh * 0.6));
      const goal = reduce ? 1 : Math.min(into, away);
      t += (goal - t) * 0.08;
      ctx.clearRect(0, 0, W, H);
      const time = now / 1000, ds = W < 900 ? 2 : 3;
      if (ms < 0 || (cur === 0 && t <= 0.95 && !reduce)) ms = time - 1.6; // the first picture holds once it has formed
      if (!reduce && t > 0.95 && time - ms > HOLD) {
        cur = (cur + 1) % SHAPES.length; ms = time;
        for (let i = 0; i < pts.length; i++) { const p = pts[i], q = target(cur, i); p.fx = p.tx; p.fy = p.ty; p.tx = q[0]; p.ty = q[1]; }
      }
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const k = ease(clamp((t - p.d * 0.5) / (1 - p.d * 0.5)));
        const m = ease(clamp((time - ms - p.d * 0.7) / 1.1));
        const bx = p.fx + (p.tx - p.fx) * m, by = p.fy + (p.ty - p.fy) * m;
        const dx = Math.cos(time * p.sp + p.ph) * 26 * (1 - k), dy = Math.sin(time * p.sp * 0.8 + p.ph) * 26 * (1 - k);
        let x = p.sx + (bx - p.sx) * k + dx, y = p.sy + (by - p.sy) * k + dy;
        const ux = x - mx, uy = y - my, dist = Math.sqrt(ux * ux + uy * uy);
        if (dist < 130 && dist > 0.01) { const f = (1 - dist / 130) * 34; p.ox += ((ux / dist) * f - p.ox) * 0.2; p.oy += ((uy / dist) * f - p.oy) * 0.2; }
        else { p.ox *= 0.9; p.oy *= 0.9; }
        x += p.ox; y += p.oy;
        ctx.fillStyle = 'rgba(143,191,156,' + (p.a * (0.35 + 0.65 * k)) + ')';
        ctx.fillRect(x - ds / 2, y - ds / 2, ds, ds);
      }
      if (visible && !reduce) { running = true; window.requestAnimationFrame(frame); }
    };
    const kick = () => { if (!running) { running = true; window.requestAnimationFrame(frame); } };
    build();
    window.addEventListener('resize', () => { build(); kick(); });
    // the points only react to a mouse: a finger scrolling past should not disturb the picture
    host.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const r = host.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; }, { passive: true });
    host.addEventListener('pointerleave', () => { mx = -9999; my = -9999; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) kick(); }, { rootMargin: '10% 0px' }).observe(host);
    } else { visible = true; kick(); }
    if (reduce) { t = 1; kick(); }
  }

  /* -------------------------------------- consent and Google Analytics (GA4) */
  const KEY = 'msc_consent';
  const banner = $('#consent');
  let gaLoaded = false;
  let consentOpener = null;

  const loadGA = () => {
    // Analytics is only ever loaded on the live site, and only after an explicit Accept.
    if (gaLoaded || mode !== 'prod' || !gaId) return;
    gaLoaded = true;
    window['ga-disable-' + gaId] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', gaId);
    const s = doc.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
    doc.head.appendChild(s);
  };

  const clearGaCookies = () => {
    const names = doc.cookie.split(';')
      .map((c) => c.split('=')[0].trim())
      .filter((n) => n === '_ga' || n === '_gid' || n.indexOf('_ga_') === 0 || n.indexOf('_gat') === 0);
    if (!names.length) return;
    const host = window.location.hostname;
    const parts = host.split('.');
    const domains = ['', host, '.' + host];
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    names.forEach((n) => domains.forEach((d) => {
      doc.cookie = n + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
    }));
  };

  const showBanner = (moveFocus) => {
    if (!banner) return;
    banner.hidden = false;
    if (moveFocus) {
      const b = $('[data-consent]', banner);
      if (b) b.focus();
    }
  };

  const hideBanner = () => {
    if (!banner) return;
    const hadFocus = banner.contains(doc.activeElement);
    banner.hidden = true;
    if (hadFocus && consentOpener && typeof consentOpener.focus === 'function') consentOpener.focus();
    consentOpener = null;
  };

  const choose = (value) => {
    store.set(KEY, value);
    if (value === 'granted') {
      loadGA();
    } else {
      if (gaId) window['ga-disable-' + gaId] = true;
      clearGaCookies();
    }
    hideBanner();
  };

  const saved = store.get(KEY);
  if (saved === 'granted') loadGA();
  else if (saved !== 'denied') showBanner(false);

  $$('[data-consent]').forEach((b) => b.addEventListener('click', () => choose(b.getAttribute('data-consent'))));
  $$('[data-consent-open]').forEach((b) => b.addEventListener('click', () => {
    consentOpener = b;
    showBanner(true);
  }));

  /* ---------------------------------------------------------- contact form */
  const form = $('#contactForm');
  if (form) {
    const status = $('.form__status', form);
    const thanks = $('#thankYou');
    const btn = $('button[type="submit"]', form);
    const preview = form.getAttribute('data-preview') === 'true';
    const portal = form.getAttribute('data-portal');
    const formId = form.getAttribute('data-form');
    const mail = form.getAttribute('data-email') || '';
    const labelNode = btn && btn.firstChild && btn.firstChild.nodeType === 3 ? btn.firstChild : null;
    const labelText = labelNode ? labelNode.nodeValue : '';

    const setBusy = (busy) => {
      btn.disabled = busy;
      btn.setAttribute('aria-busy', busy ? 'true' : 'false');
      if (labelNode) labelNode.nodeValue = busy ? 'Sending ' : labelText;
    };

    const showError = () => {
      status.textContent = '';
      status.appendChild(doc.createTextNode('Sorry, your message could not be sent. Please try again, or email us at '));
      const a = doc.createElement('a');
      a.href = 'mailto:' + mail;
      a.textContent = mail;
      status.appendChild(a);
      status.appendChild(doc.createTextNode('.'));
      status.hidden = false;
    };

    const finish = (wasPreview) => {
      form.hidden = true;
      if (wasPreview && thanks && !$('.thanks__preview', thanks)) {
        const p = doc.createElement('p');
        p.className = 'thanks__preview';
        p.textContent = 'Preview only. Nothing has been sent.';
        thanks.appendChild(p);
      }
      if (thanks) { thanks.hidden = false; thanks.focus(); }
      if (!wasPreview && typeof window.gtag === 'function') window.gtag('event', 'generate_lead');
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      status.hidden = true;
      if (!form.checkValidity()) { form.reportValidity(); return; }

      const fd = new FormData(form);
      if (fd.get('website')) { finish(false); return; } // honeypot filled: behave as if sent, send nothing
      if (preview) { finish(true); return; }

      const fields = [
        { name: 'firstname', value: String(fd.get('firstname') || '') },
        { name: 'lastname', value: String(fd.get('lastname') || '') },
        { name: 'email', value: String(fd.get('email') || '') },
        { name: 'company', value: String(fd.get('company') || '') },
        { name: 'contact_type', value: String(fd.get('contact_type') || '') },
        { name: 'message', value: String(fd.get('message') || '') }
      ];

      setBusy(true);
      window.fetch('https://api.hsforms.com/submissions/v3/integration/submit/' + portal + '/' + formId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: fields,
          context: { pageUri: window.location.href, pageName: 'Contact - Mayfair Sports Capital' }
        })
      }).then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setBusy(false);
        finish(false);
      }).catch(() => {
        setBusy(false);
        showError();
      });
    });
  }

  // Tabs (Who we work for).
  $$('[role="tablist"]').forEach((list) => {
    const tabs = $$('[role="tab"]', list);
    const select = (t, focus) => {
      tabs.forEach((x) => {
        const on = x === t;
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(x.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) t.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t, false));
      t.addEventListener('keydown', (e) => {
        let n = null;
        if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') n = tabs[0];
        else if (e.key === 'End') n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
  });
})();
