# GitHub への公開手順

PECHUNIA サイトを GitHub にアップして、GitHub Pages で公開する手順です。
お手元のターミナル（macOS の Terminal.app）からコマンドをコピペで実行してください。

---

## 0. 事前準備（一度だけ）

### サンドボックスが作った壊れた `.git` を削除

Claude のサンドボックス環境が中途半端に `.git` フォルダを作ってしまっているので、
最初に削除します（ターミナルで実行）：

```bash
cd "/Users/yamadadaiki/Documents/Claude Code/pechunia_web"
sudo rm -rf .git
```

※ Mac のパスワードを聞かれたら入力してください。

### git のユーザー情報（未設定なら）

```bash
git config --global user.name  "あなたの名前"
git config --global user.email "yamada@real-nature.jp"
```

---

## 1. ローカルで git 初期化 → 初回コミット

```bash
cd "/Users/yamadadaiki/Documents/Claude Code/pechunia_web"

git init -b main
git add -A
git commit -m "Initial commit: PECHUNIA website"
```

---

## 2. GitHub にリポジトリを作成

### 方法A：GitHub CLI を使う（おすすめ・一発）

GitHub CLI（`gh`）が入っていない場合は事前に：

```bash
brew install gh
gh auth login          # ブラウザ認証で OK
```

入っていれば：

```bash
cd "/Users/yamadadaiki/Documents/Claude Code/pechunia_web"

gh repo create pechunia-web --public --source=. --remote=origin --push
```

これでリポジトリ作成 → push まで一発で完了します。

### 方法B：ブラウザで作る

1. https://github.com/new を開く
2. **Repository name** に `pechunia-web` などを入力
3. Public を選択（GitHub Pages の無料プランは公開リポジトリ向け）
4. **Create repository** をクリック
5. 表示される手順のうち「…or push an existing repository from the command line」のコマンドを実行：

```bash
cd "/Users/yamadadaiki/Documents/Claude Code/pechunia_web"

git remote add origin https://github.com/【あなたのユーザー名】/pechunia-web.git
git push -u origin main
```

---

## 3. GitHub Pages を有効化

1. GitHub のリポジトリページを開く
2. **Settings** タブ → 左メニュー **Pages**
3. **Build and deployment** セクションで：
   - **Source**：`Deploy from a branch`
   - **Branch**：`main` / `/ (root)` を選択 → **Save**
4. 1〜2 分待つと、上部に公開 URL が表示されます：

```
https://【あなたのユーザー名】.github.io/pechunia-web/
```

これでサイトが世界に公開されました 🎉

---

## 4. 以降の更新フロー

サイトを修正したら：

```bash
cd "/Users/yamadadaiki/Documents/Claude Code/pechunia_web"

git add -A
git commit -m "更新内容のメモ"
git push
```

push 後、数十秒〜2 分ほどで GitHub Pages にも反映されます。

---

## トラブルシュート

**`git push` で permission denied と出る**
→ HTTPS 認証の場合は GitHub の Personal Access Token が必要です。
　`gh auth login` で OAuth 認証するのが一番楽です。

**Pages の URL が 404 になる**
→ Pages の有効化直後は反映に時間がかかることがあります。Settings → Pages を再度確認し、
　**Your site is live at …** と表示されるのを待ってください。

**ファイルが Pages 上で読み込まれない**
→ `.nojekyll` ファイルが含まれていることを確認してください（同梱済みです）。
