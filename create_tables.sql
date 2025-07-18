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
