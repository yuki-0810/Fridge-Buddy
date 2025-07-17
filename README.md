# Fridge Buddy

あなたの冷蔵庫を賢く管理するVue.jsアプリケーション

## 🚨 重要：開発フロー

**このプロジェクトではローカル開発環境は使用しません。**

- ✅ コード変更 → GitHub push → Vercel自動ビルド → ブラウザで確認
- ❌ ローカルでのnpm install / npm run dev は実行しない
- ❌ ローカルビルドやローカルサーバーは使用しない

すべての確認作業はVercelでビルドされたライブ環境で行います。

## 🗄️ Supabase設定

### 1. 環境変数設定（Vercel）

Vercelの管理画面で以下の環境変数を設定してください：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 2. テスト用テーブル作成

Supabase SQLエディタで以下のテーブルを作成してください：

```sql
-- fridge_itemsテーブル作成
CREATE TABLE fridge_items (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) 有効化
ALTER TABLE fridge_items ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーのみアクセス可能なポリシー作成
CREATE POLICY "Users can view own items" ON fridge_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items" ON fridge_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items" ON fridge_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items" ON fridge_items
  FOR DELETE USING (auth.uid() = user_id);
```

### 3. 認証設定

Supabase管理画面の Authentication → Settings で：
- Email confirmation を無効化（テスト用）
- または適切なEmail providerを設定

## 機能

- ✅ Supabase接続テスト
- ✅ 認証機能（サインアップ・ログイン・ログアウト）
- ✅ テーブル操作（CRUD）
- 🚧 食材管理
- 🚧 賞味期限チェック  
- 🚧 レシピ提案
- ✅ レスポンシブデザイン

## 技術スタック

- Vue.js 3
- Vite
- Supabase (認証・データベース)
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

## 🧪 テスト方法

1. Vercelでデプロイ後、アプリにアクセス
2. 「Supabaseテスト」タブをクリック
3. 以下の順序でテスト：
   - 接続テスト
   - 認証テスト（サインアップ→ログイン）
   - テーブル操作テスト（追加→取得→削除）

## プロジェクト構成

```
Fridge-Buddy/
├── src/
│   ├── components/
│   │   ├── FridgeMain.vue      # メインページ（タブ切り替え）
│   │   └── SupabaseTest.vue    # Supabaseテスト機能
│   ├── supabase.js             # Supabase接続設定
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
- Supabase環境変数が未設定の場合、コンソールにエラーメッセージが表示されます 