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
  };

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

      renderNews();
      renderArtists();
      renderAudition();
      hideLoading();
    } catch (err) {
      hideLoading();
      console.error(err);
      toast(`データの読み込みに失敗：${err.message}`, 'error');
    }
  };

  // ---------- Logout ----------
  $('#logoutBtn').addEventListener('click', () => {
    if ((data.news.dirty || data.artists.dirty || data.audition.dirty) &&
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
    newsEditor.innerHTML = list.map((item, idx) => `
      <div class="row-card" data-idx="${idx}">
        <div class="row-handle" title="ドラッグで並び替え">⋮⋮</div>
        <div class="row-date">${escapeHtml(item.date)}</div>
        <div><span class="row-tag is-${escapeHtml(item.category)}">${escapeHtml(item.category || '')}</span></div>
        <div class="row-title">${escapeHtml(item.title)}</div>
        <div class="row-actions">
          <button data-act="up">↑</button>
          <button data-act="down">↓</button>
          <button data-act="edit">編集</button>
          <button class="btn-danger" data-act="delete">削除</button>
        </div>
      </div>
    `).join('');
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
      ? { id: '', date: formatToday(), category: 'info', title: '' }
      : { ...data.news.list[idx] };

    openModal({
      title: isNew ? 'ニュースを追加' : 'ニュースを編集',
      body: `
        <div class="field">
          <label>日付</label>
          <input type="text" id="m_date" value="${escapeHtml(item.date)}" placeholder="YYYY.MM.DD">
        </div>
        <div class="field">
          <label>カテゴリー</label>
          <select id="m_category">
            <option value="live">LIVE（公演）</option>
            <option value="media">MEDIA（メディア）</option>
            <option value="info">INFO（お知らせ）</option>
          </select>
        </div>
        <div class="field">
          <label>タイトル</label>
          <textarea id="m_title" rows="3" placeholder="ニュース本文">${escapeHtml(item.title)}</textarea>
        </div>
      `,
      onOpen: () => { $('#m_category').value = item.category; },
      onSave: () => {
        const date = $('#m_date').value.trim();
        const category = $('#m_category').value;
        const title = $('#m_title').value.trim();
        if (!date || !title) { toast('日付とタイトルを入力してください', 'error'); return false; }
        const updated = {
          id: item.id || `${date.replace(/\./g, '-')}-${slugify(title)}`,
          date, category, title,
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
    if (!data.news.dirty) { toast('変更はありません'); return; }
    showLoading('変更を保存中...');
    try {
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
      ? { id: '', name: '', nameJa: '', role: '', image: null, initial: '' }
      : { ...memberItems[idx] };

    let imageState = {
      currentPath: m.image,
      previewUrl: m.image ? `../${m.image}` : null,
      pendingFile: null,
      removed: false,
    };

    memberModalTitle.textContent = isNew ? 'メンバーを追加' : 'メンバーを編集';
    memberModalBody.innerHTML = `
      <div class="field">
        <label>名前 / Name</label>
        <input type="text" id="mm_name" value="${escapeHtml(m.name)}" placeholder="AOI">
      </div>
      <div class="field">
        <label>日本語表記（任意）</label>
        <input type="text" id="mm_nameJa" value="${escapeHtml(m.nameJa || '')}" placeholder="蒼">
      </div>
      <div class="field">
        <label>役柄ラベル / Role</label>
        <input type="text" id="mm_role" value="${escapeHtml(m.role || '')}" placeholder="Leader / Main Vocal">
      </div>
      <div class="field">
        <label>イニシャル（画像なし時の表示）</label>
        <input type="text" id="mm_initial" value="${escapeHtml(m.initial || '')}" placeholder="A" maxlength="2">
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
        role: $('#mm_role').value.trim(),
        initial: $('#mm_initial').value.trim() || name.charAt(0).toUpperCase(),
        image: imageState.removed ? null : (imageState.pendingFile ? null : m.image),
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
    if (!data.artists.dirty && pendingImages.size === 0 && pendingImageDeletes.size === 0) {
      toast('変更はありません');
      return;
    }
    try {
      // 1. 画像のアップロード
      let i = 0;
      const total = pendingImages.size + pendingImageDeletes.size;
      for (const [key, entry] of pendingImages) {
        i++;
        showLoading(`画像をアップロード中... (${i}/${total})`);
        await GH.uploadBinary(entry.path, entry.blob, `[admin] upload ${entry.path}`);
      }
      pendingImages.clear();

      // 2. 不要画像の削除
      for (const path of pendingImageDeletes) {
        i++;
        showLoading(`画像を整理中... (${i}/${total})`);
        try {
          await GH.deleteFile(path, `[admin] delete ${path}`);
        } catch (err) {
          console.warn('画像削除失敗:', path, err);
        }
      }
      pendingImageDeletes.clear();

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
    if (data.news.dirty || data.artists.dirty || data.audition.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---------- 初期化 ----------
  initLoginForm();
})();
