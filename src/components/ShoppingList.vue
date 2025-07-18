<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase.js'

// 状態管理
const shoppingItems = ref([])
const newItemName = ref('')
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const showCompleted = ref(false)

// 初期データ読み込み
onMounted(async () => {
  await loadShoppingList()
})

// 買い物リスト読み込み
const loadShoppingList = async () => {
  loading.value = true
  errorMessage.value = ''
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('ユーザーが認証されていません')
    }

    const { data, error } = await supabase
      .from('shopping_list')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    shoppingItems.value = data || []
  } catch (error) {
    console.error('買い物リスト読み込みエラー:', error)
    errorMessage.value = '買い物リストの読み込みに失敗しました'
  } finally {
    loading.value = false
  }
}

// 統計
const stats = computed(() => {
  const totalItems = shoppingItems.value.length
  const purchasedItems = shoppingItems.value.filter(item => item.is_purchased).length
  const remainingItems = totalItems - purchasedItems
  const completionRate = totalItems > 0 ? Math.round((purchasedItems / totalItems) * 100) : 0

  return {
    totalItems,
    purchasedItems,
    remainingItems,
    completionRate
  }
})

// フィルタリングされたアイテム
const filteredItems = computed(() => {
  if (showCompleted.value) {
    return shoppingItems.value
  } else {
    return shoppingItems.value.filter(item => !item.is_purchased)
  }
})

// 新しいアイテムを追加
const addShoppingItem = async () => {
  if (!newItemName.value.trim()) {
    errorMessage.value = '食材名を入力してください'
    return
  }

  // 重複チェック（未購入のもののみ）
  const exists = shoppingItems.value.some(
    item => !item.is_purchased && 
            item.item_name.toLowerCase() === newItemName.value.trim().toLowerCase()
  )
  
  if (exists) {
    errorMessage.value = 'この食材は既にリストにあります'
    return
  }

  saving.value = true
  errorMessage.value = ''

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('ユーザーが認証されていません')
    }

    const { data, error } = await supabase
      .from('shopping_list')
      .insert([
        {
          user_id: user.id,
          item_name: newItemName.value.trim(),
          is_purchased: false
        }
      ])
      .select()

    if (error) {
      throw error
    }

    // 新しいアイテムをリストの先頭に追加
    shoppingItems.value.unshift(data[0])
    newItemName.value = ''
    
  } catch (error) {
    console.error('食材追加エラー:', error)
    errorMessage.value = '食材の追加に失敗しました'
  } finally {
    saving.value = false
  }
}

// 購入状況をトグル
const togglePurchased = async (item) => {
  const newStatus = !item.is_purchased

  try {
    const { error } = await supabase
      .from('shopping_list')
      .update({ is_purchased: newStatus })
      .eq('id', item.id)

    if (error) {
      throw error
    }

    // ローカル状態を更新
    item.is_purchased = newStatus
    
  } catch (error) {
    console.error('購入状況更新エラー:', error)
    errorMessage.value = '購入状況の更新に失敗しました'
  }
}

// アイテムを削除
const deleteItem = async (item) => {
  if (!confirm(`「${item.item_name}」をリストから削除しますか？`)) {
    return
  }

  try {
    const { error } = await supabase
      .from('shopping_list')
      .delete()
      .eq('id', item.id)

    if (error) {
      throw error
    }

    // ローカル状態から削除
    shoppingItems.value = shoppingItems.value.filter(i => i.id !== item.id)
    
  } catch (error) {
    console.error('アイテム削除エラー:', error)
    errorMessage.value = 'アイテムの削除に失敗しました'
  }
}

// 購入済みアイテムをすべて削除
const clearPurchased = async () => {
  const purchasedItems = shoppingItems.value.filter(item => item.is_purchased)
  
  if (purchasedItems.length === 0) {
    errorMessage.value = '削除する購入済みアイテムがありません'
    return
  }

  if (!confirm(`${purchasedItems.length}個の購入済みアイテムをすべて削除しますか？`)) {
    return
  }

  try {
    const { error } = await supabase
      .from('shopping_list')
      .delete()
      .eq('user_id', (await supabase.auth.getUser()).data.user.id)
      .eq('is_purchased', true)

    if (error) {
      throw error
    }

    // ローカル状態を更新
    shoppingItems.value = shoppingItems.value.filter(item => !item.is_purchased)
    
  } catch (error) {
    console.error('購入済みアイテム削除エラー:', error)
    errorMessage.value = '購入済みアイテムの削除に失敗しました'
  }
}

// Enterキーで追加
const handleKeyPress = (event) => {
  if (event.key === 'Enter') {
    addShoppingItem()
  }
}

// リストを更新（プルダウンリフレッシュなど）
const refreshList = () => {
  loadShoppingList()
}
</script>

