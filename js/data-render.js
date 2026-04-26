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
    const hasImg = !!artist.image;
    const visualStyle = hasImg ? `style="background-image:url('${escapeHtml(artist.image)}')"` : '';
    return `
      <a href="artist-detail.html?id=${escapeHtml(artist.id || '')}" class="artist-card ${escapeHtml(artist.colorVariant || 'c-1')} ${hasImg ? 'has-image' : ''}">
        <div class="visual" ${visualStyle}>${hasImg ? '' : escapeHtml(artist.initial || '★')}</div>
        <span class="corner">N° ${escapeHtml(artist.no || '')}</span>
        <div class="meta">
          <div class="role">${escapeHtml(artist.role || '')}</div>
          <div class="name">${escapeHtml(artist.name || '')}</div>
          <div class="members">${escapeHtml(artist.memberList || artist.members || '')}</div>
        </div>
      </a>
    `;
  };

  // メンバーカード（artist-detail用、内側のIDをmemberId付きで渡す）
  const renderMemberCard = (member, parentId) => {
    const hasImg = !!member.image;
    const visualStyle = hasImg ? `style="background-image:url('${escapeHtml(member.image)}')"` : '';
    return `
      <a href="#" class="artist-card ${hasImg ? 'has-image' : ''}">
        <div class="visual" ${visualStyle}>${hasImg ? '' : escapeHtml(member.initial || (member.name || '').charAt(0))}</div>
        <div class="meta">
          <div class="role">${escapeHtml(member.role || '')}</div>
          <div class="name">${escapeHtml(member.name || '')}</div>
          <div class="members">${escapeHtml(member.nameJa || '')}</div>
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

  // ---------- Artist detail ----------
  const renderArtistDetail = async (opts = {}) => {
    try {
      const list = await fetchJSON(opts.dataPath || 'data/artists.json');
      // ?id=... を取得（なければ先頭）
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      const artist = (id && list.find((a) => a.id === id)) || list[0];
      if (!artist) return;

      // ページタイトル
      document.title = `${artist.name} | PECHUNIA`;

      // ページヒーロー部
      const crumbEl = document.querySelector('[data-detail="crumb"]');
      if (crumbEl) crumbEl.textContent = `Home / Artists / ${artist.name}`;

      const titleEl = document.querySelector('[data-detail="title"]');
      if (titleEl) titleEl.textContent = artist.name;

      const subtitleEl = document.querySelector('[data-detail="subtitle"]');
      if (subtitleEl) subtitleEl.textContent = artist.role || '';

      // ポートレート
      const portraitEl = document.querySelector('[data-detail="portrait"]');
      if (portraitEl) {
        if (artist.image) {
          portraitEl.classList.add('has-image');
          portraitEl.style.backgroundImage = `url('${artist.image}')`;
          portraitEl.innerHTML = '';
        } else {
          portraitEl.classList.remove('has-image');
          portraitEl.style.backgroundImage = '';
          portraitEl.innerHTML = `<div class="initial">${escapeHtml(artist.initial || (artist.name || '').charAt(0))}</div>`;
        }
      }

      // 名前
      const nameEl = document.querySelector('[data-detail="name"]');
      if (nameEl) nameEl.textContent = artist.name;

      // 説明
      const descEl = document.querySelector('[data-detail="description"]');
      if (descEl) descEl.textContent = artist.description || '';

      // プロフィール表（ある分だけ）
      const profileEl = document.querySelector('[data-detail="profile"]');
      if (profileEl) {
        const rows = [
          { label: 'Name', value: artist.name },
          { label: 'Role', value: artist.role },
          { label: 'Members', value: artist.memberList || artist.members },
          { label: 'Category', value: artist.category },
        ].filter((r) => r.value);
        profileEl.innerHTML = rows
          .map((r) => `<div class="profile-row"><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`)
          .join('');
      }

      // メンバーセクション（group / unit のみ）
      const membersWrap = document.querySelector('[data-detail="members-section"]');
      const membersGrid = document.querySelector('[data-detail="members-grid"]');
      const membersTitle = document.querySelector('[data-detail="members-title"]');
      if (membersWrap && membersGrid) {
        const hasMembers =
          (artist.category === 'group' || artist.category === 'unit') &&
          Array.isArray(artist.memberItems) &&
          artist.memberItems.length > 0;
        membersWrap.style.display = hasMembers ? '' : 'none';
        if (hasMembers) {
          membersGrid.innerHTML = artist.memberItems.map((m) => renderMemberCard(m, artist.id)).join('');
          if (membersTitle) membersTitle.textContent = `${artist.name} Members`;
        }
      }
    } catch (err) {
      console.error(err);
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

    if (document.querySelector('[data-render="artist-detail"]')) {
      renderArtistDetail();
    }
  };

  // 公開メソッド
  window.PechuniaRender = { renderNews, renderArtists, renderAudition, renderArtistDetail };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
