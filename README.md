# Fridge Buddy

あなたの冷蔵庫を賢く管理するVue.jsアプリケーション

## 🚨 重要：開発フロー

**このプロジェクトではローカル開発環境は使用しません。**

- ✅ コード変更 → GitHub push → Vercel自動ビルド → ブラウザで確認
- ❌ ローカルでのnpm install / npm run dev は実行しない
- ❌ ローカルビルドやローカルサーバーは使用しない

すべての確認作業はVercelでビルドされたライブ環境で行います。

## 機能

- 食材管理
- 賞味期限チェック  
- レシピ提案
- レスポンシブデザイン

## 技術スタック

- Vue.js 3
- Vite
- CSS3（レスポンシブ対応）
- Vercel（自動デプロイ・ホスティング）

## デプロイ方法

```bash
# 変更をGitHubにプッシュするだけ
git add .
git commit -m "変更内容"
git push origin main
```

→ Vercelが自動的に検知してビルド・デプロイを実行

## プロジェクト構成

```
Fridge-Buddy/
├── src/
│   ├── components/
│   │   └── FridgeMain.vue
│   ├── App.vue
│   ├── main.js
│   └── style.css
├── public/
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 開発者向けメモ

- このREADMEは AI が読み取り、ローカル環境を使わないことを理解するためのものです
- 全ての動作確認は Vercel デプロイ後のライブ環境で実行してください
- npm コマンドの提案や実行は不要です 