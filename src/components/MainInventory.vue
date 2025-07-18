<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase.js'

// 状態管理
const inventoryItems = ref([])
const newItemName = ref('')
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const editingItem = ref(null)

// 初期データ読み込み
onMounted(async () => {
  await loadInventoryItems()
})

// 常備食材一覧を読み込み
const loadInventoryItems = async () => {
  loading.value = true
  errorMessage.value = ''
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('ユーザーが認証されていません')
    }

    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', user.id)
      .order('name')

    if (error) {
      throw error
    }

    inventoryItems.value = data || []
  } catch (error) {
    console.error('常備食材読み込みエラー:', error)
    errorMessage.value = '常備食材の読み込みに失敗しました'
  } finally {
    loading.value = false
  }
}

// 新しい食材を追加
const addInventoryItem = async () => {
  if (!newItemName.value.trim()) {
    errorMessage.value = '食材名を入力してください'
    return
  }

  // 重複チェック
  const exists = inventoryItems.value.some(
    item => item.name.toLowerCase() === newItemName.value.trim().toLowerCase()
  )
  
  if (exists) {
    errorMessage.value = 'この食材は既に登録されています'
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
      .from('inventory_items')
      .insert([
        {
          user_id: user.id,
          name: newItemName.value.trim()
        }
      ])
      .select()

    if (error) {
      throw error
    }

    // 新しいアイテムを一覧に追加
    inventoryItems.value.push(data[0])
    newItemName.value = ''
    
    // アルファベット順にソート
    inventoryItems.value.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('食材追加エラー:', error)
    errorMessage.value = '食材の追加に失敗しました'
  } finally {
    saving.value = false
  }
}

// 食材を削除
const deleteInventoryItem = async (item) => {
  if (!confirm(`「${item.name}」を削除しますか？`)) {
    return
  }

  try {
    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', item.id)

    if (error) {
      throw error
    }

    // 一覧から削除
    inventoryItems.value = inventoryItems.value.filter(i => i.id !== item.id)
  } catch (error) {
    console.error('食材削除エラー:', error)
    errorMessage.value = '食材の削除に失敗しました'
  }
}

// 食材編集開始
const startEditing = (item) => {
  editingItem.value = {
    id: item.id,
    name: item.name,
    originalName: item.name
  }
}

// 食材編集保存
const saveEdit = async () => {
  if (!editingItem.value || !editingItem.value.name.trim()) {
    cancelEdit()
    return
  }

  // 重複チェック（自分以外）
  const exists = inventoryItems.value.some(
    item => item.id !== editingItem.value.id && 
            item.name.toLowerCase() === editingItem.value.name.trim().toLowerCase()
  )
  
  if (exists) {
    errorMessage.value = 'この食材名は既に使用されています'
    return
  }

  try {
    const { error } = await supabase
      .from('inventory_items')
      .update({ name: editingItem.value.name.trim() })
      .eq('id', editingItem.value.id)

    if (error) {
      throw error
    }

    // 一覧を更新
    const itemIndex = inventoryItems.value.findIndex(i => i.id === editingItem.value.id)
    if (itemIndex !== -1) {
      inventoryItems.value[itemIndex].name = editingItem.value.name.trim()
      // アルファベット順にソート
      inventoryItems.value.sort((a, b) => a.name.localeCompare(b.name))
    }

    editingItem.value = null
    errorMessage.value = ''
  } catch (error) {
    console.error('食材編集エラー:', error)
    errorMessage.value = '食材の編集に失敗しました'
  }
}

// 食材編集キャンセル
const cancelEdit = () => {
  editingItem.value = null
  errorMessage.value = ''
}

// Enterキーで追加
const handleKeyPress = (event) => {
  if (event.key === 'Enter') {
    addInventoryItem()
  }
}

// Enterキーで編集保存、Escapeでキャンセル
const handleEditKeyPress = (event) => {
  if (event.key === 'Enter') {
    saveEdit()
  } else if (event.key === 'Escape') {
    cancelEdit()
  }
}
</script>

