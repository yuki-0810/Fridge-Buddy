# 🧊 Fridge Buddy

あなたの冷蔵庫を賢く管理する本格的なWebアプリケーション

*最終更新: 2025-01-18*

## 📱 概要

Fridge Buddyは、AI技術を活用した次世代の冷蔵庫管理アプリです。冷蔵庫を撮影するだけで食材を自動検出し、常備食材との照合によって買い物リストを自動生成します。

### 🚀 主要機能

- **🔐 認証システム** - Supabase Authによる安全なユーザー管理
- **📋 常備食材管理** - 普段使用する食材のマスターリスト登録・編集
- **📸 AIフリッジ分析** - 3つの角度から冷蔵庫を撮影してGPT-4oで自動分析
- **🛒 スマート買い物リスト** - 不足食材の自動検出と買い物リスト生成
- **📱 モバイル最適化** - スマートフォンでの使いやすさを重視したUI/UX

## 🚨 重要：開発フロー

**このプロジェクトではローカル開発環境は使用しません。**

- ✅ コード変更 → GitHub push → Vercel自動ビルド → ブラウザで確認
- ❌ ローカルでのnpm install / npm run dev は実行しない
- ❌ ローカルビルドやローカルサーバーは使用しない

すべての確認作業はVercelでビルドされたライブ環境で行います。

## 🗄️ データベース設定（Supabase）

### 1. 環境変数設定（Vercel）

