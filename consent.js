/* Mayfair Sports Capital: cookie consent.
   Google Analytics loads only after the visitor accepts. The choice is kept
   in this browser (localStorage) and can be changed from the footer link. */
(function () {
  var GA_ID = 'G-899X453727';
  var KEY = 'msc_cookie_consent';
  var banner = null;

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* choice just won't persist */ }
  }

  function loadAnalytics() {
    if (window.__mscGaLoaded) return;
    window.__mscGaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  function clearAnalyticsCookies() {
    var host = location.hostname;
    var parts = host.split('.');
    var domains = [host, '.' + host];
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    else domains.push('.' + host);
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name.indexOf('_ga') !== 0) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + d;
      });
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });
  }

  function close() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function choose(value) {
    write(value);
    close();
    if (value === 'granted') {
      loadAnalytics();
    } else {
      clearAnalyticsCookies();
      // A tag that already ran this page view cannot be unloaded; stop further sending.
      window['ga-disable-' + GA_ID] = true;
    }
  }

  function injectStyles() {
    if (document.getElementById('msc-consent-css')) return;
    var css =
      '#msc-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;' +
      'background:#EFEBE3;color:#1B1B18;border:1px solid rgba(27,27,24,.18);padding:20px 22px;' +
      'font:400 14px/1.6 "DM Sans",system-ui,sans-serif;box-shadow:0 8px 30px rgba(27,27,24,.12)}' +
      '#msc-consent p{margin:0 0 14px}' +
      '#msc-consent a{color:#33613F;text-underline-offset:3px}' +
      '#msc-consent .msc-btns{display:flex;gap:10px;flex-wrap:wrap}' +
      '#msc-consent button{font:500 12px/1 "DM Sans",system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;' +
      'padding:12px 20px;cursor:pointer;background:transparent;color:#1B1B18;border:1px solid #1B1B18;border-radius:0}' +
      '#msc-consent button:hover{background:#1B1B18;color:#EFEBE3}' +
      '#msc-consent button:focus-visible,#msc-consent a:focus-visible{outline:2px solid #33613F;outline-offset:3px}' +
      '@media(min-width:640px){#msc-consent{left:24px;right:auto;bottom:24px}}';
    var st = document.createElement('style');
    st.id = 'msc-consent-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function show() {
    if (banner) return;
    injectStyles();
    banner = document.createElement('div');
    banner.id = 'msc-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie preferences');
    banner.innerHTML =
      '<p>We use Google Analytics to see how the site is used. It only runs if you accept. ' +
      'See our <a href="/cookies/">Cookie Policy</a>.</p>' +
      '<div class="msc-btns"><button type="button" data-msc="denied">Decline</button>' +
      '<button type="button" data-msc="granted">Accept</button></div>';
    banner.addEventListener('click', function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute('data-msc');
      if (v) choose(v);
    });
    document.body.appendChild(banner);
  }

  function init() {
    var saved = read();
    if (saved === 'granted') loadAnalytics();
    else if (saved !== 'denied') show();
    document.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== document) {
        if (t.hasAttribute && t.hasAttribute('data-cookie-settings')) { e.preventDefault(); show(); return; }
        t = t.parentNode;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
