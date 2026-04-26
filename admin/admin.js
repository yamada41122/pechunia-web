/* =========================================
   PECHUNIA Admin — admin.js
   News / Artists / Audition の編集ロジック
   ========================================= */

(function () {
  'use strict';

  const GH = window.PechuniaGitHub;

  // ---------- DOM helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const escapeHtml = (str) => {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // ---------- Toast ----------
  const toastEl = $('#toast');
  let toastTimer;
  const toast = (msg, type = 'success') => {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.remove('is-success', 'is-error');
    toastEl.classList.add(`is-${type}`, 'is-visible');
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 3500);
  };

  // ---------- Loading ----------
  const loadingEl = $('#loading');
  const loadingText = $('#loadingText');
  const showLoading = (text = '読み込み中...') => {
    loadingText.textContent = text;
    loadingEl.classList.remove('hidden');
  };
  const hideLoading = () => loadingEl.classList.add('hidden');

  // ---------- App state ----------
  const data = {
    news: { list: [], sha: null, dirty: false },
    artists: { list: [], sha: null, dirty: false },
    audition: { obj: null, sha: null, dirty: false },
    featured: { items: [], sha: null, dirty: false },
  };

  const FEATURED_MAX = 6;

  // 保存待ちの画像 Blob: key="artist:luminas" or "member:luminas:aoi" → { blob, ext, path }
  const pendingImages = new Map();

  // 削除待ちの画像パス（既存画像を削除する）
  const pendingImageDeletes = new Set();

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

  const getExt = (filename) => {
    const m = filename.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : 'jpg';
  };

  const artistImagePath = (artistId, ext) => `img/artists/${artistId}.${ext}`;
  const memberImagePath = (groupId, memberId, ext) => `img/artists/${groupId}-${memberId}.${ext}`;
  const newsImagePath = (newsId, ext) => `img/news/${newsId}.${ext}`;

  // 公開判定（管理画面表示用）
  const newsStatusInfo = (item) => {
    const status = item.status || 'published';
    if (status === 'draft') return { key: 'draft', label: '下書き' };
    if (status === 'private') return { key: 'private', label: '非公開' };
    if (item.publishAt) {
      const t = new Date(item.publishAt);
      if (!isNaN(t.getTime()) && t.getTime() > Date.now()) {
        return { key: 'scheduled', label: '予約' };
      }
    }
    return { key: 'published', label: '公開中' };
  };

  // datetime-local 用のフォーマット変換
  const toDatetimeLocal = (str) => {
    if (!str) return '';
    const t = new Date(str);
    if (isNaN(t.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
  };

  const fromDatetimeLocal = (val) => {
    if (!val) return '';
    return new Date(val).toISOString();
  };

  // ---------- Auto-detect owner/repo from current URL ----------
  const detectFromURL = () => {
    // GitHub Pages: https://<user>.github.io/<repo>/admin/
    const host = location.hostname;
    const m = host.match(/^([^.]+)\.github\.io$/);
    if (m) {
      const owner = m[1];
      // path: /pechunia-web/admin/ → repo = pechunia-web
      const segs = location.pathname.split('/').filter(Boolean);
      const repo = segs[0] || '';
      return { owner, repo };
    }
    return { owner: '', repo: '' };
  };

  // ============================================================
  // Login
  // ============================================================
  const loginScreen = $('#loginScreen');
  const dashboard = $('#dashboard');
  const loginForm = $('#loginForm');
  const loginError = $('#loginError');
  const tokenHelpLink = $('#tokenHelpLink');
  const tokenHelp = $('#tokenHelp');

  const showLoginError = (msg) => {
    loginError.textContent = msg;
    loginError.classList.add('is-visible');
  };
  const clearLoginError = () => {
    loginError.textContent = '';
    loginError.classList.remove('is-visible');
  };

  tokenHelpLink.addEventListener('click', (e) => {
    e.preventDefault();
    tokenHelp.classList.toggle('is-visible');
  });

  const initLoginForm = () => {
    // localStorageから復元
    const saved = GH.loadAuth();
    const detected = detectFromURL();

    $('#ownerInput').value = saved?.owner || detected.owner || '';
    $('#repoInput').value = saved?.repo || detected.repo || 'pechunia-web';
    // tokenは復元しない（=自動ログインしない）
  };

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearLoginError();

    const owner = $('#ownerInput').value.trim();
    const repo = $('#repoInput').value.trim();
    const token = $('#tokenInput').value.trim();

    if (!owner || !repo || !token) {
      showLoginError('すべての項目を入力してください。');
      return;
    }

    GH.setAuth({ owner, repo, token });

    showLoading('認証中...');
    try {
      const user = await GH.verifyToken();
      GH.saveAuth({ owner, repo, token });
      hideLoading();
      enterDashboard(user);
    } catch (err) {
      hideLoading();
      console.error(err);
      if (err.status === 401) {
        showLoginError('トークンが無効です。コピー漏れがないか、有効期限が切れていないか確認してください。');
      } else if (err.status === 404) {
        showLoginError('リポジトリが見つかりません。オーナー名・リポジトリ名・トークンの権限設定を確認してください。');
      } else {
        showLoginError(err.message);
      }
    }
  });

  // ============================================================
  // Dashboard
  // ============================================================
  const enterDashboard = async (user) => {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    $('#adminUser').textContent = `@${user.login}（${GH.state.owner}/${GH.state.repo}）`;

    // 全データ読み込み
    await loadAllData();
  };

  const loadAllData = async () => {
    showLoading('データを読み込み中...');
    try {
      const [newsRes, artistsRes, auditionRes] = await Promise.all([
        GH.getJSON('data/news.json'),
        GH.getJSON('data/artists.json'),
        GH.getJSON('data/audition.json'),
      ]);
      data.news = { list: newsRes.data, sha: newsRes.sha, dirty: false };
      data.artists = { list: artistsRes.data, sha: artistsRes.sha, dirty: false };
      data.audition = { obj: auditionRes.data, sha: auditionRes.sha, dirty: false };

      // featured.json は無い場合があるので個別に取得
      try {
        const featuredRes = await GH.getJSON('data/featured.json');
        data.featured = { items: featuredRes.data.items || [], sha: featuredRes.sha, dirty: false };
      } catch (e) {
        data.featured = { items: [], sha: null, dirty: false };
      }

      renderNews();
      renderArtists();
      renderAudition();
      renderFeatured();
      hideLoading();
    } catch (err) {
      hideLoading();
      console.error(err);
      toast(`データの読み込みに失敗：${err.message}`, 'error');
    }
  };

  // ---------- Logout ----------
  $('#logoutBtn').addEventListener('click', () => {
    if ((data.news.dirty || data.artists.dirty || data.audition.dirty || data.featured.dirty) &&
        !confirm('保存されていない変更があります。本当にログアウトしますか？')) return;
    GH.clearAuth();
    location.reload();
  });

  // ---------- Tabs ----------
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      $$('.tab-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      $$('.panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
    });
  });

  // ============================================================
  // News Editor
  // ============================================================
  const newsEditor = $('#newsEditor');

  const renderNews = () => {
    const list = data.news.list;
    if (!list.length) {
      newsEditor.innerHTML = '<div class="row-empty">ニュースがありません。「+ 新規ニュースを追加」から作成できます。</div>';
      return;
    }
    newsEditor.innerHTML = list.map((item, idx) => {
      const st = newsStatusInfo(item);
      return `
      <div class="row-card" data-idx="${idx}">
        <div class="row-handle" title="ドラッグで並び替え">⋮⋮</div>
        <div class="row-date">${escapeHtml(item.date)}</div>
        <div><span class="status-badge is-${st.key}">${escapeHtml(st.label)}</span></div>
        <div>
          <div class="row-title">${escapeHtml(item.title)}</div>
          <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">
            <span class="row-tag is-${escapeHtml(item.category)}">${escapeHtml(item.category || '')}</span>
            ${item.image ? '<span style="font-size:11px; color:var(--text-tertiary);">📷 画像あり</span>' : ''}
            ${item.publishAt && st.key === 'scheduled' ? `<span style="font-size:11px; color:var(--accent-strong);">⏰ ${escapeHtml(new Date(item.publishAt).toLocaleString('ja-JP'))}</span>` : ''}
          </div>
        </div>
        <div class="row-actions">
          <button data-act="up">↑</button>
          <button data-act="down">↓</button>
          <button data-act="edit">編集</button>
          <button class="btn-danger" data-act="delete">削除</button>
        </div>
      </div>
      `;
    }).join('');
  };

  newsEditor.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.row-card');
    const idx = parseInt(card.dataset.idx, 10);
    const act = btn.dataset.act;

    if (act === 'edit') openNewsModal(idx);
    if (act === 'delete') {
      if (confirm('このニュースを削除します。よろしいですか？')) {
        data.news.list.splice(idx, 1);
        data.news.dirty = true;
        renderNews();
      }
    }
    if (act === 'up' && idx > 0) {
      [data.news.list[idx - 1], data.news.list[idx]] = [data.news.list[idx], data.news.list[idx - 1]];
      data.news.dirty = true;
      renderNews();
    }
    if (act === 'down' && idx < data.news.list.length - 1) {
      [data.news.list[idx + 1], data.news.list[idx]] = [data.news.list[idx], data.news.list[idx + 1]];
      data.news.dirty = true;
      renderNews();
    }
  });

  $('[data-action="add-news"]').addEventListener('click', () => openNewsModal(-1));
  $('[data-action="save-news"]').addEventListener('click', () => saveNews());

  const openNewsModal = (idx) => {
    const isNew = idx < 0;
    const item = isNew
      ? {
          id: '', date: formatToday(), category: 'info', title: '',
          body: '', image: null, status: 'published', publishAt: '',
        }
      : { ...data.news.list[idx] };

    let imageState = {
      currentPath: item.image,
      previewUrl: item.image ? `../${item.image}` : null,
      pendingFile: null,
      removed: false,
    };

    openModal({
      title: isNew ? 'ニュースを追加' : 'ニュースを編集',
      body: `
        <h4 style="font-family:var(--font-display); font-style:italic; font-size:18px; color:var(--accent-strong); margin-top:-4px;">基本情報</h4>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field">
            <label>日付（表示用）</label>
            <input type="text" id="m_date" value="${escapeHtml(item.date)}" placeholder="2026.04.18">
          </div>
          <div class="field">
            <label>カテゴリー</label>
            <select id="m_category">
              <option value="live">LIVE（公演）</option>
              <option value="media">MEDIA（メディア）</option>
              <option value="info">INFO（お知らせ）</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>タイトル</label>
          <textarea id="m_title" rows="2" placeholder="ニュースタイトル">${escapeHtml(item.title)}</textarea>
        </div>

        <div class="field">
          <label>アイキャッチ画像（最大 5MB）</label>
          <div class="image-upload">
            <div class="image-preview ${imageState.previewUrl ? 'has-image' : ''}" id="n_imgPreview">
              ${imageState.previewUrl ? `<img src="${escapeHtml(imageState.previewUrl)}" alt="">` : `<div class="image-preview-placeholder">📷</div>`}
            </div>
            <div class="image-upload-controls">
              <label class="image-upload-label">
                <input type="file" accept="image/*" class="image-upload-input" id="n_imgFile">
                画像を選択
              </label>
              <span class="image-upload-info">JPG / PNG / WebP ・5MB以内</span>
              <button type="button" class="image-remove-btn" id="n_imgRemove" style="${imageState.previewUrl ? '' : 'display:none;'}">画像を削除</button>
            </div>
          </div>
        </div>

        <div class="field">
          <label>本文</label>
          <textarea id="m_body" rows="10" placeholder="記事本文を入力。\nURLは自動でリンクになります。\nGoogle Maps や YouTube の埋め込みコード（&lt;iframe ...&gt;）はそのまま貼り付けてください。">${escapeHtml(item.body || '')}</textarea>
          <small style="color:var(--text-tertiary); font-size:11px; line-height:1.6;">
            ・URL（http:// http://〜）は自動で別タブリンクになります<br>
            ・Google Maps の「埋め込みコード」（共有→地図を埋め込む→HTMLをコピー）の iframe をそのまま貼れます<br>
            ・YouTube の埋め込みコードも同様に貼り付け可能です<br>
            ・空行で段落分け、改行で行替え
          </small>
        </div>

        <h4 style="font-family:var(--font-display); font-style:italic; font-size:18px; color:var(--accent-strong); margin-top:8px;">公開設定</h4>

        <div class="field">
          <label>ステータス</label>
          <select id="m_status">
            <option value="published">公開（Published）</option>
            <option value="draft">下書き（Draft）</option>
            <option value="private">非公開（Private）</option>
          </select>
          <small style="color:var(--text-tertiary); font-size:11px;">下書き・非公開は公開サイトに表示されません。</small>
        </div>

        <div class="field">
          <label>公開予約日時（任意）</label>
          <input type="datetime-local" id="m_publishAt" value="${escapeHtml(toDatetimeLocal(item.publishAt))}">
          <small style="color:var(--text-tertiary); font-size:11px;">設定すると、その日時を過ぎるまで公開サイトに表示されません（ステータスが「公開」の場合）。空欄なら即時公開。</small>
        </div>
      `,
      onOpen: () => {
        $('#m_category').value = item.category;
        $('#m_status').value = item.status || 'published';

        const fileInput = $('#n_imgFile');
        const removeBtn = $('#n_imgRemove');
        const updatePreview = () => {
          const preview = $('#n_imgPreview');
          if (imageState.previewUrl) {
            preview.classList.add('has-image');
            preview.innerHTML = `<img src="${imageState.previewUrl}" alt="">`;
            removeBtn.style.display = '';
          } else {
            preview.classList.remove('has-image');
            preview.innerHTML = `<div class="image-preview-placeholder">📷</div>`;
            removeBtn.style.display = 'none';
          }
        };
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) { toast('画像ファイルを選択してください', 'error'); return; }
          if (file.size > MAX_IMAGE_SIZE) { toast('5MB以内の画像を選択してください', 'error'); return; }
          imageState.pendingFile = file;
          imageState.removed = false;
          imageState.previewUrl = URL.createObjectURL(file);
          updatePreview();
        });
        removeBtn.addEventListener('click', () => {
          imageState.pendingFile = null;
          imageState.previewUrl = null;
          imageState.removed = true;
          updatePreview();
        });
      },
      onSave: () => {
        const date = $('#m_date').value.trim();
        const category = $('#m_category').value;
        const title = $('#m_title').value.trim();
        const body = $('#m_body').value;
        const status = $('#m_status').value;
        const publishAtRaw = $('#m_publishAt').value;
        const publishAt = publishAtRaw ? fromDatetimeLocal(publishAtRaw) : '';

        if (!date || !title) { toast('日付とタイトルを入力してください', 'error'); return false; }

        const newsId = item.id || `${date.replace(/\./g, '-')}-${slugify(title)}`;

        // 画像保留処理
        let imageField = item.image;
        if (imageState.removed) {
          if (item.image) pendingImageDeletes.add(item.image);
          imageField = null;
          pendingImages.delete(`news:${newsId}`);
        }
        if (imageState.pendingFile) {
          const ext = getExt(imageState.pendingFile.name);
          const path = newsImagePath(newsId, ext);
          if (item.image && item.image !== path) pendingImageDeletes.add(item.image);
          pendingImages.set(`news:${newsId}`, { blob: imageState.pendingFile, ext, path });
          imageField = path;
        }

        const updated = {
          id: newsId,
          date, category, title,
          body, image: imageField, status, publishAt,
        };
        if (isNew) data.news.list.unshift(updated);
        else data.news.list[idx] = updated;
        data.news.dirty = true;
        renderNews();
        return true;
      },
    });
  };

  const saveNews = async () => {
    // ニュース関連の保留画像を抽出
    const newsPendingKeys = [...pendingImages.keys()].filter((k) => k.startsWith('news:'));
    const newsPendingDeletes = [...pendingImageDeletes].filter((p) => p.startsWith('img/news/'));
    if (!data.news.dirty && newsPendingKeys.length === 0 && newsPendingDeletes.length === 0) {
      toast('変更はありません');
      return;
    }
    try {
      let i = 0;
      const total = newsPendingKeys.length + newsPendingDeletes.length;
      // 画像アップロード
      for (const key of newsPendingKeys) {
        i++;
        showLoading(`画像をアップロード中... (${i}/${total})`);
        const entry = pendingImages.get(key);
        await GH.uploadBinary(entry.path, entry.blob, `[admin] upload ${entry.path}`);
        pendingImages.delete(key);
      }
      // 不要画像削除
      for (const path of newsPendingDeletes) {
        i++;
        showLoading(`画像を整理中... (${i}/${total})`);
        try { await GH.deleteFile(path, `[admin] delete ${path}`); } catch (e) { console.warn(e); }
        pendingImageDeletes.delete(path);
      }

      showLoading('変更を保存中...');
      const result = await GH.updateJSON('data/news.json', data.news.list, '[admin] update news', data.news.sha);
      data.news.sha = result.content.sha;
      data.news.dirty = false;
      hideLoading();
      toast('保存しました。サイトへの反映まで1〜2分お待ちください。', 'success');
    } catch (err) {
      hideLoading();
      console.error(err);
      toast(`保存失敗：${err.message}`, 'error');
    }
  };

  // ============================================================
  // Artists Editor
  // ============================================================
  const artistsEditor = $('#artistsEditor');

  const renderArtists = () => {
    const list = data.artists.list;
    if (!list.length) {
      artistsEditor.innerHTML = '<div class="row-empty">アーティストがいません。「+ 新規アーティストを追加」から登録できます。</div>';
      return;
    }
    artistsEditor.innerHTML = list.map((item, idx) => {
      const memberCount = (item.memberItems || []).length;
      const memberInfo = (item.category === 'group' || item.category === 'unit') && memberCount > 0
        ? ` ・ ${memberCount}名のメンバー登録済み`
        : '';
      const thumbStyle = item.image ? `background-image:url('../${escapeHtml(item.image)}');background-size:cover;background-position:center;color:transparent;` : '';
      return `
      <div class="row-card" data-idx="${idx}">
        <div class="row-handle">⋮⋮</div>
        <div class="artist-thumb ${escapeHtml(item.colorVariant || 'c-1')}" style="${thumbStyle}">${escapeHtml(item.initial || '')}</div>
        <div>
          <div class="artist-name">${escapeHtml(item.name)}</div>
          <div class="artist-sub">N° ${escapeHtml(item.no || '')} ・ ${escapeHtml(item.role || '')} ・ ${escapeHtml(item.memberList || '')}${memberInfo}</div>
        </div>
        <div><span class="artist-cat-tag">${escapeHtml(item.category || '')}</span></div>
        <div class="row-actions">
          <button data-act="up">↑</button>
          <button data-act="down">↓</button>
          <button data-act="edit">編集</button>
          <button class="btn-danger" data-act="delete">削除</button>
        </div>
      </div>
      `;
    }).join('');
  };

  artistsEditor.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.row-card');
    const idx = parseInt(card.dataset.idx, 10);
    const act = btn.dataset.act;

    if (act === 'edit') openArtistModal(idx);
    if (act === 'delete') {
      if (confirm('このアーティストを削除します。よろしいですか？')) {
        data.artists.list.splice(idx, 1);
        data.artists.dirty = true;
        renderArtists();
      }
    }
    if (act === 'up' && idx > 0) {
      [data.artists.list[idx - 1], data.artists.list[idx]] = [data.artists.list[idx], data.artists.list[idx - 1]];
      data.artists.dirty = true;
      renderArtists();
    }
    if (act === 'down' && idx < data.artists.list.length - 1) {
      [data.artists.list[idx + 1], data.artists.list[idx]] = [data.artists.list[idx], data.artists.list[idx + 1]];
      data.artists.dirty = true;
      renderArtists();
    }
  });

  $('[data-action="add-artist"]').addEventListener('click', () => openArtistModal(-1));
  $('[data-action="save-artists"]').addEventListener('click', () => saveArtists());

  const openArtistModal = (idx) => {
    const isNew = idx < 0;
    const nextNo = String(data.artists.list.length + 1).padStart(2, '0');
    const item = isNew
      ? {
          id: '', no: nextNo, name: '', category: 'solo', role: '',
          members: '', memberList: '', colorVariant: 'c-1', initial: '',
          description: '', image: null, memberItems: [],
        }
      : { ...data.artists.list[idx], memberItems: [...(data.artists.list[idx].memberItems || [])] };

    // モーダル内のローカル画像状態（モーダル中にプレビュー表示・取り消し用）
    let imageState = {
      currentPath: item.image, // 既存JSONに保存されているパス
      previewUrl: item.image ? `../${item.image}` : null,
      pendingFile: null, // 新しく選んだファイル
      removed: false,
    };

    // モーダル内のメンバー状態（外部の memberItems を編集する用）
    let memberItems = item.memberItems.map((m) => ({ ...m }));

    openModal({
      title: isNew ? 'アーティストを追加' : 'アーティストを編集',
      body: `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field">
            <label>表示順 (No)</label>
            <input type="text" id="m_no" value="${escapeHtml(item.no)}" placeholder="01">
          </div>
          <div class="field">
            <label>カテゴリー</label>
            <select id="m_category">
              <option value="group">Group</option>
              <option value="solo">Solo</option>
              <option value="unit">Unit</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>名前 / Name</label>
          <input type="text" id="m_name" value="${escapeHtml(item.name)}" placeholder="LUMINAS">
        </div>
        <div class="field">
          <label>画像（最大 5MB）</label>
          <div class="image-upload">
            <div class="image-preview ${imageState.previewUrl ? 'has-image' : ''}" id="m_imgPreview">
              ${imageState.previewUrl ? `<img src="${escapeHtml(imageState.previewUrl)}" alt="">` : `<div class="image-preview-placeholder">${escapeHtml(item.initial || 'A')}</div>`}
            </div>
            <div class="image-upload-controls">
              <label class="image-upload-label">
                <input type="file" accept="image/*" class="image-upload-input" id="m_imgFile">
                画像を選択
              </label>
              <span class="image-upload-info">JPG / PNG / WebP ・5MB以内</span>
              ${imageState.previewUrl ? `<button type="button" class="image-remove-btn" id="m_imgRemove">画像を削除</button>` : ''}
            </div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="field">
            <label>イニシャル（画像なし時の表示）</label>
            <input type="text" id="m_initial" value="${escapeHtml(item.initial)}" placeholder="L" maxlength="2">
          </div>
          <div class="field">
            <label>カラーバリアント</label>
            <select id="m_color">
              <option value="c-1">c-1（ピンク系）</option>
              <option value="c-2">c-2（グリーン系）</option>
              <option value="c-3">c-3（パープル系）</option>
              <option value="c-4">c-4（イエロー系）</option>
              <option value="c-5">c-5（グリーン系）</option>
              <option value="c-6">c-6（ブルー系）</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>役柄ラベル / Role</label>
          <input type="text" id="m_role" value="${escapeHtml(item.role)}" placeholder="Girls Group">
        </div>
        <div class="field">
          <label>メンバー表記 / Members（カード表示用）</label>
          <input type="text" id="m_members" value="${escapeHtml(item.members)}" placeholder="5 Members">
        </div>
        <div class="field">
          <label>メンバー名一覧（カード表示用）</label>
          <input type="text" id="m_memberList" value="${escapeHtml(item.memberList)}" placeholder="AOI / MIKU / RIN / YUMA / SAKI">
        </div>
        <div class="field">
          <label>説明（任意）</label>
          <textarea id="m_description" rows="3">${escapeHtml(item.description || '')}</textarea>
        </div>

        <div class="members-section ${item.category === 'group' || item.category === 'unit' ? '' : 'hidden'}" id="m_membersSection">
          <div class="members-section-head">
            <h4>メンバー</h4>
            <button type="button" class="btn-ghost" id="m_addMember" style="padding:6px 14px; font-size:12px;">+ メンバーを追加</button>
          </div>
          <div class="member-list" id="m_memberList_ui"></div>
        </div>
      `,
      onOpen: () => {
        $('#m_category').value = item.category;
        $('#m_color').value = item.colorVariant;

        const renderMembers = () => {
          const ul = $('#m_memberList_ui');
          if (!memberItems.length) {
            ul.innerHTML = '<div class="member-empty">メンバーが未登録です。「+ メンバーを追加」から登録してください。</div>';
            return;
          }
          ul.innerHTML = memberItems.map((m, i) => {
            const memberKey = `member:${item.id || 'new'}:${m.id}`;
            const pending = pendingImages.get(memberKey);
            const previewUrl = pending ? URL.createObjectURL(pending.blob) : (m.image ? `../${m.image}` : null);
            const thumbStyle = previewUrl ? `background-image:url('${previewUrl}')` : '';
            return `
              <div class="member-row" data-idx="${i}">
                <div class="member-thumb" style="${thumbStyle}">${previewUrl ? '' : escapeHtml(m.initial || m.name.charAt(0).toUpperCase())}</div>
                <div class="member-info">
                  <span class="nm">${escapeHtml(m.name)}${m.nameJa ? ` <span style="color:var(--text-tertiary);font-weight:400;font-size:12px;">/ ${escapeHtml(m.nameJa)}</span>` : ''}</span>
                  <span class="rl">${escapeHtml(m.role || '')}</span>
                </div>
                <div class="row-actions">
                  <button type="button" data-mact="up">↑</button>
                  <button type="button" data-mact="down">↓</button>
                  <button type="button" data-mact="edit">編集</button>
                  <button type="button" class="btn-danger" data-mact="delete">削除</button>
                </div>
              </div>
            `;
          }).join('');
        };
        renderMembers();

        // カテゴリー変更でメンバーセクションの表示切替
        $('#m_category').addEventListener('change', (e) => {
          const v = e.target.value;
          $('#m_membersSection').classList.toggle('hidden', v !== 'group' && v !== 'unit');
        });

        // 画像ファイル選択
        const fileInput = $('#m_imgFile');
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) {
            toast('画像ファイルを選択してください', 'error'); return;
          }
          if (file.size > MAX_IMAGE_SIZE) {
            toast('5MB以内の画像を選択してください', 'error'); return;
          }
          imageState.pendingFile = file;
          imageState.removed = false;
          imageState.previewUrl = URL.createObjectURL(file);
          updateImagePreview();
        });

        const updateImagePreview = () => {
          const preview = $('#m_imgPreview');
          const initial = $('#m_initial').value.trim() || item.initial || 'A';
          if (imageState.previewUrl) {
            preview.classList.add('has-image');
            preview.innerHTML = `<img src="${imageState.previewUrl}" alt="">`;
          } else {
            preview.classList.remove('has-image');
            preview.innerHTML = `<div class="image-preview-placeholder">${escapeHtml(initial)}</div>`;
          }
          // 削除ボタンの表示制御
          const controls = preview.parentElement.querySelector('.image-upload-controls');
          let removeBtn = controls.querySelector('#m_imgRemove');
          if (imageState.previewUrl && !removeBtn) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'm_imgRemove';
            btn.className = 'image-remove-btn';
            btn.textContent = '画像を削除';
            btn.addEventListener('click', () => {
              imageState.pendingFile = null;
              imageState.previewUrl = null;
              imageState.removed = true;
              updateImagePreview();
            });
            controls.appendChild(btn);
          } else if (!imageState.previewUrl && removeBtn) {
            removeBtn.remove();
          }
        };

        // 既存の削除ボタン
        const initialRemove = $('#m_imgRemove');
        if (initialRemove) {
          initialRemove.addEventListener('click', () => {
            imageState.pendingFile = null;
            imageState.previewUrl = null;
            imageState.removed = true;
            updateImagePreview();
          });
        }

        // メンバーアクション
        const parentArtistKey = item.id || 'new';
        $('#m_addMember').addEventListener('click', () => {
          openMemberModal(-1, memberItems, parentArtistKey, () => renderMembers());
        });

        $('#m_memberList_ui').addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-mact]');
          if (!btn) return;
          const row = btn.closest('.member-row');
          const i = parseInt(row.dataset.idx, 10);
          const act = btn.dataset.mact;
          if (act === 'edit') {
            openMemberModal(i, memberItems, parentArtistKey, () => renderMembers());
          } else if (act === 'delete') {
            if (!confirm('このメンバーを削除します。よろしいですか？')) return;
            const m = memberItems[i];
            // 既存画像も削除対象に
            if (m.image) pendingImageDeletes.add(m.image);
            // 保存待ち画像も破棄
            const groupKey = item.id || 'new';
            pendingImages.delete(`member:${groupKey}:${m.id}`);
            memberItems.splice(i, 1);
            renderMembers();
          } else if (act === 'up' && i > 0) {
            [memberItems[i - 1], memberItems[i]] = [memberItems[i], memberItems[i - 1]];
            renderMembers();
          } else if (act === 'down' && i < memberItems.length - 1) {
            [memberItems[i + 1], memberItems[i]] = [memberItems[i], memberItems[i + 1]];
            renderMembers();
          }
        });
      },
      onSave: () => {
        const name = $('#m_name').value.trim();
        if (!name) { toast('名前を入力してください', 'error'); return false; }
        const category = $('#m_category').value;
        const artistId = item.id || slugify(name);

        // 画像の保留処理
        let imageField = item.image; // デフォルトは元の値
        if (imageState.removed) {
          if (item.image) pendingImageDeletes.add(item.image);
          imageField = null;
          // 保存待ちもクリア
          pendingImages.delete(`artist:${artistId}`);
        }
        if (imageState.pendingFile) {
          const ext = getExt(imageState.pendingFile.name);
          const path = artistImagePath(artistId, ext);
          // 既存と異なる拡張子の場合、旧画像を削除対象に
          if (item.image && item.image !== path) {
            pendingImageDeletes.add(item.image);
          }
          pendingImages.set(`artist:${artistId}`, { blob: imageState.pendingFile, ext, path });
          imageField = path;
        }

        // memberItems の画像保留処理：modal内 pendingImages の key を新しい artistId に張り直す
        // （新規アーティスト時は仮ID 'new' を artistId に置き換え）
        const finalMembers = memberItems.map((m) => {
          const tempKey = `member:${item.id || 'new'}:${m.id}`;
          const finalKey = `member:${artistId}:${m.id}`;
          if (pendingImages.has(tempKey)) {
            const entry = pendingImages.get(tempKey);
            const newPath = memberImagePath(artistId, m.id, entry.ext);
            pendingImages.delete(tempKey);
            pendingImages.set(finalKey, { ...entry, path: newPath });
            // 既存画像のパスが新しいパスと違う場合は削除対象に
            if (m.image && m.image !== newPath) pendingImageDeletes.add(m.image);
            return { ...m, image: newPath };
          }
          return m;
        });

        const updated = {
          id: artistId,
          no: $('#m_no').value.trim(),
          name,
          category,
          role: $('#m_role').value.trim(),
          members: $('#m_members').value.trim(),
          memberList: $('#m_memberList').value.trim(),
          colorVariant: $('#m_color').value,
          initial: $('#m_initial').value.trim() || name.charAt(0).toUpperCase(),
          description: $('#m_description').value.trim(),
          image: imageField,
          memberItems: (category === 'group' || category === 'unit') ? finalMembers : [],
        };
        if (isNew) data.artists.list.push(updated);
        else data.artists.list[idx] = updated;
        data.artists.dirty = true;
        renderArtists();
        return true;
      },
    });
  };

  // ============================================================
  // Member Modal (nested)
  // ============================================================
  const memberModal = $('#memberModal');
  const memberModalTitle = $('#memberModalTitle');
  const memberModalBody = $('#memberModalBody');
  const memberModalSave = $('#memberModalSave');
  const memberModalCancel = $('#memberModalCancel');
  const memberModalClose = $('#memberModalClose');

  let currentMemberSave = null;

  const openMemberModal = (idx, memberItems, parentArtistKey, onUpdated) => {
    const isNew = idx < 0;
    const m = isNew
      ? {
          id: '', name: '', nameJa: '', furigana: '', role: '',
          birthday: '', birthplace: '', bloodType: '', height: '',
          hobbies: '', specialties: '', catchphrase: '', description: '',
          image: null, initial: '',
          instagram: '', twitter: '', youtube: '', tiktok: '',
        }
      : { ...memberItems[idx] };

    let imageState = {
      currentPath: m.image,
      previewUrl: m.image ? `../${m.image}` : null,
      pendingFile: null,
      removed: false,
    };

    memberModalTitle.textContent = isNew ? 'メンバーを追加' : 'メンバーを編集';
    memberModalBody.innerHTML = `
      <h4 style="font-family:var(--font-display); font-style:italic; font-size:18px; color:var(--accent-strong); margin-top:-4px;">基本情報</h4>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div class="field">
          <label>名前 / Name</label>
          <input type="text" id="mm_name" value="${escapeHtml(m.name)}" placeholder="AOI">
        </div>
        <div class="field">
          <label>日本語表記（任意）</label>
          <input type="text" id="mm_nameJa" value="${escapeHtml(m.nameJa || '')}" placeholder="蒼">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div class="field">
          <label>ふりがな（任意）</label>
          <input type="text" id="mm_furigana" value="${escapeHtml(m.furigana || '')}" placeholder="あおい">
        </div>
        <div class="field">
          <label>役柄 / Position</label>
          <input type="text" id="mm_role" value="${escapeHtml(m.role || '')}" placeholder="リーダー / メインボーカル">
        </div>
      </div>

      <div class="field">
        <label>イニシャル（画像なし時のカード表示）</label>
        <input type="text" id="mm_initial" value="${escapeHtml(m.initial || '')}" placeholder="A" maxlength="2" style="max-width:120px;">
      </div>

      <div class="field">
        <label>画像（最大 5MB）</label>
        <div class="image-upload">
          <div class="image-preview ${imageState.previewUrl ? 'has-image' : ''}" id="mm_imgPreview">
            ${imageState.previewUrl ? `<img src="${escapeHtml(imageState.previewUrl)}" alt="">` : `<div class="image-preview-placeholder">${escapeHtml(m.initial || (m.name && m.name.charAt(0)) || 'A')}</div>`}
          </div>
          <div class="image-upload-controls">
            <label class="image-upload-label">
              <input type="file" accept="image/*" class="image-upload-input" id="mm_imgFile">
              画像を選択
            </label>
            <span class="image-upload-info">JPG / PNG / WebP ・5MB以内</span>
            <button type="button" class="image-remove-btn" id="mm_imgRemove" style="${imageState.previewUrl ? '' : 'display:none;'}">画像を削除</button>
          </div>
        </div>
      </div>

      <h4 style="font-family:var(--font-display); font-style:italic; font-size:18px; color:var(--accent-strong); margin-top:8px;">プロフィール</h4>

      <div class="field">
        <label>キャッチコピー（任意）</label>
        <input type="text" id="mm_catchphrase" value="${escapeHtml(m.catchphrase || '')}" placeholder="例：いつも笑顔をお届けします！">
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div class="field">
          <label>誕生日</label>
          <input type="text" id="mm_birthday" value="${escapeHtml(m.birthday || '')}" placeholder="2月14日">
        </div>
        <div class="field">
          <label>出身地</label>
          <input type="text" id="mm_birthplace" value="${escapeHtml(m.birthplace || '')}" placeholder="東京都">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div class="field">
          <label>血液型</label>
          <input type="text" id="mm_bloodType" value="${escapeHtml(m.bloodType || '')}" placeholder="O" style="max-width:120px;">
        </div>
        <div class="field">
          <label>身長</label>
          <input type="text" id="mm_height" value="${escapeHtml(m.height || '')}" placeholder="160cm" style="max-width:160px;">
        </div>
      </div>

      <div class="field">
        <label>趣味</label>
        <input type="text" id="mm_hobbies" value="${escapeHtml(m.hobbies || '')}" placeholder="映画鑑賞 / カメラ / 紅茶">
      </div>

      <div class="field">
        <label>特技</label>
        <input type="text" id="mm_specialties" value="${escapeHtml(m.specialties || '')}" placeholder="ダンス / バレエ / 英語">
      </div>

      <div class="field">
        <label>自己紹介・説明（任意）</label>
        <textarea id="mm_description" rows="4" placeholder="メンバーの自己紹介文">${escapeHtml(m.description || '')}</textarea>
      </div>

      <h4 style="font-family:var(--font-display); font-style:italic; font-size:18px; color:var(--accent-strong); margin-top:8px;">SNS（任意）</h4>

      <div class="field">
        <label>Instagram URL</label>
        <input type="url" id="mm_instagram" value="${escapeHtml(m.instagram || '')}" placeholder="https://www.instagram.com/...">
      </div>

      <div class="field">
        <label>X / Twitter URL</label>
        <input type="url" id="mm_twitter" value="${escapeHtml(m.twitter || '')}" placeholder="https://twitter.com/...">
      </div>

      <div class="field">
        <label>YouTube URL</label>
        <input type="url" id="mm_youtube" value="${escapeHtml(m.youtube || '')}" placeholder="https://www.youtube.com/...">
      </div>

      <div class="field">
        <label>TikTok URL</label>
        <input type="url" id="mm_tiktok" value="${escapeHtml(m.tiktok || '')}" placeholder="https://www.tiktok.com/...">
      </div>
    `;

    memberModal.classList.remove('hidden');

    // 画像選択
    const fileInput = $('#mm_imgFile');
    const removeBtn = $('#mm_imgRemove');
    const updatePreview = () => {
      const preview = $('#mm_imgPreview');
      const initial = $('#mm_initial').value.trim() || m.initial || ($('#mm_name').value.trim().charAt(0)) || 'A';
      if (imageState.previewUrl) {
        preview.classList.add('has-image');
        preview.innerHTML = `<img src="${imageState.previewUrl}" alt="">`;
        removeBtn.style.display = '';
      } else {
        preview.classList.remove('has-image');
        preview.innerHTML = `<div class="image-preview-placeholder">${escapeHtml(initial)}</div>`;
        removeBtn.style.display = 'none';
      }
    };
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast('画像を選択してください', 'error'); return; }
      if (file.size > MAX_IMAGE_SIZE) { toast('5MB以内', 'error'); return; }
      imageState.pendingFile = file;
      imageState.removed = false;
      imageState.previewUrl = URL.createObjectURL(file);
      updatePreview();
    });
    removeBtn.addEventListener('click', () => {
      imageState.pendingFile = null;
      imageState.previewUrl = null;
      imageState.removed = true;
      updatePreview();
    });

    currentMemberSave = () => {
      const name = $('#mm_name').value.trim();
      if (!name) { toast('名前を入力してください', 'error'); return false; }
      const memberId = m.id || slugify(name);

      const tempKey = `member:${parentArtistKey}:${memberId}`;
      if (imageState.removed) {
        if (m.image) pendingImageDeletes.add(m.image);
        pendingImages.delete(tempKey);
      }
      if (imageState.pendingFile) {
        const ext = getExt(imageState.pendingFile.name);
        pendingImages.set(tempKey, {
          blob: imageState.pendingFile,
          ext,
          path: null, // 親モーダル側で artistId 確定後に補完
        });
      }

      const updated = {
        id: memberId,
        name,
        nameJa: $('#mm_nameJa').value.trim(),
        furigana: $('#mm_furigana').value.trim(),
        role: $('#mm_role').value.trim(),
        birthday: $('#mm_birthday').value.trim(),
        birthplace: $('#mm_birthplace').value.trim(),
        bloodType: $('#mm_bloodType').value.trim(),
        height: $('#mm_height').value.trim(),
        hobbies: $('#mm_hobbies').value.trim(),
        specialties: $('#mm_specialties').value.trim(),
        catchphrase: $('#mm_catchphrase').value.trim(),
        description: $('#mm_description').value.trim(),
        initial: $('#mm_initial').value.trim() || name.charAt(0).toUpperCase(),
        image: imageState.removed ? null : (imageState.pendingFile ? null : m.image),
        instagram: $('#mm_instagram').value.trim(),
        twitter: $('#mm_twitter').value.trim(),
        youtube: $('#mm_youtube').value.trim(),
        tiktok: $('#mm_tiktok').value.trim(),
      };
      if (isNew) memberItems.push(updated);
      else memberItems[idx] = updated;
      onUpdated();
      return true;
    };
  };

  const closeMemberModal = () => {
    memberModal.classList.add('hidden');
    memberModalBody.innerHTML = '';
    currentMemberSave = null;
  };

  memberModalSave.addEventListener('click', () => {
    if (typeof currentMemberSave === 'function') {
      const ok = currentMemberSave();
      if (ok !== false) closeMemberModal();
    } else {
      closeMemberModal();
    }
  });
  memberModalCancel.addEventListener('click', closeMemberModal);
  memberModalClose.addEventListener('click', closeMemberModal);
  memberModal.addEventListener('click', (e) => { if (e.target === memberModal) closeMemberModal(); });

  const saveArtists = async () => {
    // アーティスト関連の保留画像のみ抽出
    const artistKeys = [...pendingImages.keys()].filter((k) => k.startsWith('artist:') || k.startsWith('member:'));
    const artistDeletes = [...pendingImageDeletes].filter((p) => p.startsWith('img/artists/'));
    if (!data.artists.dirty && artistKeys.length === 0 && artistDeletes.length === 0) {
      toast('変更はありません');
      return;
    }
    try {
      // 1. 画像のアップロード
      let i = 0;
      const total = artistKeys.length + artistDeletes.length;
      for (const key of artistKeys) {
        i++;
        showLoading(`画像をアップロード中... (${i}/${total})`);
        const entry = pendingImages.get(key);
        await GH.uploadBinary(entry.path, entry.blob, `[admin] upload ${entry.path}`);
        pendingImages.delete(key);
      }

      // 2. 不要画像の削除
      for (const path of artistDeletes) {
        i++;
        showLoading(`画像を整理中... (${i}/${total})`);
        try {
          await GH.deleteFile(path, `[admin] delete ${path}`);
        } catch (err) {
          console.warn('画像削除失敗:', path, err);
        }
        pendingImageDeletes.delete(path);
      }

      // 3. JSON 保存
      showLoading('変更を保存中...');
      const result = await GH.updateJSON('data/artists.json', data.artists.list, '[admin] update artists', data.artists.sha);
      data.artists.sha = result.content.sha;
      data.artists.dirty = false;
      hideLoading();
      toast('保存しました。サイトへの反映まで1〜2分お待ちください。', 'success');
    } catch (err) {
      hideLoading();
      console.error(err);
      toast(`保存失敗：${err.message}`, 'error');
    }
  };

  // ============================================================
  // Audition Editor
  // ============================================================
  const auditionEditor = $('#auditionEditor');

  const renderAudition = () => {
    const a = data.audition.obj;
    if (!a) { auditionEditor.innerHTML = ''; return; }

    auditionEditor.innerHTML = `
      <h3>基本情報</h3>
      <div class="field">
        <label>キャッチコピー</label>
        <input type="text" id="a_catchcopy" value="${escapeHtml(a.catchcopy || '')}">
      </div>
      <div class="field">
        <label>リード文（改行可）</label>
        <textarea id="a_leadText" rows="3">${escapeHtml(a.leadText || '')}</textarea>
      </div>
      <div class="field">
        <label>締切表記</label>
        <input type="text" id="a_deadline" value="${escapeHtml(a.deadline || '')}">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div class="field">
          <label>CTAボタン文言</label>
          <input type="text" id="a_ctaLabel" value="${escapeHtml(a.ctaLabel || '')}">
        </div>
        <div class="field">
          <label>CTAリンク先</label>
          <input type="text" id="a_ctaLink" value="${escapeHtml(a.ctaLink || '')}">
        </div>
      </div>

      <h3>募集要項</h3>
      <div class="list-editor" id="a_requirements"></div>
      <button type="button" class="list-editor-add" data-add="requirements">+ 項目を追加</button>

      <h3>応募方法</h3>
      <div class="list-editor" id="a_applyMethods"></div>
      <button type="button" class="list-editor-add" data-add="applyMethods">+ 項目を追加</button>

      <h3>選考フロー（4ステップ）</h3>
      <div class="steps-editor" id="a_steps"></div>
      <button type="button" class="list-editor-add" data-add="steps">+ ステップを追加</button>

      <h3>スケジュール</h3>
      <div class="schedule-editor" id="a_schedule"></div>
      <button type="button" class="list-editor-add" data-add="schedule">+ 行を追加</button>
    `;

    renderListField('a_requirements', a.requirements || [], 'requirements');
    renderListField('a_applyMethods', a.applyMethods || [], 'applyMethods');
    renderStepsField(a.steps || []);
    renderScheduleField(a.schedule || []);
  };

  const renderListField = (containerId, items, key) => {
    const container = $('#' + containerId);
    container.innerHTML = items.map((v, i) => `
      <div class="list-editor-row">
        <input type="text" value="${escapeHtml(v)}" data-key="${key}" data-idx="${i}">
        <button type="button" class="btn-icon" data-remove="${key}" data-idx="${i}">✕</button>
      </div>
    `).join('');
  };

  const renderStepsField = (steps) => {
    const container = $('#a_steps');
    container.innerHTML = steps.map((s, i) => `
      <div class="step-card" data-idx="${i}">
        <div class="step-card-row">
          <div><label>番号</label><input type="text" value="${escapeHtml(s.num)}" data-step="num"></div>
          <div><label>タイトル</label><input type="text" value="${escapeHtml(s.title)}" data-step="title"></div>
        </div>
        <div><label>説明</label><textarea data-step="description" rows="2">${escapeHtml(s.description)}</textarea></div>
        <div class="step-card-actions"><button type="button" class="btn-danger" data-remove="steps" data-idx="${i}">削除</button></div>
      </div>
    `).join('');
  };

  const renderScheduleField = (rows) => {
    const container = $('#a_schedule');
    container.innerHTML = rows.map((r, i) => `
      <div class="schedule-card" data-idx="${i}">
        <div class="step-card-row">
          <div><label>ラベル</label><input type="text" value="${escapeHtml(r.label)}" data-sched="label"></div>
          <div><label>内容</label><input type="text" value="${escapeHtml(r.value)}" data-sched="value"></div>
        </div>
        <div class="schedule-card-actions"><button type="button" class="btn-danger" data-remove="schedule" data-idx="${i}">削除</button></div>
      </div>
    `).join('');
  };

  // 入力変更を反映
  auditionEditor.addEventListener('input', (e) => {
    const t = e.target;
    const a = data.audition.obj;
    if (!a) return;

    if (t.id === 'a_catchcopy') a.catchcopy = t.value;
    else if (t.id === 'a_leadText') a.leadText = t.value;
    else if (t.id === 'a_deadline') a.deadline = t.value;
    else if (t.id === 'a_ctaLabel') a.ctaLabel = t.value;
    else if (t.id === 'a_ctaLink') a.ctaLink = t.value;

    if (t.dataset.key) {
      const arr = a[t.dataset.key];
      arr[parseInt(t.dataset.idx, 10)] = t.value;
    }

    if (t.dataset.step) {
      const card = t.closest('.step-card');
      const i = parseInt(card.dataset.idx, 10);
      a.steps[i][t.dataset.step] = t.value;
    }

    if (t.dataset.sched) {
      const card = t.closest('.schedule-card');
      const i = parseInt(card.dataset.idx, 10);
      a.schedule[i][t.dataset.sched] = t.value;
    }

    data.audition.dirty = true;
  });

  // 追加・削除
  auditionEditor.addEventListener('click', (e) => {
    const a = data.audition.obj;
    if (!a) return;
    const addBtn = e.target.closest('button[data-add]');
    if (addBtn) {
      const k = addBtn.dataset.add;
      if (k === 'requirements' || k === 'applyMethods') {
        a[k] = a[k] || [];
        a[k].push('');
      } else if (k === 'steps') {
        a.steps = a.steps || [];
        a.steps.push({ num: `Step 0${a.steps.length + 1}`, title: '', description: '' });
      } else if (k === 'schedule') {
        a.schedule = a.schedule || [];
        a.schedule.push({ label: '', value: '' });
      }
      data.audition.dirty = true;
      renderAudition();
      return;
    }

    const removeBtn = e.target.closest('button[data-remove]');
    if (removeBtn) {
      const k = removeBtn.dataset.remove;
      const i = parseInt(removeBtn.dataset.idx, 10);
      if (a[k] && a[k][i] !== undefined) {
        if (!confirm('この項目を削除します。よろしいですか？')) return;
        a[k].splice(i, 1);
        data.audition.dirty = true;
        renderAudition();
      }
    }
  });

  $('[data-action="save-audition"]').addEventListener('click', () => saveAudition());

  const saveAudition = async () => {
    if (!data.audition.dirty) { toast('変更はありません'); return; }
    showLoading('変更を保存中...');
    try {
      const result = await GH.updateJSON('data/audition.json', data.audition.obj, '[admin] update audition', data.audition.sha);
      data.audition.sha = result.content.sha;
      data.audition.dirty = false;
      hideLoading();
      toast('保存しました。サイトへの反映まで1〜2分お待ちください。', 'success');
    } catch (err) {
      hideLoading();
      console.error(err);
      toast(`保存失敗：${err.message}`, 'error');
    }
  };

  // ============================================================
  // Featured (Top Page)
  // ============================================================
  const featuredEditor = $('#featuredEditor');

  // featured アイテム → 表示用情報を取得
  const resolveFeaturedItem = (it) => {
    if (it.type === 'artist') {
      const a = data.artists.list.find((x) => x.id === it.id);
      if (!a) return null;
      return {
        type: 'artist',
        label: a.name,
        sub: `Artist ・ ${a.role || a.category || ''}`,
        image: a.image,
        initial: a.initial,
        colorVariant: a.colorVariant,
      };
    }
    if (it.type === 'member') {
      const a = data.artists.list.find((x) => x.id === it.artistId);
      if (!a) return null;
      const m = (a.memberItems || []).find((x) => x.id === it.memberId);
      if (!m) return null;
      return {
        type: 'member',
        label: m.name,
        sub: `Member ・ ${a.name}${m.role ? ' / ' + m.role : ''}`,
        image: m.image,
        initial: m.initial,
        colorVariant: a.colorVariant,
      };
    }
    return null;
  };

  const renderFeatured = () => {
    const items = data.featured.items;
    if (!items.length) {
      featuredEditor.innerHTML = `<div class="row-empty">表示項目が未設定です。「+ 項目を追加」から登録してください。<br><small style="color:var(--text-tertiary);">未設定の場合、トップページにはアーティスト先頭6件が表示されます。</small></div>`;
      return;
    }
    featuredEditor.innerHTML = items.map((it, idx) => {
      const info = resolveFeaturedItem(it);
      if (!info) {
        return `
          <div class="row-card" data-idx="${idx}" style="opacity:0.6;">
            <div class="row-handle">⋮⋮</div>
            <div class="artist-thumb" style="background:var(--bg-secondary);">?</div>
            <div>
              <div class="artist-name">（削除済み）</div>
              <div class="artist-sub">${escapeHtml(JSON.stringify(it))}</div>
            </div>
            <div></div>
            <div class="row-actions">
              <button class="btn-danger" data-fact="delete">削除</button>
            </div>
          </div>
        `;
      }
      const thumbStyle = info.image ? `background-image:url('../${escapeHtml(info.image)}');background-size:cover;background-position:center;color:transparent;` : '';
      const tagColor = info.type === 'artist' ? 'is-media' : 'is-info';
      return `
        <div class="row-card" data-idx="${idx}">
          <div class="row-handle">⋮⋮</div>
          <div class="artist-thumb ${escapeHtml(info.colorVariant || 'c-1')}" style="${thumbStyle}">${escapeHtml(info.initial || '')}</div>
          <div>
            <div class="artist-name">${escapeHtml(info.label)}</div>
            <div class="artist-sub">${escapeHtml(info.sub)}</div>
          </div>
          <div><span class="row-tag ${tagColor}">${info.type === 'artist' ? 'Artist' : 'Member'}</span></div>
          <div class="row-actions">
            <button data-fact="up">↑</button>
            <button data-fact="down">↓</button>
            <button class="btn-danger" data-fact="delete">削除</button>
          </div>
        </div>
      `;
    }).join('');
  };

  featuredEditor.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-fact]');
    if (!btn) return;
    const card = btn.closest('.row-card');
    const idx = parseInt(card.dataset.idx, 10);
    const act = btn.dataset.fact;
    const items = data.featured.items;

    if (act === 'delete') {
      if (!confirm('この項目をTop Pageから外します。よろしいですか？')) return;
      items.splice(idx, 1);
      data.featured.dirty = true;
      renderFeatured();
    } else if (act === 'up' && idx > 0) {
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
      data.featured.dirty = true;
      renderFeatured();
    } else if (act === 'down' && idx < items.length - 1) {
      [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
      data.featured.dirty = true;
      renderFeatured();
    }
  });

  $('[data-action="add-featured"]').addEventListener('click', () => {
    if (data.featured.items.length >= FEATURED_MAX) {
      toast(`Top Page 表示は最大${FEATURED_MAX}件までです`, 'error');
      return;
    }
    openFeaturedPicker();
  });

  $('[data-action="save-featured"]').addEventListener('click', () => saveFeatured());

  const openFeaturedPicker = () => {
    // 既に追加済みの項目を除外
    const existing = new Set(
      data.featured.items.map((it) =>
        it.type === 'artist' ? `a:${it.id}` : `m:${it.artistId}:${it.memberId}`
      )
    );

    // 候補リストを生成
    const groupSections = data.artists.list.map((a) => {
      const isAdded = (key) => existing.has(key);
      const aKey = `a:${a.id}`;
      const aRow = `
        <div class="picker-row ${isAdded(aKey) ? 'is-added' : ''}" data-pick='${escapeHtml(JSON.stringify({ type: 'artist', id: a.id }))}' data-key="${aKey}">
          <div class="artist-thumb ${escapeHtml(a.colorVariant || 'c-1')}" style="${a.image ? `background-image:url('../${escapeHtml(a.image)}');background-size:cover;background-position:center;color:transparent;` : ''}">${escapeHtml(a.initial || '')}</div>
          <div>
            <div class="artist-name">${escapeHtml(a.name)}</div>
            <div class="artist-sub">Artist ・ ${escapeHtml(a.role || a.category || '')}</div>
          </div>
          <div>${isAdded(aKey) ? '<span class="row-tag is-info">追加済み</span>' : '<button class="btn-ghost" data-act="pick">追加</button>'}</div>
        </div>
      `;
      const memberRows = (a.memberItems || []).map((m) => {
        const mKey = `m:${a.id}:${m.id}`;
        return `
          <div class="picker-row ${isAdded(mKey) ? 'is-added' : ''}" data-pick='${escapeHtml(JSON.stringify({ type: 'member', artistId: a.id, memberId: m.id }))}' data-key="${mKey}" style="padding-left:32px;">
            <div class="artist-thumb ${escapeHtml(a.colorVariant || 'c-1')}" style="${m.image ? `background-image:url('../${escapeHtml(m.image)}');background-size:cover;background-position:center;color:transparent;` : ''}">${escapeHtml(m.initial || '')}</div>
            <div>
              <div class="artist-name">${escapeHtml(m.name)}${m.nameJa ? ` <span style="color:var(--text-tertiary); font-weight:400; font-size:12px;">/ ${escapeHtml(m.nameJa)}</span>` : ''}</div>
              <div class="artist-sub">Member ・ ${escapeHtml(a.name)}${m.role ? ' / ' + escapeHtml(m.role) : ''}</div>
            </div>
            <div>${isAdded(mKey) ? '<span class="row-tag is-info">追加済み</span>' : '<button class="btn-ghost" data-act="pick">追加</button>'}</div>
          </div>
        `;
      }).join('');
      return aRow + memberRows;
    }).join('');

    openModal({
      title: 'Top Pageに追加する項目を選択',
      body: `
        <p style="font-size:13px; color:var(--text-secondary); margin-bottom:8px;">
          残り <strong>${FEATURED_MAX - data.featured.items.length}</strong> 件追加可能。クリックすると即座に追加されます。
        </p>
        <div class="picker-list">${groupSections || '<div class="row-empty">アーティストが登録されていません。</div>'}</div>
      `,
      onOpen: () => {
        const list = modalBody.querySelector('.picker-list');
        if (!list) return;
        list.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-act="pick"]');
          if (!btn) return;
          const row = btn.closest('.picker-row');
          if (!row) return;
          if (data.featured.items.length >= FEATURED_MAX) {
            toast(`最大${FEATURED_MAX}件までです`, 'error');
            return;
          }
          try {
            const item = JSON.parse(row.dataset.pick);
            data.featured.items.push(item);
            data.featured.dirty = true;
            row.classList.add('is-added');
            row.querySelector('div:last-child').innerHTML = '<span class="row-tag is-info">追加済み</span>';
            renderFeatured();
            // 残り数表示を更新
            const remainEl = modalBody.querySelector('p strong');
            if (remainEl) remainEl.textContent = String(FEATURED_MAX - data.featured.items.length);
          } catch (err) {
            console.error(err);
          }
        });
      },
      onSave: () => true, // ピッカーは即時反映なので「適用」は閉じるだけ
    });
  };

  const saveFeatured = async () => {
    if (!data.featured.dirty) { toast('変更はありません'); return; }
    showLoading('変更を保存中...');
    try {
      const payload = { items: data.featured.items };
      const result = await GH.updateJSON('data/featured.json', payload, '[admin] update featured', data.featured.sha);
      data.featured.sha = result.content.sha;
      data.featured.dirty = false;
      hideLoading();
      toast('保存しました。サイトへの反映まで1〜2分お待ちください。', 'success');
    } catch (err) {
      hideLoading();
      console.error(err);
      toast(`保存失敗：${err.message}`, 'error');
    }
  };

  // ============================================================
  // Modal
  // ============================================================
  const modal = $('#modal');
  const modalTitle = $('#modalTitle');
  const modalBody = $('#modalBody');
  const modalSave = $('#modalSave');
  const modalCancel = $('#modalCancel');
  const modalClose = $('#modalClose');

  let currentModalSave = null;
  const openModal = ({ title, body, onSave, onOpen }) => {
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    currentModalSave = onSave;
    modal.classList.remove('hidden');
    if (typeof onOpen === 'function') onOpen();
  };
  const closeModal = () => {
    modal.classList.add('hidden');
    modalBody.innerHTML = '';
    currentModalSave = null;
  };
  modalSave.addEventListener('click', () => {
    if (typeof currentModalSave === 'function') {
      const ok = currentModalSave();
      if (ok !== false) closeModal();
    } else {
      closeModal();
    }
  });
  modalCancel.addEventListener('click', closeModal);
  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // ============================================================
  // Helpers
  // ============================================================
  const formatToday = () => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const slugify = (str) => {
    return String(str)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `item-${Date.now()}`;
  };

  // ---------- 離脱時の警告 ----------
  window.addEventListener('beforeunload', (e) => {
    if (data.news.dirty || data.artists.dirty || data.audition.dirty || data.featured.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---------- 初期化 ----------
  initLoginForm();
})();
