#!/bin/bash
# =============================================================
#  PECHUNIA — GitHub 公開ワンコマンドセットアップスクリプト
# =============================================================
#  使い方：ターミナルで下記を実行
#    cd "/Users/yamadadaiki/Documents/Claude Code/pechunia_web"
#    bash setup-github.sh
# =============================================================

set -e

REPO_NAME="pechunia-web"
DEFAULT_BRANCH="main"

echo ""
echo "================================================="
echo "  PECHUNIA → GitHub 公開セットアップ"
echo "================================================="
echo ""

# --- 1. 壊れた .git を掃除 ---
if [ -d ".git" ]; then
  echo "[1/5] 既存の .git フォルダを削除します..."
  rm -rf .git
  echo "      → done"
else
  echo "[1/5] .git フォルダはありません。スキップ。"
fi

# --- 2. git 初期化 ---
echo ""
echo "[2/5] git リポジトリを初期化..."
git init -b "$DEFAULT_BRANCH" >/dev/null
echo "      → done (branch: $DEFAULT_BRANCH)"

# --- 3. 初回コミット ---
echo ""
echo "[3/5] ファイルを追加してコミット..."
git add -A
git commit -m "Initial commit: PECHUNIA website" >/dev/null
echo "      → done"

# --- 4. GitHub リポジトリ作成 + push ---
echo ""
echo "[4/5] GitHub にリポジトリを作成して push..."

if command -v gh >/dev/null 2>&1; then
  # gh CLI が入っている場合
  if ! gh auth status >/dev/null 2>&1; then
    echo "      → gh への認証が必要です。ブラウザが開きます..."
    gh auth login
  fi

  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
  echo "      → done"

  USER_NAME=$(gh api user -q .login)
  PAGES_URL="https://${USER_NAME}.github.io/${REPO_NAME}/"
else
  echo ""
  echo "  ※ GitHub CLI (gh) が見つかりません。"
  echo "    手動で以下を実行してください："
  echo ""
  echo "    1) https://github.com/new でリポジトリ「$REPO_NAME」を作成（Public）"
  echo "    2) 下記コマンドを実行："
  echo ""
  echo "       git remote add origin https://github.com/【あなたのユーザー名】/${REPO_NAME}.git"
  echo "       git push -u origin main"
  echo ""
  echo "    （gh をインストールするには: brew install gh）"
  exit 0
fi

# --- 5. GitHub Pages 有効化 ---
echo ""
echo "[5/5] GitHub Pages を有効化..."
gh api -X POST "repos/${USER_NAME}/${REPO_NAME}/pages" \
  -f "source[branch]=$DEFAULT_BRANCH" \
  -f "source[path]=/" 2>/dev/null \
  && echo "      → 有効化成功" \
  || echo "      → 既に有効化済み or APIで弾かれた場合は Settings → Pages を手動確認"

echo ""
echo "================================================="
echo "  ✓ セットアップ完了！"
echo "================================================="
echo ""
echo "  リポジトリ: https://github.com/${USER_NAME}/${REPO_NAME}"
echo "  公開URL  : ${PAGES_URL}"
echo ""
echo "  ※ Pages の URL は反映に1〜2分かかります。"
echo ""
