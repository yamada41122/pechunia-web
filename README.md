# PECHUNIA — Idol & Artist Management Website

> Bloom in your color.

アイドル・アーティスト マネジメント・エージェンシー **PECHUNIA** の公式ウェブサイト。
HTML / CSS / JavaScript のみで構築された静的サイトです。

## ページ構成

| ページ | ファイル | 内容 |
| --- | --- | --- |
| HOME | `index.html` | ヒーロー・ニュース・所属アーティスト・About・CTA |
| ARTISTS | `artists.html` | 所属アーティスト一覧（フィルタ付き） |
| ARTIST DETAIL | `artist-detail.html` | 個別プロフィール（AOI / LUMINAS） |
| NEWS | `news.html` | 新着情報一覧 |
| AUDITION | `audition.html` | 第7期生オーディション募集 |
| COMPANY | `company.html` | 会社概要・沿革 |
| CONTACT | `contact.html` | お問い合わせフォーム |

## ファイル構成

```
.
├── index.html
├── artists.html
├── artist-detail.html
├── news.html
├── audition.html
├── company.html
├── contact.html
├── css/
│   └── style.css
├── js/
│   └── main.js
└── img/
    ├── logo.svg
    └── logo-mark.svg
```

## デザイン

- **テーマ**：爽やか × エレガント（ライト）
- **カラー**：淡い水色 `#7eb6d1` × ホワイト × ソフトグレー `#3a4a58`
- **フォント**：Cormorant Garamond / Montserrat / Noto Sans JP

## ローカルでの確認

`index.html` をブラウザで直接開けば動作します。
ファイル参照のみのため、サーバーは不要です。

```bash
# macOS の場合
open index.html
```

## デプロイ（GitHub Pages）

`main` ブランチに push 後、リポジトリの **Settings → Pages** で
ソースを `main` / `/ (root)` に指定すると、自動で公開されます。

## License

© 2026 PECHUNIA Limited Liability Company. All Rights Reserved.
