/* =========================================
   PECHUNIA Admin — GitHub API Wrapper
   ========================================= */

(function () {
  'use strict';

  const API_BASE = 'https://api.github.com';
  const STORAGE_KEY = 'pechunia_admin_auth';

  const state = {
    owner: '',
    repo: '',
    token: '',
    user: null,
    branch: 'main',
  };

  // ---------- localStorage ----------
  const loadAuth = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  };

  const saveAuth = (auth) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  };

  const clearAuth = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  // ---------- Base fetch ----------
  const apiFetch = async (path, options = {}) => {
    const url = path.startsWith('http') ? path : API_BASE + path;
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Authorization': `Bearer ${state.token}`,
      ...(options.headers || {}),
    };
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
      let detail = '';
      try {
        const json = await res.json();
        detail = json.message || JSON.stringify(json);
      } catch (e) {
        detail = res.statusText;
      }
      const error = new Error(`GitHub API ${res.status}: ${detail}`);
      error.status = res.status;
      throw error;
    }

    if (res.status === 204) return null;
    return res.json();
  };

  // ---------- Auth ----------
  const setAuth = ({ owner, repo, token }) => {
    state.owner = owner;
    state.repo = repo;
    state.token = token;
  };

  const verifyToken = async () => {
    // /user で認証確認
    const user = await apiFetch('/user');
    state.user = user;
    // リポジトリへのアクセス確認
    await apiFetch(`/repos/${state.owner}/${state.repo}`);
    return user;
  };

  // ---------- File operations ----------
  // base64エンコード（UTF-8対応）
  const utf8ToBase64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
  };

  const base64ToUtf8 = (b64) => {
    const binary = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  // ファイル取得（contentとshaを返す）
  const getFile = async (path) => {
    const data = await apiFetch(
      `/repos/${state.owner}/${state.repo}/contents/${path}?ref=${state.branch}`
    );
    return {
      sha: data.sha,
      content: base64ToUtf8(data.content),
      raw: data,
    };
  };

  // JSONファイル取得
  const getJSON = async (path) => {
    const file = await getFile(path);
    return {
      sha: file.sha,
      data: JSON.parse(file.content),
    };
  };

  // ファイル更新（コミット）
  const updateFile = async (path, content, message, sha) => {
    const body = {
      message,
      content: utf8ToBase64(content),
      branch: state.branch,
      committer: state.user
        ? {
            name: state.user.name || state.user.login,
            email: state.user.email || `${state.user.login}@users.noreply.github.com`,
          }
        : undefined,
    };
    if (sha) body.sha = sha;

    return apiFetch(
      `/repos/${state.owner}/${state.repo}/contents/${path}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    );
  };

  // JSONファイル更新
  const updateJSON = async (path, data, message, sha) => {
    const content = JSON.stringify(data, null, 2) + '\n';
    return updateFile(path, content, message, sha);
  };

  // ---------- Binary file upload ----------
  // Blob/File → base64
  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        // "data:image/...;base64,XXXX" の "XXXX" 部分のみ
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  // 既存ファイルのSHAを取得（存在しない場合はnull）
  const tryGetSha = async (path) => {
    try {
      const data = await apiFetch(
        `/repos/${state.owner}/${state.repo}/contents/${path}?ref=${state.branch}`
      );
      return data.sha;
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  };

  // バイナリアップロード（既存ファイルがあれば自動で上書き）
  const uploadBinary = async (path, blob, message) => {
    const base64 = await blobToBase64(blob);
    const sha = await tryGetSha(path);
    const body = {
      message: message || `[admin] upload ${path}`,
      content: base64,
      branch: state.branch,
      committer: state.user
        ? {
            name: state.user.name || state.user.login,
            email: state.user.email || `${state.user.login}@users.noreply.github.com`,
          }
        : undefined,
    };
    if (sha) body.sha = sha;

    return apiFetch(`/repos/${state.owner}/${state.repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  };

  // ファイル削除
  const deleteFile = async (path, message) => {
    const sha = await tryGetSha(path);
    if (!sha) return null;
    return apiFetch(`/repos/${state.owner}/${state.repo}/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({
        message: message || `[admin] delete ${path}`,
        sha,
        branch: state.branch,
      }),
    });
  };

  // 公開
  window.PechuniaGitHub = {
    state,
    loadAuth,
    saveAuth,
    clearAuth,
    setAuth,
    verifyToken,
    getFile,
    getJSON,
    updateFile,
    updateJSON,
    uploadBinary,
    deleteFile,
    tryGetSha,
  };
})();
