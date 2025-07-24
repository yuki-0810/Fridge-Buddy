# 🧊 Fridge Buddy v2.0

あなたの冷蔵庫を賢く管理する本格的なWebアプリケーション - **メジャーアップデート完了！**

*最終更新: 2025-01-18 - v2.0リリース*

## 🚀 v2.0の主要新機能

### 🤖 Gemini YOLO物体検出
- **YOLOベース画像認識**：従来のGPT-4oからGemini 1.5 Pro + YOLOアルゴリズムに完全移行
- **精度向上**：物体検出の精度が大幅に向上し、より正確な食材認識を実現
- **視覚的根拠**：検出結果に視覚的根拠と信頼度を明示

### 🎯 AI特徴プロンプト機能
- **自動プロンプト生成**：各常備食材の特徴をAIが自動生成
- **カスタムプロンプト**：ユーザーが独自の特徴を手動で追加可能
- **認識精度向上**：特徴プロンプトにより画像認識の精度が大幅に向上

### 📊 統合解析システム
- **複数画像統合**：3つの角度からの画像を統合的に解析
- **包括的在庫管理**：全体的な食材の量と場所を統合して判定
- **優先購入リスト**：AIが分析結果から優先的に購入すべき食材を提案

## 📱 概要

Fridge Buddyは、AI技術を活用した次世代の冷蔵庫管理アプリです。冷蔵庫を撮影するだけで食材を自動検出し、常備食材との照合によって買い物リストを自動生成します。

### 🚀 主要機能

- **🔐 認証システム** - Supabase Authによる安全なユーザー管理
- **📋 常備食材管理 v2.0** - AI特徴プロンプト機能付きマスターリスト管理
- **📸 Gemini YOLO分析** - 3つの角度から冷蔵庫を撮影してAIが高精度自動分析
- **🤖 特徴プロンプト** - 各食材の特徴をAI&ユーザーで定義し認識精度を向上
- **📊 統合解析** - 複数画像を統合して包括的な在庫状況を分析
- **🛒 スマート買い物リスト** - 不足食材の自動検出と優先度付き買い物リスト生成
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
VITE_GEMINI_API_KEY=your-gemini-api-key
```

**🆕 v2.0で追加：**
- `VITE_GEMINI_API_KEY` - Google Gemini APIキーが必要です

### 2. 必要なテーブル作成（v2.0対応）

Supabase SQLエディタで以下のSQLを実行してください：

```sql
-- 常備食材テーブル（v2.0拡張版）
CREATE TABLE inventory_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description_prompt TEXT, -- AI認識用の特徴プロンプト
  ai_generated_prompt TEXT, -- AIが生成したプロンプト
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

-- 分析セッションテーブル（v2.0新規）
CREATE TABLE analysis_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL,
  analysis_results JSONB, -- 分析結果のJSON
  images_analyzed INTEGER DEFAULT 0,
  ai_engine TEXT DEFAULT 'gemini', -- 使用したAIエンジン
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLSポリシーの有効化
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_sessions ENABLE ROW LEVEL SECURITY;

-- 既存テーブルへのカラム追加（マイグレーション用）
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS description_prompt TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS ai_generated_prompt TEXT;