Vercelの管理画面で以下の環境変数を設定してください：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_OPENAI_API_KEY=your-openai-api-key
```

### 2. 必要なテーブル作成

Supabase SQLエディタで以下のSQLを実行してください：

```sql
-- 常備食材テーブル
CREATE TABLE inventory_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 買い物リストテーブル
CREATE TABLE shopping_list (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  is_purchased BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLSポリシーの有効化
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;

-- 常備食材のRLSポリシー
CREATE POLICY "Users can view their own inventory items" ON inventory_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own inventory items" ON inventory_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own inventory items" ON inventory_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own inventory items" ON inventory_items
  FOR DELETE USING (auth.uid() = user_id);

-- 買い物リストのRLSポリシー
CREATE POLICY "Users can view their own shopping list" ON shopping_list
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own shopping list items" ON shopping_list
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shopping list items" ON shopping_list
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shopping list items" ON shopping_list
  FOR DELETE USING (auth.uid() = user_id);

-- インデックス作成
CREATE INDEX idx_inventory_items_user_id ON inventory_items(user_id);
CREATE INDEX idx_inventory_items_name ON inventory_items(name);
CREATE INDEX idx_shopping_list_user_id ON shopping_list(user_id);
CREATE INDEX idx_shopping_list_is_purchased ON shopping_list(is_purchased);
```

### 3. 認証設定

Supabase管理画面の Authentication → Settings で：
- Email confirmation を有効化（本番環境）
- 適切なEmail providerを設定

## 📱 使用方法

### 1. 🔐 初期設定
1. **新規登録** - メールアドレスとパスワードでアカウント作成
2. **メール認証** - 送信されたメールからアカウントを有効化
3. **ログイン** - 認証情報でログイン

### 2. 📋 常備食材の登録
1. **「常備食材」タブ**をタップ
2. **普段冷蔵庫に常備している食材を登録**：
   - 卵、牛乳、玉ねぎ、醤油、米など
   - カテゴリは問わず、よく使う食材すべて
3. **編集・削除**機能で後から調整可能

### 3. 📸 冷蔵庫の確認
1. **「冷蔵庫確認」タブ**をタップ
2. **3つの角度から撮影**（1つ以上でも可）：
   - 🥛 **冷蔵室正面** - メイン冷蔵庫内部
   - 🧂 **冷蔵室扉** - ドアポケット
   - 🥬 **野菜室** - 野菜室
3. **AI分析の確認**：
   - GPT-4oが自動で食材を検出
   - 検出結果の編集・手動追加が可能
   - 量（多い・普通・少ない）の調整
4. **買い物リスト生成**：
   - 常備食材と検出結果を自動照合
   - 不足分 + 量が「少ない」食材を抽出
   - 買い物リストに自動追加

### 4. 🛒 買い物リストの活用
1. **「買い物リスト」タブ**をタップ
2. **外出先での確認**：
   - 購入が必要な食材一覧
   - 進捗統計（残り・購入済み・完了率）
3. **チェックオフ機能**：
   - タップで購入完了をマーク
   - 購入済みアイテムの管理
4. **リスト管理**：
   - 手動での食材追加
   - 不要なアイテムの削除
   - 購入済みアイテムの一括削除

## 🛠️ 技術スタック

### フロントエンド
- **Vue.js 3** - Composition API使用
- **Vite** - 高速ビルドツール
- **CSS3** - レスポンシブデザイン

### バックエンド・インフラ
- **Supabase** - 認証・データベース・リアルタイム同期
- **OpenAI GPT-4o** - 画像解析・食材検出AI
- **Vercel** - ホスティング・自動デプロイ

### データベース
- **PostgreSQL** (Supabase) - ユーザーデータ・食材管理
- **Row Level Security** - セキュアなマルチテナント設計

## 🎯 AI食材検出の特徴

### 検出内容
- **食材名** - 具体的な食材の特定
- **残量レベル** - 多い・普通・少ない・なしの4段階
- **信頼度** - AI判定の確信度（%）
- **編集可能** - ユーザーによる結果の修正・追加

### 判定ロジック
- **不足食材** - 常備食材に登録済みだが検出されない
- **残量少ない食材** - 検出されたが量が「少ない」と判定
- **これらを自動で買い物リストに追加**

## 📁 プロジェクト構成

```
Fridge-Buddy/
├── src/
│   ├── components/
│   │   ├── LoginForm.vue         # 認証画面
│   │   ├── MainInventory.vue     # 常備食材管理
│   │   ├── FridgeAnalysis.vue    # 冷蔵庫分析・AI検出
│   │   └── ShoppingList.vue      # 買い物リスト管理
│   ├── supabase.js               # Supabase接続設定
│   ├── openai-client.js          # OpenAI API・画像解析
│   ├── App.vue                   # メインアプリ・ナビゲーション
│   ├── main.js
│   └── style.css
├── user-experience.md            # UX設計書
├── create_tables.sql             # データベーステーブル作成用SQL
├── public/
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 🚀 デプロイ

```bash
# GitHubにプッシュするだけで自動デプロイ
git add .
git commit -m "機能追加・修正内容"
git push origin main
```

→ Vercelが自動的にビルド・デプロイを実行

## 🔧 開発者向け情報

### 重要な制約
- **ローカル開発環境は使用しない** - すべてVercelライブ環境で確認
- **npm/yarn コマンド実行禁止** - 依存関係はpackage.jsonで管理
- **環境変数はVercelで設定** - ローカル.envファイルは使用しない

### デバッグ・トラブルシューティング
- **Supabase接続エラー** - 環境変数設定を確認
- **OpenAI API エラー** - API Keyとクレジット残高を確認
- **画像解析失敗** - ネットワーク状況とAPI制限を確認
- **データベースエラー** - RLSポリシーとテーブル構造を確認

### セキュリティ
- **Row Level Security** でユーザーデータを保護
- **環境変数** でAPIキーを安全に管理
- **認証状態** でページアクセスを制御

## 📊 パフォーマンス・制限

### OpenAI API制限
- **レート制限** - リクエスト/分の上限あり
- **画像サイズ制限** - 最大20MB、推奨数MB以下
- **応答時間** - 通常5-15秒、混雑時は更に時間がかかる場合あり

### 推奨利用環境
- **デバイス** - スマートフォン・タブレット最適化
- **ブラウザ** - Chrome、Safari、Firefox最新版
- **ネットワーク** - 安定したインターネット接続必須

## 🎉 今後の拡張予定

- 🔄 **リアルタイム同期** - 家族間での冷蔵庫状況共有
- 🍳 **レシピ提案** - 在庫食材を活用したレシピ生成
- 📅 **賞味期限管理** - 期限切れ近い食材の自動通知
- 🏪 **店舗連携** - 近くのスーパーの特売情報統合
- 📈 **使用量分析** - 食材消費パターンの学習と予測

---

*Fridge Buddy - Smart Fridge Management with AI* 