<template>
  <div class="inventory-container">
    <!-- ヘッダー -->
    <div class="page-header">
      <h2 class="page-title">📋 常備食材の管理</h2>
      <p class="page-description">
        普段冷蔵庫に常備している食材を登録してください。<br>
        冷蔵庫チェック時に不足分が自動で買い物リストに追加されます。
      </p>
    </div>

    <!-- 新規追加フォーム -->
    <div class="add-form">
      <div class="form-group">
        <div class="input-row">
          <input
            v-model="newItemName"
            type="text"
            placeholder="食材名を入力（例：卵、牛乳、玉ねぎ）"
            class="item-input"
            :disabled="saving"
            @keypress="handleKeyPress"
          />
          <button
            @click="addInventoryItem"
            :disabled="saving || !newItemName.trim()"
            class="add-btn"
          >
            <span v-if="saving">保存中...</span>
            <span v-else>➕ 追加</span>
          </button>
        </div>
      </div>
    </div>

    <!-- エラーメッセージ -->
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <!-- ローディング -->
    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <p>常備食材を読み込み中...</p>
    </div>

    <!-- 常備食材一覧 -->
    <div v-else class="inventory-list">
      <div v-if="inventoryItems.length === 0" class="empty-state">
        <div class="empty-icon">🛒</div>
        <h3>常備食材がまだ登録されていません</h3>
        <p>上のフォームから常備食材を追加してください。<br>例：卵、牛乳、玉ねぎ、醤油、米など</p>
      </div>

      <div v-else class="items-grid">
        <div class="list-header">
          <h3>登録済み常備食材（{{ inventoryItems.length }}件）</h3>
        </div>
        
        <div 
          v-for="item in inventoryItems" 
          :key="item.id"
          class="item-card"
        >
          <!-- 編集モード -->
          <div v-if="editingItem && editingItem.id === item.id" class="edit-mode">
            <input
              v-model="editingItem.name"
              type="text"
              class="edit-input"
              @keypress="handleEditKeyPress"
              ref="editInput"
            />
            <div class="edit-actions">
              <button @click="saveEdit" class="save-btn">✅</button>
              <button @click="cancelEdit" class="cancel-btn">❌</button>
            </div>
          </div>

          <!-- 表示モード -->
          <div v-else class="display-mode">
            <span class="item-name">{{ item.name }}</span>
            <div class="item-actions">
              <button @click="startEditing(item)" class="edit-btn">✏️</button>
              <button @click="deleteInventoryItem(item)" class="delete-btn">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ヘルプ -->
    <div class="help-section">
      <h3>💡 使い方のヒント</h3>
      <ul>
        <li>よく使う調味料（醤油、塩、砂糖など）も登録しておくと便利です</li>
        <li>冷凍食品や常温保存品も含めて登録できます</li>
        <li>食材名は後から編集できます</li>
        <li>不要になった食材は削除できます</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.inventory-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.page-header {
  text-align: center;
  margin-bottom: 2rem;
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

.add-form {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 1.5rem;
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
  padding: 0.75rem 1.5rem;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.add-btn:hover:not(:disabled) {
  background: #059669;
}

.add-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.error-message {
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

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

.inventory-list {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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

.list-header {
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}

.list-header h3 {
  margin: 0;
  color: #374151;
  font-size: 1rem;
}

.items-grid {
  display: flex;
  flex-direction: column;
}

.item-card {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #f3f4f6;
  transition: background-color 0.2s;
}

.item-card:hover {
  background: #f9fafb;
}

.item-card:last-child {
  border-bottom: none;
}

.display-mode {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-name {
  font-weight: 500;
  color: #374151;
  font-size: 0.875rem;
}

.item-actions {
  display: flex;
  gap: 0.5rem;
}

.edit-btn, .delete-btn, .save-btn, .cancel-btn {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.edit-btn {
  background: #e5e7eb;
  color: #374151;
}

.edit-btn:hover {
  background: #d1d5db;
}

.delete-btn {
  background: #fee2e2;
  color: #dc2626;
}

.delete-btn:hover {
  background: #fecaca;
}

.save-btn {
  background: #d1fae5;
  color: #065f46;
}

.save-btn:hover {
  background: #a7f3d0;
}

.cancel-btn {
  background: #fee2e2;
  color: #dc2626;
}

.cancel-btn:hover {
  background: #fecaca;
}

.edit-mode {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.edit-input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.edit-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
}

.help-section {
  margin-top: 2rem;
  padding: 1.5rem;
  background: #f0f9ff;
  border: 1px solid #e0f2fe;
  border-radius: 0.75rem;
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
  .inventory-container {
    padding: 0.5rem;
  }
  
  .input-row {
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .add-btn {
    width: 100%;
  }
  
  .display-mode {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
  
  .item-actions {
    align-self: stretch;
    justify-content: flex-end;
  }
  
  .edit-mode {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
}
</style> 