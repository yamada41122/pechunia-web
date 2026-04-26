/* =========================================
   PECHUNIA — data-render.js
   公開サイト側でJSONデータを読み込み、DOMを描画
   ========================================= */

(function () {
  'use strict';

  // ---------- ユーティリティ ----------
  const escapeHtml = (str) => {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const fetchJSON = async (path) => {
    const url = `${path}?t=${Date.now()}`; // キャッシュ回避
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
    return res.json();
  };

  // ---------- News ----------
  const renderNewsItem = (item, asLink = true) => {
    const tagClass = `is-${escapeHtml(item.category || 'info')}`;
    const tagLabel = (item.category || 'info').toUpperCase();
    const href = asLink ? 'news.html' : '#';
    return `
      <a href="${href}" class="news-item">
        <span class="news-date">${escapeHtml(item.date)}</span>
        <span class="news-tag ${tagClass}">${escapeHtml(tagLabel)}</span>
        <span class="news-title">${escapeHtml(item.title)}</span>
        <span class="news-arrow">→</span>
      </a>
    `;
  };

  const renderNews = async (container, opts = {}) => {
    if (!container) return;
    try {
      const list = await fetchJSON(opts.dataPath || 'data/news.json');
      const limit = opts.limit || list.length;
      const items = list.slice(0, limit);
      container.innerHTML = items.map((item) => renderNewsItem(item, opts.linkable)).join('');
    } catch (err) {
      console.error(err);
      container.innerHTML = '<p style="padding:24px; color:var(--text-tertiary);">ニュースの読み込みに失敗しました。</p>';
    }
  };

  // ---------- Artists ----------
  const renderArtistCard = (artist) => {
    return `
      <a href="artist-detail.html" class="artist-card ${escapeHtml(artist.colorVariant || 'c-1')}">
        <div class="visual">${escapeHtml(artist.initial || '★')}</div>
        <span class="corner">N° ${escapeHtml(artist.no || '')}</span>
        <div class="meta">
          <div class="role">${escapeHtml(artist.role || '')}</div>
          <div class="name">${escapeHtml(artist.name || '')}</div>
          <div class="members">${escapeHtml(artist.memberList || artist.members || '')}</div>
        </div>
      </a>
    `;
  };

  const renderArtists = async (container, opts = {}) => {
    if (!container) return;
    try {
      const list = await fetchJSON(opts.dataPath || 'data/artists.json');
      const limit = opts.limit || list.length;
      const filtered = opts.category
        ? list.filter((a) => a.category === opts.category)
        : list;
      const items = filtered.slice(0, limit);
      container.innerHTML = items.map(renderArtistCard).join('');
    } catch (err) {
      console.error(err);
      container.innerHTML = '<p style="padding:24px; color:var(--text-tertiary);">アーティスト情報の読み込みに失敗しました。</p>';
    }
  };

  // ---------- Audition ----------
  const renderAudition = async (opts = {}) => {
    try {
      const data = await fetchJSON(opts.dataPath || 'data/audition.json');

      // タイトル系
      const titleEl = document.querySelector('[data-audition="title"]');
      if (titleEl) titleEl.innerHTML = escapeHtml(data.title || '').replace(' ', '<br>');

      const subtitleEl = document.querySelector('[data-audition="subtitle"]');
      if (subtitleEl) subtitleEl.textContent = data.subtitle || '';

      const catchcopyEl = document.querySelector('[data-audition="catchcopy"]');
      if (catchcopyEl) catchcopyEl.textContent = data.catchcopy || '';

      const leadEl = document.querySelector('[data-audition="lead"]');
      if (leadEl) leadEl.innerHTML = escapeHtml(data.leadText || '').replace(/\n/g, '<br>');

      const deadlineEl = document.querySelector('[data-audition="deadline"]');
      if (deadlineEl) deadlineEl.textContent = data.deadline || '';

      const ctaEl = document.querySelector('[data-audition="cta"]');
      if (ctaEl) {
        ctaEl.textContent = data.ctaLabel || 'Entry Now →';
        ctaEl.setAttribute('href', data.ctaLink || 'contact.html');
      }

      // 募集要項
      const reqEl = document.querySelector('[data-audition="requirements"]');
      if (reqEl && Array.isArray(data.requirements)) {
        reqEl.innerHTML = data.requirements.map((r) => `<li>${escapeHtml(r)}</li>`).join('');
      }

      // 応募方法
      const methodsEl = document.querySelector('[data-audition="apply-methods"]');
      if (methodsEl && Array.isArray(data.applyMethods)) {
        methodsEl.innerHTML = data.applyMethods.map((m) => `<li>${escapeHtml(m)}</li>`).join('');
      }

      // ステップ
      const stepsEl = document.querySelector('[data-audition="steps"]');
      if (stepsEl && Array.isArray(data.steps)) {
        stepsEl.innerHTML = data.steps
          .map(
            (s, i) => `
          <div class="step reveal" data-delay="${i + 1}">
            <div class="num">${escapeHtml(s.num)}</div>
            <h4>${escapeHtml(s.title)}</h4>
            <p>${escapeHtml(s.description)}</p>
          </div>`
          )
          .join('');
      }

      // スケジュール
      const schedEl = document.querySelector('[data-audition="schedule"]');
      if (schedEl && Array.isArray(data.schedule)) {
        schedEl.innerHTML = data.schedule
          .map(
            (row) => `
          <div class="row"><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`
          )
          .join('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ---------- 初期化（data-render属性に応じて） ----------
  const init = () => {
    document.querySelectorAll('[data-render="news"]').forEach((el) => {
      const limit = parseInt(el.getAttribute('data-limit'), 10) || undefined;
      const linkable = el.getAttribute('data-linkable') !== 'false';
      renderNews(el, { limit, linkable });
    });

    document.querySelectorAll('[data-render="artists"]').forEach((el) => {
      const limit = parseInt(el.getAttribute('data-limit'), 10) || undefined;
      renderArtists(el, { limit });
    });

    if (document.querySelector('[data-render="audition"]')) {
      renderAudition();
    }
  };

  // 公開メソッド
  window.PechuniaRender = { renderNews, renderArtists, renderAudition };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
