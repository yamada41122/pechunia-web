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
  // 公開判定：status が published かつ publishAt が空 or 過去
  const isNewsVisible = (item) => {
    if ((item.status || 'published') !== 'published') return false;
    if (!item.publishAt) return true;
    const t = new Date(item.publishAt);
    if (isNaN(t.getTime())) return true; // 不正な日付は無視
    return t.getTime() <= Date.now();
  };

  const renderNewsItem = (item) => {
    const tagClass = `is-${escapeHtml(item.category || 'info')}`;
    const tagLabel = (item.category || 'info').toUpperCase();
    const href = `news-detail.html?id=${escapeHtml(item.id || '')}`;
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
      const visible = list.filter(isNewsVisible);
      const limit = opts.limit || visible.length;
      const items = visible.slice(0, limit);
      if (items.length === 0) {
        container.innerHTML = '<p style="padding:48px 24px; text-align:center; color:var(--text-tertiary);">表示するニュースがありません。</p>';
        return;
      }
      container.innerHTML = items.map(renderNewsItem).join('');
    } catch (err) {
      console.error(err);
      container.innerHTML = '<p style="padding:24px; color:var(--text-tertiary);">ニュースの読み込みに失敗しました。</p>';
    }
  };

  // ---------- News body parser ----------
  // 許可するiframe src のドメイン
  const IFRAME_ALLOW = [
    'google.com/maps/embed',
    'www.google.com/maps/embed',
    'www.youtube.com/embed/',
    'www.youtube-nocookie.com/embed/',
    'player.vimeo.com/video/',
  ];

  const sanitizeIframe = (htmlStr) => {
    // src を抽出
    const srcMatch = htmlStr.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) return '';
    const src = srcMatch[1];
    if (!IFRAME_ALLOW.some((a) => src.includes(a))) return '';
    return `<div class="news-embed"><iframe src="${escapeHtml(src)}" frameborder="0" allowfullscreen loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>`;
  };

  const parseNewsBody = (body) => {
    if (!body) return '';
    const segments = [];
    const iframeRe = /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi;
    let lastIdx = 0;
    let m;
    while ((m = iframeRe.exec(body)) !== null) {
      if (m.index > lastIdx) segments.push({ type: 'text', content: body.slice(lastIdx, m.index) });
      segments.push({ type: 'iframe', content: sanitizeIframe(m[0]) });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < body.length) segments.push({ type: 'text', content: body.slice(lastIdx) });

    return segments
      .map((seg) => {
        if (seg.type === 'iframe') return seg.content;
        // テキストの場合：HTMLエスケープ → URL自動リンク → 改行を <br> / <p>
        let txt = escapeHtml(seg.content);
        // URL自動リンク（既にエスケープ済みなのでhref内に入れて安全）
        txt = txt.replace(
          /(https?:\/\/[^\s<>"'\u3000]+)/g,
          '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        // 段落分け（空行で段落、単一改行は<br>）
        return txt
          .split(/\n\s*\n/)
          .filter((p) => p.trim().length > 0)
          .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
          .join('');
      })
      .join('');
  };

  // ---------- News detail ----------
  const renderNewsDetail = async (opts = {}) => {
    try {
      const list = await fetchJSON(opts.dataPath || 'data/news.json');
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');
      const item = id && list.find((n) => n.id === id);

      if (!item || !isNewsVisible(item)) {
        const titleEl = document.querySelector('[data-news="title"]');
        const bodyEl = document.querySelector('[data-news="body"]');
        if (titleEl) titleEl.textContent = '記事が見つかりません';
        if (bodyEl) bodyEl.innerHTML = '<p style="color:var(--text-tertiary); margin:24px 0;">指定された記事は公開されていないか、削除された可能性があります。</p>';
        return;
      }

      document.title = `${item.title} | News | PECHUNIA`;

      const crumbEl = document.querySelector('[data-news="crumb"]');
      if (crumbEl) crumbEl.textContent = `Home / News / ${item.title.slice(0, 30)}${item.title.length > 30 ? '…' : ''}`;

      const dateEl = document.querySelector('[data-news="date"]');
      if (dateEl) dateEl.textContent = item.date || '';

      const tagEl = document.querySelector('[data-news="tag"]');
      if (tagEl) {
        tagEl.className = `news-tag is-${item.category || 'info'}`;
        tagEl.textContent = (item.category || 'info').toUpperCase();
      }

      const titleEl = document.querySelector('[data-news="title"]');
      if (titleEl) titleEl.textContent = item.title || '';

      const imageEl = document.querySelector('[data-news="image"]');
      if (imageEl) {
        if (item.image) {
          imageEl.style.display = '';
          imageEl.innerHTML = `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">`;
        } else {
          imageEl.style.display = 'none';
        }
      }

      const bodyEl = document.querySelector('[data-news="body"]');
      if (bodyEl) {
        if (item.body) bodyEl.innerHTML = parseNewsBody(item.body);
        else bodyEl.innerHTML = '<p style="color:var(--text-tertiary);">本文が登録されていません。</p>';
      }
    } catch (err) {
      console.error(err);
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

  // メンバーカード（artist-detail / member-detail 用）
  const renderMemberCard = (member, parentId) => {
    const hasImg = !!member.image;
    const visualStyle = hasImg ? `style="background-image:url('${escapeHtml(member.image)}')"` : '';
    const href = `member-detail.html?artist=${escapeHtml(parentId)}&member=${escapeHtml(member.id)}`;
    return `
      <a href="${href}" class="artist-card ${hasImg ? 'has-image' : ''}">
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
      const filtered = opts.category
        ? list.filter((a) => a.category === opts.category)
        : list;

      let cards = [];
      if (opts.includeMembers) {
        // 各アーティストを表示 → group/unitならメンバーも続けて表示
        for (const a of filtered) {
          cards.push(renderArtistCard(a));
          if ((a.category === 'group' || a.category === 'unit') && Array.isArray(a.memberItems)) {
            for (const m of a.memberItems) {
              cards.push(renderMemberCard(m, a.id));
            }
          }
        }
      } else {
        cards = filtered.map(renderArtistCard);
      }

      const limit = opts.limit || cards.length;
      container.innerHTML = cards.slice(0, limit).join('');
    } catch (err) {
      console.error(err);
      container.innerHTML = '<p style="padding:24px; color:var(--text-tertiary);">アーティスト情報の読み込みに失敗しました。</p>';
    }
  };

  // ---------- Featured (top page mix of artists + members) ----------
  const renderFeatured = async (container, opts = {}) => {
    if (!container) return;
    try {
      // 並列で取得
      const [artists, featured] = await Promise.all([
        fetchJSON(opts.artistsPath || 'data/artists.json'),
        fetchJSON(opts.featuredPath || 'data/featured.json').catch(() => ({ items: [] })),
      ]);

      const items = (featured.items || []).slice(0, 6);

      // フォールバック：featured が空ならアーティスト先頭6件を表示
      if (!items.length) {
        const cards = artists.slice(0, 6).map(renderArtistCard).join('');
        container.innerHTML = cards;
        return;
      }

      // 各 featured アイテムを実体に解決
      const cards = items
        .map((it) => {
          if (it.type === 'artist') {
            const a = artists.find((x) => x.id === it.id);
            return a ? renderArtistCard(a) : '';
          }
          if (it.type === 'member') {
            const a = artists.find((x) => x.id === it.artistId);
            if (!a) return '';
            const m = (a.memberItems || []).find((x) => x.id === it.memberId);
            return m ? renderMemberCard(m, a.id) : '';
          }
          return '';
        })
        .filter(Boolean)
        .join('');

      container.innerHTML = cards;
    } catch (err) {
      console.error(err);
      container.innerHTML = '<p style="padding:24px; color:var(--text-tertiary);">表示項目の読み込みに失敗しました。</p>';
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

  // ---------- Member detail ----------
  const SOCIAL_LABELS = {
    instagram: 'Instagram',
    twitter: 'X / Twitter',
    youtube: 'YouTube',
    tiktok: 'TikTok',
  };

  const renderMemberDetail = async (opts = {}) => {
    try {
      const list = await fetchJSON(opts.dataPath || 'data/artists.json');
      const params = new URLSearchParams(window.location.search);
      const artistId = params.get('artist');
      const memberId = params.get('member');

      const artist = artistId && list.find((a) => a.id === artistId);
      if (!artist) {
        const titleEl = document.querySelector('[data-member="title"]');
        if (titleEl) titleEl.textContent = 'Not Found';
        return;
      }

      const members = artist.memberItems || [];
      const member = (memberId && members.find((m) => m.id === memberId)) || members[0];
      if (!member) return;

      // タイトル
      document.title = `${member.name} / ${artist.name} | PECHUNIA`;

      const crumbEl = document.querySelector('[data-member="crumb"]');
      if (crumbEl) crumbEl.textContent = `Home / Artists / ${artist.name} / ${member.name}`;

      const titleEl = document.querySelector('[data-member="title"]');
      if (titleEl) titleEl.textContent = member.name;

      const subtitleEl = document.querySelector('[data-member="subtitle"]');
      if (subtitleEl) subtitleEl.textContent = `${artist.name}${member.role ? ' / ' + member.role : ''}`;

      // ポートレート
      const portraitEl = document.querySelector('[data-member="portrait"]');
      if (portraitEl) {
        if (member.image) {
          portraitEl.classList.add('has-image');
          portraitEl.style.backgroundImage = `url('${member.image}')`;
          portraitEl.innerHTML = '';
        } else {
          portraitEl.classList.remove('has-image');
          portraitEl.style.backgroundImage = '';
          portraitEl.innerHTML = `<div class="initial">${escapeHtml(member.initial || (member.name || '').charAt(0))}</div>`;
        }
      }

      const nameEl = document.querySelector('[data-member="name"]');
      if (nameEl) nameEl.textContent = member.name;

      const nameJaEl = document.querySelector('[data-member="nameJa"]');
      if (nameJaEl) nameJaEl.textContent = member.nameJa || '';

      const furiganaEl = document.querySelector('[data-member="furigana"]');
      if (furiganaEl) furiganaEl.textContent = member.furigana ? `(${member.furigana})` : '';

      const catchEl = document.querySelector('[data-member="catchphrase"]');
      if (catchEl) catchEl.textContent = member.catchphrase || '';

      const descEl = document.querySelector('[data-member="description"]');
      if (descEl) descEl.textContent = member.description || '';

      // プロフィール表（値があるものだけ表示）
      const profileEl = document.querySelector('[data-member="profile"]');
      if (profileEl) {
        const rows = [
          { label: 'Name', value: member.name },
          { label: 'Group', value: artist.name },
          { label: 'Position', value: member.role },
          { label: 'Birthday', value: member.birthday },
          { label: 'Birthplace', value: member.birthplace },
          { label: 'Blood', value: member.bloodType },
          { label: 'Height', value: member.height },
          { label: 'Hobbies', value: member.hobbies },
          { label: 'Specialties', value: member.specialties },
        ].filter((r) => r.value);
        profileEl.innerHTML = rows
          .map((r) => `<div class="profile-row"><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`)
          .join('');
      }

      // SNS
      const socialEl = document.querySelector('[data-member="social-wrap"]');
      if (socialEl) {
        const links = ['instagram', 'twitter', 'youtube', 'tiktok']
          .filter((k) => member[k])
          .map((k) => `<a href="${escapeHtml(member[k])}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm">${SOCIAL_LABELS[k]}</a>`)
          .join('');
        socialEl.innerHTML = links;
      }

      // 他メンバー
      const othersWrap = document.querySelector('[data-member="others-section"]');
      const othersGrid = document.querySelector('[data-member="others-grid"]');
      const othersEyebrow = document.querySelector('[data-member="others-eyebrow"]');
      const backLink = document.querySelector('[data-member="back-link"]');
      if (backLink) backLink.setAttribute('href', `artist-detail.html?id=${artist.id}`);
      if (othersEyebrow) othersEyebrow.textContent = `${artist.name} / Other Members`;

      if (othersWrap && othersGrid) {
        const others = members.filter((m) => m.id !== member.id);
        if (others.length > 0) {
          othersGrid.innerHTML = others.map((m) => renderMemberCard(m, artist.id)).join('');
          othersWrap.style.display = '';
        } else {
          othersWrap.style.display = 'none';
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
      const includeMembers = el.getAttribute('data-include-members') === 'true';
      renderArtists(el, { limit, includeMembers });
    });

    document.querySelectorAll('[data-render="featured"]').forEach((el) => {
      renderFeatured(el);
    });

    if (document.querySelector('[data-render="audition"]')) {
      renderAudition();
    }

    if (document.querySelector('[data-render="artist-detail"]')) {
      renderArtistDetail();
    }

    if (document.querySelector('[data-render="member-detail"]')) {
      renderMemberDetail();
    }

    if (document.querySelector('[data-render="news-detail"]')) {
      renderNewsDetail();
    }
  };

  // 公開メソッド
  window.PechuniaRender = { renderNews, renderArtists, renderFeatured, renderAudition, renderArtistDetail, renderMemberDetail, renderNewsDetail };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