<template>
  <div class="shopping-container">
    <!-- ヘッダー -->
    <div class="page-header">
      <h2 class="page-title">🛒 買い物リスト</h2>
      <p class="page-description">
        外出先でもチェックしやすいよう、シンプルなリストにしました。
      </p>
    </div>

    <!-- 統計パネル -->
    <div class="stats-panel">
      <div class="stat-item">
        <span class="stat-number">{{ stats.remainingItems }}</span>
        <span class="stat-label">残り</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">{{ stats.purchasedItems }}</span>
        <span class="stat-label">購入済み</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">{{ stats.completionRate }}%</span>
        <span class="stat-label">完了率</span>
      </div>
    </div>

    <!-- 新規追加フォーム -->
    <div class="add-form">
      <div class="input-row">
        <input
          v-model="newItemName"
          type="text"
          placeholder="食材を追加（例：牛乳、卵、パン）"
          class="item-input"
          :disabled="saving"
          @keypress="handleKeyPress"
        />
        <button
          @click="addShoppingItem"
          :disabled="saving || !newItemName.trim()"
          class="add-btn"
        >
          <span v-if="saving">保存中...</span>
          <span v-else>➕</span>
        </button>
      </div>
    </div>

    <!-- エラーメッセージ -->
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <!-- フィルターとアクション -->
    <div class="list-controls">
      <div class="filter-toggle">
        <label class="toggle-switch">
          <input type="checkbox" v-model="showCompleted" />
          <span class="slider"></span>
          <span class="toggle-label">購入済みも表示</span>
        </label>
      </div>
      
      <div class="list-actions">
        <button @click="refreshList" class="action-btn refresh-btn">🔄</button>
        <button 
          @click="clearPurchased" 
          :disabled="stats.purchasedItems === 0"
          class="action-btn clear-btn"
        >
          🗑️ 購入済みを削除
        </button>
      </div>
    </div>

    <!-- ローディング -->
    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <p>買い物リストを読み込み中...</p>
    </div>

    <!-- 買い物リスト -->
    <div v-else class="shopping-list">
      <div v-if="filteredItems.length === 0" class="empty-state">
        <div class="empty-icon">{{ showCompleted ? '🎉' : '📝' }}</div>
        <h3>{{ showCompleted ? 'リストが空です' : '買い物する物がありません' }}</h3>
        <p v-if="!showCompleted && stats.purchasedItems > 0">
          すべての買い物が完了しました！<br>
          購入済みアイテムを表示するには上のスイッチをオンにしてください。
        </p>
        <p v-else>
          上のフォームから食材を追加するか、冷蔵庫確認機能を使って自動で追加してください。
        </p>
      </div>

      <div v-else class="items-list">
        <div 
          v-for="item in filteredItems" 
          :key="item.id"
          class="shopping-item"
          :class="{ 'purchased': item.is_purchased }"
        >
          <div class="item-content" @click="togglePurchased(item)">
            <label class="item-checkbox">
              <input 
                type="checkbox" 
                :checked="item.is_purchased"
                @change="togglePurchased(item)"
                @click.stop
              />
              <span class="checkmark"></span>
            </label>
            
            <span class="item-name">{{ item.item_name }}</span>
            
            <span v-if="item.is_purchased" class="purchased-badge">✓</span>
          </div>
          
          <button 
            @click="deleteItem(item)" 
            class="delete-btn"
            :class="{ 'purchased': item.is_purchased }"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>

    <!-- 買い物完了メッセージ -->
    <div v-if="stats.totalItems > 0 && stats.remainingItems === 0" class="completion-message">
      <div class="completion-content">
        <span class="completion-icon">🎉</span>
        <div class="completion-text">
          <h3>お疲れさまでした！</h3>
          <p>すべての買い物が完了しました</p>
        </div>
      </div>
    </div>

    <!-- ヘルプセクション -->
    <div class="help-section">
      <h3>💡 使い方のコツ</h3>
      <ul>
        <li>タップで購入完了をマークできます</li>
        <li>完了率で買い物の進捗がわかります</li>
        <li>不要なアイテムは右の🗑️で削除できます</li>
        <li>冷蔵庫確認機能で自動的にアイテムが追加されます</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.shopping-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
  min-height: calc(100vh - 160px);
}

.page-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.page-title {
  margin: 0;
  color: #1f2937;
  font-size: 1.75rem;
  font-weight: bold;
}

.page-description {
  margin-top: 0.5rem;
  color: #6b7280;
  font-size: 0.875rem;
  line-height: 1.5;
}

