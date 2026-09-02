/* ============================================================
   Swiss Airlines VA — global site-mode layer
   • shows a maintenance / update banner on EVERY page (admins)
   • shows a polite stub to guests if they somehow reach a page
   • plays a "work finished" animation once after the site is back
   • sprinkles the autumn-minimal falling leaves
   No inline handlers, no eval, text inserted as text only.
   ============================================================ */
(function () {
  'use strict';

  var DONE_KEY = 'swiss-maint-seen';
  var LANG_KEY = 'swiss-lang';

  var T = {
    ru: {
      maint: 'Сайт в режиме технических работ',
      update: 'Идёт обновление сайта',
      onlyAdmin: 'Гости видят заглушку — вы вошли как администратор.',
      eta: 'Окончание: ',
      panel: 'Панель',
      preview: 'Заглушка',
      guardMaintTitle: 'Идут технические работы',
      guardUpdateTitle: 'Устанавливаем обновление',
      guardText: 'Мы скоро вернёмся. Спасибо за терпение! ✈',
      doneMaintTitle: 'Технические работы завершены',
      doneUpdateTitle: 'Обновление установлено',
      doneText: 'Всё готово — сайт снова работает в обычном режиме. Приятных полётов!',
      doneBtn: 'Продолжить'
    },
    en: {
      maint: 'The site is under maintenance',
      update: 'A site update is in progress',
      onlyAdmin: 'Visitors see the holding page — you are signed in as an administrator.',
      eta: 'Back at: ',
      panel: 'Panel',
      preview: 'Holding page',
      guardMaintTitle: 'Maintenance in progress',
      guardUpdateTitle: 'Installing an update',
      guardText: 'We will be back shortly. Thank you for your patience! ✈',
      doneMaintTitle: 'Maintenance complete',
      doneUpdateTitle: 'Update installed',
      doneText: 'Everything is ready — the site is fully operational again. Enjoy your flights!',
      doneBtn: 'Continue'
    }
  };

  function lang() {
    var l = document.documentElement.getAttribute('lang');
    if (!l) { try { l = localStorage.getItem(LANG_KEY); } catch (e) {} }
    return l === 'en' ? 'en' : 'ru';
  }
  function t(key) { return (T[lang()] || T.ru)[key]; }

  /* ---------- autumn leaves ---------- */
  var LEAF_COLORS = ['#D97706', '#B45309', '#C2410C', '#A16207', '#EA580C', '#92400E'];
  var LEAF_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c4 4 7 7 7 11a7 7 0 0 1-14 0c0-4 3-7 7-11z" fill="COLOR" opacity=".85"/><path d="M12 5v14" stroke="rgba(255,255,255,.55)" stroke-width="1"/></svg>';

  function leaves(count) {
    if (document.querySelector('.autumn-leaves')) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var n = count || (window.innerWidth < 720 ? 8 : 14);
    var wrap = document.createElement('div');
    wrap.className = 'autumn-leaves';
    wrap.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < n; i++) {
      var leaf = document.createElement('div');
      leaf.className = 'autumn-leaf';
      leaf.style.left = (Math.random() * 100).toFixed(2) + '%';
      leaf.style.animationDuration = (10 + Math.random() * 12).toFixed(1) + 's';
      leaf.style.animationDelay = (-Math.random() * 18).toFixed(1) + 's';
      var size = 10 + Math.round(Math.random() * 10);
      leaf.style.width = size + 'px';
      leaf.style.height = size + 'px';
      leaf.innerHTML = LEAF_SVG.replace('COLOR', LEAF_COLORS[i % LEAF_COLORS.length]);
      wrap.appendChild(leaf);
    }
    document.body.appendChild(wrap);
  }

  /* ---------- banner (admins) ---------- */
  var bannerEl = null, bannerState = null;

  function buildBanner(state) {
    bannerState = state;
    if (!bannerEl) {
      bannerEl = document.createElement('div');
      bannerEl.className = 'sm-banner';
      bannerEl.setAttribute('role', 'status');
      bannerEl.setAttribute('aria-live', 'polite');

      var dot = document.createElement('span');
      dot.className = 'sm-dot';
      var txt = document.createElement('span');
      txt.className = 'sm-txt';
      var eta = document.createElement('span');
      eta.className = 'sm-eta';
      var actions = document.createElement('span');
      actions.className = 'sm-actions';

      var toPanel = document.createElement('button');
      toPanel.type = 'button';
      toPanel.className = 'sm-to-panel';
      toPanel.addEventListener('click', function () { window.location.href = '/admin.html#sitemode'; });

      var toPreview = document.createElement('button');
      toPreview.type = 'button';
      toPreview.className = 'sm-to-preview';
      toPreview.addEventListener('click', function () { window.open('/maintenance.html?preview=1', '_blank', 'noopener'); });

      actions.appendChild(toPanel);
      actions.appendChild(toPreview);
      bannerEl.appendChild(dot);
      bannerEl.appendChild(txt);
      bannerEl.appendChild(eta);
      bannerEl.appendChild(actions);
      document.body.appendChild(bannerEl);
      document.body.classList.add('sm-banner-on');
      requestAnimationFrame(function () { bannerEl.classList.add('show'); });
      window.addEventListener('resize', syncHeight);
      if (window.ResizeObserver) { new ResizeObserver(syncHeight).observe(bannerEl); }
    }
    paintBanner();
  }

  /* keeps the header/body offset exactly equal to the real banner height */
  function syncHeight() {
    if (!bannerEl) return;
    var h = Math.round(bannerEl.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--sm-h', h + 'px');
  }

  function paintBanner() {
    if (!bannerEl || !bannerState) return;
    var isUpdate = bannerState.mode === 'update';
    bannerEl.classList.toggle('mode-update', isUpdate);
    var head = (isUpdate ? t('update') : t('maint'));
    var custom = bannerState.title || '';
    bannerEl.querySelector('.sm-txt').textContent =
      (isUpdate ? '\u21BB ' : '\u26A0 ') + head + (custom ? ' \u2014 ' + custom : '') + ' \u00B7 ' + t('onlyAdmin');
    bannerEl.querySelector('.sm-eta').textContent = bannerState.eta ? t('eta') + bannerState.eta : '';
    bannerEl.querySelector('.sm-to-panel').textContent = t('panel');
    bannerEl.querySelector('.sm-to-preview').textContent = t('preview');
    requestAnimationFrame(syncHeight);
    setTimeout(syncHeight, 120);
  }

  /* ---------- guest stub ---------- */
  function guard(state) {
    if (document.querySelector('.sm-guard')) return;
    var box = document.createElement('div');
    box.className = 'sm-guard';
    box.setAttribute('role', 'alert');

    var mark = document.createElement('div');
    mark.className = 'sm-guard-mark';
    mark.textContent = state.mode === 'update' ? '\u{1F6E0}' : '\u2708';

    var h = document.createElement('h2');
    h.textContent = state.title || (state.mode === 'update' ? t('guardUpdateTitle') : t('guardMaintTitle'));

    var p = document.createElement('p');
    p.textContent = state.message || t('guardText');

    box.appendChild(mark);
    box.appendChild(h);
    box.appendChild(p);

    if (state.eta) {
      var e = document.createElement('span');
      e.className = 'autumn-chip';
      e.textContent = t('eta') + state.eta;
      box.appendChild(e);
    }
    document.body.appendChild(box);
  }

  /* ---------- completion overlay ---------- */
  function sparks(card) {
    for (var i = 0; i < 14; i++) {
      var s = document.createElement('i');
      s.className = 'sm-spark';
      s.style.left = (8 + Math.random() * 84).toFixed(1) + '%';
      s.style.background = LEAF_COLORS[i % LEAF_COLORS.length];
      s.style.setProperty('--dx', (Math.random() * 160 - 80).toFixed(0) + 'px');
      s.style.animationDelay = (0.4 + Math.random() * 0.9).toFixed(2) + 's';
      card.appendChild(s);
    }
  }

  function celebrate(state) {
    var wasUpdate = state.done === 'update';
    var wrap = document.createElement('div');
    wrap.className = 'sm-done';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');

    var card = document.createElement('div');
    card.className = 'sm-done-card';

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'sm-check');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    var c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '37');
    var pth = document.createElementNS(svgNS, 'path');
    pth.setAttribute('d', 'M32 52 L45 65 L69 38');
    svg.appendChild(c); svg.appendChild(pth);

    var h = document.createElement('h2');
    h.textContent = wasUpdate ? t('doneUpdateTitle') : t('doneMaintTitle');
    var p = document.createElement('p');
    p.textContent = t('doneText');

    var prog = document.createElement('div');
    prog.className = 'sm-progress';
    prog.appendChild(document.createElement('i'));

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sm-close';
    btn.textContent = t('doneBtn');

    card.appendChild(svg);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(prog);
    card.appendChild(btn);
    sparks(card);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('show'); });

    function close() {
      wrap.classList.remove('show');
      wrap.classList.add('hide');
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 600);
    }
    btn.addEventListener('click', close);
    wrap.addEventListener('click', function (ev) { if (ev.target === wrap) close(); });
    document.addEventListener('keydown', function esc(ev) {
      if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    setTimeout(function () { btn.focus(); }, 700);
    setTimeout(close, 9000);
  }

  function maybeCelebrate(state) {
    if (state.mode !== 'live' || !state.doneAt) return;
    // the holding page redirects to "/" — let the animation play there instead
    if (/\/maintenance\.html$/.test(window.location.pathname)) return;
    var seen = null;
    try { seen = localStorage.getItem(DONE_KEY); } catch (e) {}
    if (seen === String(state.doneAt)) return;
    try { localStorage.setItem(DONE_KEY, String(state.doneAt)); } catch (e) {}
    celebrate(state);
  }

  /* ---------- boot ---------- */
  function init() {
    leaves();

    fetch('/api/site-mode', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var state = {
          mode: d.mode || 'live',
          title: d.title || '',
          message: d.message || '',
          eta: d.eta || '',
          done: d.done || '',
          doneAt: d.doneAt || '',
          isAdmin: !!d.isAdmin
        };
        window.SwissSiteMode = state;
        if (state.mode !== 'live') {
          if (state.isAdmin) buildBanner(state);
          else if (!/\/(maintenance|login)\.html$/.test(window.location.pathname)) guard(state);
        } else {
          maybeCelebrate(state);
        }
      })
      .catch(function () {});

    // keep banner texts in sync with the ru/en switch
    if (window.MutationObserver) {
      new MutationObserver(paintBanner).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
