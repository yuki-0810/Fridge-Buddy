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
VITE_OPENAI_API_KEY=your-openai-api-key
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

### ✅ 実装済み機能
- ✅ Supabase接続テスト
- ✅ 認証機能（サインアップ・ログイン・ログアウト）
- ✅ テーブル操作（CRUD）
- ✅ **OpenAI Vision AI画像解析テスト**
  - GPT-4o 基本版（基本的な食材検出）
  - GPT-4o 詳細版（常備食材リスト対応・詳細分析）
  - GPT-4o 軽量版（高速・簡潔）
  - 精度・レスポンス時間の比較機能
- ✅ レスポンシブデザイン

### 🚧 予定機能
- 🚧 食材管理（画像解析統合）
- 🚧 賞味期限チェック  
- 🚧 レシピ提案
- 🚧 買い物リスト自動生成

## 技術スタック

- Vue.js 3
- Vite
- Supabase (認証・データベース)
- **OpenAI API (GPT-4o)**
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

### 1. Supabaseテスト
1. Vercelでデプロイ後、アプリにアクセス
2. 「Supabaseテスト」タブをクリック
3. 以下の順序でテスト：
   - 接続テスト
   - 認証テスト（サインアップ→ログイン）
   - テーブル操作テスト（追加→取得→削除）

### 2. Vision AIテスト
1. 「Vision AIテスト」タブをクリック
2. 冷蔵庫の写真をアップロード
3. 常備食材リストをカスタマイズ（詳細版用）
4. 以下のテスト実行：
   - **全モデル一括解析** - 3つのモデルで同時比較
   - **個別モデルテスト** - 基本版/詳細版/軽量版を個別実行
5. 結果比較：
   - 検出精度の比較
   - レスポンス時間の測定
   - JSON構造化結果の確認

## 🎯 Vision AI テスト詳細

### テスト可能なモデル

| モデル | 用途 | 特徴 |
|-------|------|------|
| **GPT-4o 基本版** | 基本的な食材検出 | バランス型・中程度の詳細度 |
| **GPT-4o 詳細版** | 常備食材リスト対応 | 高精度・詳細分析・カテゴリ分類 |
| **GPT-4o 軽量版** | 高速処理 | 軽量・高速・簡潔なリスト出力 |

### 分析結果の内容

- **検出食材リスト** - 食材名・残量レベル・信頼度
- **位置情報** - 冷蔵庫内の配置場所
- **カテゴリ分類** - 野菜/肉類/乳製品等
- **買い物提案** - 不足している食材の推奨
- **賞味期限注意** - 期限が心配な食材の識別

## プロジェクト構成

```
Fridge-Buddy/
├── src/
│   ├── components/
│   │   ├── FridgeMain.vue      # メインページ（タブ切り替え）
│   │   ├── SupabaseTest.vue    # Supabaseテスト機能
│   │   └── FridgeVisionTest.vue # OpenAI Vision テスト機能
│   ├── supabase.js             # Supabase接続設定
│   ├── openai-client.js        # OpenAI API接続・画像解析
│   ├── App.vue
│   ├── main.js
│   └── style.css
├── product-concept.md          # プロダクト企画書
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
- **OpenAI API Key が未設定の場合、Vision AI機能は動作しません**

## 🔬 今後の開発指針

Vision AIテストの結果を踏まえて：

1. **最適モデル選定** - 精度・速度・コストのバランス
2. **プロンプト最適化** - より高精度な検出のための指示改善
3. **エラーハンドリング** - 認識失敗時の対応策
4. **ユーザビリティ改善** - 撮影ガイダンス・結果表示の最適化 