/* 統計パネル */
.stats-panel {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-item {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 1rem;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-number {
  display: block;
  font-size: 1.5rem;
  font-weight: bold;
  color: #3b82f6;
  line-height: 1;
}

.stat-label {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
  font-weight: 500;
}

/* 新規追加フォーム */
.add-form {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 1rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.input-row {
  display: flex;
  gap: 0.75rem;
}

.item-input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.item-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.add-btn {
  padding: 0.75rem 1rem;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1.25rem;
  cursor: pointer;
  transition: background-color 0.2s;
  min-width: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-btn:hover:not(:disabled) {
  background: #059669;
}

.add-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

/* エラーメッセージ */
.error-message {
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

/* リストコントロール */
.list-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.filter-toggle {
  display: flex;
  align-items: center;
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.toggle-switch input[type="checkbox"] {
  display: none;
}

.slider {
  width: 3rem;
  height: 1.5rem;
  background: #e5e7eb;
  border-radius: 1rem;
  position: relative;
  transition: background-color 0.2s;
}

.slider::before {
  content: '';
  position: absolute;
  width: 1.25rem;
  height: 1.25rem;
  background: white;
  border-radius: 50%;
  top: 0.125rem;
  left: 0.125rem;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.toggle-switch input:checked + .slider {
  background: #3b82f6;
}

.toggle-switch input:checked + .slider::before {
  transform: translateX(1.5rem);
}

.toggle-label {
  font-size: 0.875rem;
  color: #374151;
  font-weight: 500;
}

.list-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  padding: 0.5rem;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.refresh-btn {
  background: #e5e7eb;
  color: #374151;
}

.refresh-btn:hover {
  background: #d1d5db;
}

.clear-btn {
  background: #fee2e2;
  color: #dc2626;
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
}

.clear-btn:hover:not(:disabled) {
  background: #fecaca;
}

.clear-btn:disabled {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

/* ローディング */
.loading {
  text-align: center;
  padding: 3rem 1rem;
  color: #6b7280;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top: 3px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 買い物リスト */
.shopping-list {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #6b7280;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem 0;
  color: #374151;
}

.empty-state p {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
}

.items-list {
  display: flex;
  flex-direction: column;
}

.shopping-item {
  display: flex;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #f3f4f6;
  transition: all 0.2s;
  background: white;
}

.shopping-item:hover {
  background: #f9fafb;
}

.shopping-item:last-child {
  border-bottom: none;
}

.shopping-item.purchased {
  background: #f0fdf4;
  opacity: 0.7;
}

.item-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  padding-right: 1rem;
}

.item-checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.item-checkbox input[type="checkbox"] {
  display: none;
}

.checkmark {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid #d1d5db;
  border-radius: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  background: white;
}

.item-checkbox input:checked + .checkmark {
  background: #10b981;
  border-color: #10b981;
}

.item-checkbox input:checked + .checkmark::before {
  content: '✓';
  color: white;
  font-size: 0.875rem;
  font-weight: bold;
}

.item-name {
  flex: 1;
  font-size: 0.875rem;
  color: #374151;
  font-weight: 500;
  transition: all 0.2s;
}

.shopping-item.purchased .item-name {
  text-decoration: line-through;
  color: #6b7280;
}

.purchased-badge {
  color: #10b981;
  font-size: 1rem;
  font-weight: bold;
}

.delete-btn {
  padding: 0.5rem;
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: background-color 0.2s;
  font-size: 1rem;
}

.delete-btn:hover {
  background: #fee2e2;
}

.delete-btn.purchased {
  color: #9ca3af;
}

.delete-btn.purchased:hover {
  background: #f3f4f6;
}

/* 完了メッセージ */
.completion-message {
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.completion-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.completion-icon {
  font-size: 3rem;
}

.completion-text h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: bold;
}

.completion-text p {
  margin: 0.25rem 0 0 0;
  opacity: 0.9;
  font-size: 0.875rem;
}

/* ヘルプセクション */
.help-section {
  background: #f0f9ff;
  border: 1px solid #e0f2fe;
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-top: 2rem;
}

.help-section h3 {
  margin: 0 0 0.75rem 0;
  color: #0c4a6e;
  font-size: 1rem;
}

.help-section ul {
  margin: 0;
  padding-left: 1.5rem;
  color: #0c4a6e;
}

.help-section li {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  line-height: 1.4;
}

/* レスポンシブ */
@media (max-width: 768px) {
  .shopping-container {
    padding: 0.5rem;
  }
  
  .input-row {
    gap: 0.5rem;
  }
  
  .list-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  
  .list-actions {
    justify-content: center;
  }
  
  .completion-content {
    flex-direction: column;
    text-align: center;
  }
  
  .completion-icon {
    font-size: 2.5rem;
  }
}

/* タッチデバイス最適化 */
@media (hover: none) and (pointer: coarse) {
  .shopping-item {
    min-height: 3.5rem;
  }
  
  .item-content {
    padding-right: 0.5rem;
  }
  
  .checkmark {
    width: 1.5rem;
    height: 1.5rem;
  }
  
  .delete-btn {
    padding: 0.75rem;
    font-size: 1.125rem;
  }
}
</style> 