-- [他のポリシーとインデックスは省略]
```

## 📱 使用方法（v2.0対応）

### 1. 🔐 初期設定
1. **新規登録** - メールアドレスとパスワードでアカウント作成
2. **メール認証** - 送信されたメールからアカウントを有効化
3. **ログイン** - 認証情報でログイン

### 2. 📋 常備食材の登録（v2.0新機能）
1. **「常備食材」タブ**をタップ
2. **普段冷蔵庫に常備している食材を登録**：
   - 卵、牛乳、玉ねぎ、醤油、米など
3. **🤖 AI特徴プロンプト生成**：
   - 各食材の🤖ボタンをタップしてAIが特徴を自動生成
   - 外観、保存場所、パッケージの特徴などを自動で作成
4. **✏️ カスタムプロンプト**：
   - 編集ボタンで独自の特徴を手動追加可能
   - より個人的な特徴を記録して認識精度向上

### 3. 📸 冷蔵庫の確認（v2.0大幅強化）
1. **「冷蔵庫確認」タブ**をタップ
2. **3つの角度から撮影**：
   - 🥛 **冷蔵室正面** - メイン冷蔵庫内部
   - 🧂 **冷蔵室扉** - ドアポケット
   - 🥬 **野菜室** - 野菜室
3. **Gemini YOLO分析**：
   - YOLOベース物体検出で高精度食材認識
   - 特徴プロンプトを活用した認識精度向上
   - 視覚的根拠と信頼度の明示
4. **統合解析結果**：
   - 複数画像の統合的な在庫分析
   - 包括的な食材リストと推奨購入アイテム
   - 優先度付き買い物リスト生成

### 4. 🛒 買い物リストの活用（v2.0強化）
1. **「買い物リスト」タブ**をタップ
2. **優先購入リスト**：
   - AIが分析した優先的に購入すべき食材
   - 統合解析結果に基づく推奨
3. **外出先での確認**：
   - 購入が必要な食材一覧
   - 進捗統計（残り・購入済み・完了率）
4. **スマート管理**：
   - タップで購入完了をマーク
   - 手動での食材追加・削除

## 🛠️ 技術スタック（v2.0更新）

### フロントエンド
- **Vue.js 3** - Composition API使用
- **Vite** - 高速ビルドツール
- **CSS3** - レスポンシブデザイン

### AI・画像認識
- **Google Gemini 1.5 Pro** - 高精度画像解析エンジン（v2.0で新採用）
- **YOLO物体検出** - 正確な食材識別アルゴリズム
- **特徴プロンプト** - AIとユーザーによる認識精度向上システム

### バックエンド・インフラ
- **Supabase** - 認証・データベース・リアルタイム同期
- **Vercel** - ホスティング・自動デプロイ

### データベース
- **PostgreSQL** (Supabase) - ユーザーデータ・食材管理
- **Row Level Security** - セキュアなマルチテナント設計

## 🎯 AI食材検出の特徴（v2.0大幅強化）

### Gemini YOLO検出システム
- **YOLOベース物体検出** - 業界標準の高精度アルゴリズム
- **特徴プロンプト活用** - 各食材の特徴を事前学習で精度向上
- **視覚的根拠** - 検出理由と根拠を明示
- **統合解析** - 複数画像からの包括的な判定

### 検出内容
- **食材名** - 具体的な食材の特定
- **カテゴリ** - 野菜/肉類/乳製品/調味料等の分類
- **残量レベル** - なし・僅少・少ない・普通・多いの5段階
- **信頼度** - AI判定の確信度（%）
- **位置情報** - 冷蔵庫内での検出位置
- **特徴マッチング** - 使用された特徴プロンプト

### 判定ロジック（v2.0強化）
- **不足食材** - 常備食材に登録済みだが検出されない
- **残量少ない食材** - 検出されたが量が「少ない」「僅少」と判定
- **優先購入推奨** - 統合解析による優先度付きリスト生成

## 📁 プロジェクト構成（v2.0更新）

```
Fridge-Buddy/
├── src/
│   ├── components/
│   │   ├── LoginForm.vue         # 認証画面
│   │   ├── MainInventory.vue     # 常備食材管理（v2.0プロンプト機能追加）
│   │   ├── FridgeAnalysis.vue    # 冷蔵庫分析・AI検出（v2.0 Gemini YOLO対応）
│   │   └── ShoppingList.vue      # 買い物リスト管理
│   ├── supabase.js               # Supabase接続設定
│   ├── gemini-client.js          # Google Gemini APIクライアント（v2.0新規）
│   ├── openai-client.js          # OpenAI APIクライアント（v1.x互換）
│   ├── App.vue                   # メインアプリ・ナビゲーション
│   ├── main.js
│   └── style.css
├── user-experience.md            # UX設計書
├── create_tables.sql             # データベーステーブル作成用SQL（v2.0拡張）
├── public/
├── index.html
├── package.json                  # v2.0で@google/generative-ai追加
├── vite.config.js
└── README.md
```

## 🚀 デプロイ

```bash
# GitHubにプッシュするだけで自動デプロイ
git add .
git commit -m "v2.0: Gemini YOLO検出＋特徴プロンプト機能実装"
git push origin main
```

→ Vercelが自動的にビルド・デプロイを実行

## 🔧 開発者向け情報（v2.0更新）

### 重要な制約
- **ローカル開発環境は使用しない** - すべてVercelライブ環境で確認
- **npm/yarn コマンド実行禁止** - 依存関係はpackage.jsonで管理
- **環境変数はVercelで設定** - ローカル.envファイルは使用しない

### v2.0での技術的変更
- **Gemini 1.5 Pro API** - 画像解析メインエンジンに採用
- **YOLO物体検出** - 高精度食材識別アルゴリズム
- **特徴プロンプトシステム** - AIとユーザーによる認識精度向上
- **統合解析機能** - 複数画像からの包括的判定

### デバッグ・トラブルシューティング
- **Supabase接続エラー** - 環境変数設定を確認
- **Gemini API エラー** - API Keyとクレジット残高を確認
- **画像解析失敗** - ネットワーク状況とAPI制限を確認
- **データベースエラー** - RLSポリシーとテーブル構造を確認

## 📊 パフォーマンス・制限（v2.0更新）

### Gemini API制限
- **レート制限** - リクエスト/分の上限あり
- **画像サイズ制限** - 最大20MB、推奨数MB以下
- **応答時間** - 通常3-8秒、混雑時は更に時間がかかる場合あり

### 推奨利用環境
- **デバイス** - スマートフォン・タブレット最適化
- **ブラウザ** - Chrome、Safari、Firefox最新版
- **ネットワーク** - 安定したインターネット接続必須

## 🎉 今後の拡張予定（v2.x系）

### Phase 2.1: 機械学習強化
- **Fine-Tuning** - ユーザーフィードバックによる個人最適化
- **学習機能** - 食材認識パターンの継続的改善
- **カスタムモデル** - 個人の冷蔵庫に特化した検出モデル

### Phase 2.2: 高度分析
- **賞味期限AI** - 食材の状態から賞味期限を予測
- **栄養バランス** - 在庫食材の栄養価分析
- **食品ロス予防** - 消費期限アラートシステム

### Phase 2.3: 連携機能
- **EC連携** - ネットスーパーAPI統合
- **レシピ提案** - 在庫食材を活用したレシピ生成
- **家族共有** - 複数ユーザーでの冷蔵庫状況共有

---

*Fridge Buddy v2.0 - AI-Powered Smart Fridge Management* 

**🚀 v2.0リリース記念** - Gemini YOLO検出＋特徴プロンプトで画像認識精度が大幅向上！ 