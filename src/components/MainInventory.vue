<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase.js'
import { generateIngredientPrompt } from '../gemini-client.js'

// 状態管理
const inventoryItems = ref([])
const newItemName = ref('')
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const editingItem = ref(null)
const generatingPrompt = ref({})

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

// AIプロンプト自動生成
const generateAIPrompt = async (item) => {
  if (generatingPrompt.value[item.id]) return
  
  generatingPrompt.value[item.id] = true
  
  try {
    const result = await generateIngredientPrompt(item.name)
    
    if (result.success) {
      const promptData = result.result
      
      // データベースを更新
      const { error } = await supabase
        .from('inventory_items')
        .update({
          ai_generated_prompt: JSON.stringify(promptData),
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id)

      if (error) {
        throw error
      }

      // 一覧を更新
      const itemIndex = inventoryItems.value.findIndex(i => i.id === item.id)
      if (itemIndex !== -1) {
        inventoryItems.value[itemIndex].ai_generated_prompt = JSON.stringify(promptData)
      }
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('プロンプト生成エラー:', error)
    errorMessage.value = `${item.name}のプロンプト生成に失敗しました`
  } finally {
    generatingPrompt.value[item.id] = false
  }
}

// ユーザープロンプト保存
const saveUserPrompt = async (item, prompt) => {
  try {
    const { error } = await supabase
      .from('inventory_items')
      .update({
        description_prompt: prompt,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id)

    if (error) {
      throw error
    }

    // 一覧を更新
    const itemIndex = inventoryItems.value.findIndex(i => i.id === item.id)
    if (itemIndex !== -1) {
      inventoryItems.value[itemIndex].description_prompt = prompt
    }
  } catch (error) {
    console.error('プロンプト保存エラー:', error)
    errorMessage.value = 'プロンプトの保存に失敗しました'
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
    originalName: item.name,
    description_prompt: item.description_prompt || '',
    originalPrompt: item.description_prompt || ''
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
      .update({ 
        name: editingItem.value.name.trim(),
        description_prompt: editingItem.value.description_prompt,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingItem.value.id)

    if (error) {
      throw error
    }

    // 一覧を更新
    const itemIndex = inventoryItems.value.findIndex(i => i.id === editingItem.value.id)
    if (itemIndex !== -1) {
      inventoryItems.value[itemIndex].name = editingItem.value.name.trim()
      inventoryItems.value[itemIndex].description_prompt = editingItem.value.description_prompt
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

// プロンプトの表示形式を整える
const formatPrompt = (item) => {
  try {
    if (item.ai_generated_prompt) {
      const promptData = JSON.parse(item.ai_generated_prompt)
      return promptData.prompt || 'プロンプトが生成されました'
    }
  } catch (e) {
    console.error('プロンプトパースエラー:', e)
  }
  return null
}

// キーワードの表示形式を整える
const formatKeywords = (item) => {
  try {
    if (item.ai_generated_prompt) {
      const promptData = JSON.parse(item.ai_generated_prompt)
      return promptData.keywords || []
    }
  } catch (e) {
    console.error('キーワードパースエラー:', e)
  }
  return []
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
      <h2 class="page-title">📋 常備食材の管理 v2.0</h2>
      <p class="page-description">
        普段冷蔵庫に常備している食材を登録してください。<br>
        <strong>🆕 AI特徴プロンプト</strong>で画像認識精度が向上しました！
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
            <span v-else">➕ 追加</span>
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
          class="item-card enhanced"
        >
          <!-- 編集モード -->
          <div v-if="editingItem && editingItem.id === item.id" class="edit-mode">
            <div class="edit-fields">
              <input
                v-model="editingItem.name"
                type="text"
                class="edit-input"
                placeholder="食材名"
                @keypress="handleEditKeyPress"
              />
              <textarea
                v-model="editingItem.description_prompt"
                class="edit-prompt"
                placeholder="特徴プロンプト（画像認識の精度向上のため）"
                rows="2"
              ></textarea>
            </div>
            <div class="edit-actions">
              <button @click="saveEdit" class="save-btn">✅ 保存</button>
              <button @click="cancelEdit" class="cancel-btn">❌ キャンセル</button>
            </div>
          </div>

          <!-- 表示モード -->
          <div v-else class="display-mode">
            <div class="item-header">
              <span class="item-name">{{ item.name }}</span>
              <div class="item-actions">
                <button 
                  @click="generateAIPrompt(item)" 
                  :disabled="generatingPrompt[item.id]"
                  class="ai-btn"
                  title="AI特徴プロンプト生成"
                >
                  <span v-if="generatingPrompt[item.id]">🔄</span>
                  <span v-else>🤖</span>
                </button>
                <button @click="startEditing(item)" class="edit-btn">✏️</button>
                <button @click="deleteInventoryItem(item)" class="delete-btn">🗑️</button>
              </div>
            </div>

            <!-- プロンプト情報 -->
            <div class="prompt-section">
              <!-- ユーザープロンプト -->
              <div v-if="item.description_prompt" class="user-prompt">
                <span class="prompt-label">👤 ユーザープロンプト:</span>
                <span class="prompt-text">{{ item.description_prompt }}</span>
              </div>

              <!-- AIプロンプト -->
              <div v-if="formatPrompt(item)" class="ai-prompt">
                <span class="prompt-label">🤖 AI特徴:</span>
                <span class="prompt-text">{{ formatPrompt(item) }}</span>
                <div v-if="formatKeywords(item).length > 0" class="keywords">
                  <span 
                    v-for="keyword in formatKeywords(item)" 
                    :key="keyword"
                    class="keyword-tag"
                  >
                    {{ keyword }}
                  </span>
                </div>
              </div>

              <!-- プロンプト未設定の場合 -->
              <div v-if="!item.description_prompt && !formatPrompt(item)" class="no-prompt">
                <span class="prompt-label">💡 プロンプト:</span>
                <span class="prompt-hint">🤖ボタンでAI生成 or ✏️ボタンで手動設定</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ヘルプ -->
    <div class="help-section">
      <h3>💡 v2.0の新機能</h3>
      <ul>
        <li><strong>🤖 AI特徴プロンプト:</strong> 各食材の特徴をAIが自動生成し、画像認識精度が向上</li>
        <li><strong>👤 カスタムプロンプト:</strong> 独自の特徴を手動で追加可能</li>
        <li><strong>🎯 YOLO検出:</strong> 物体検出アルゴリズムで正確な在庫分析</li>
        <li><strong>📊 統合解析:</strong> 複数角度の画像を統合して包括的な分析</li>
      </ul>
      
      <h3>📱 使い方</h3>
      <ul>
        <li>よく使う調味料（醤油、塩、砂糖など）も登録しておくと便利です</li>
        <li>🤖ボタンでAIが特徴プロンプトを自動生成します</li>
        <li>✏️ボタンで食材名とプロンプトを編集できます</li>
        <li>プロンプトにより冷蔵庫撮影時の認識精度が向上します</li>
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
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #6b7280;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.list-header {
  margin-bottom: 1.5rem;
}

.list-header h3 {
  margin: 0;
  color: #1f2937;
  font-size: 1.125rem;
  font-weight: 600;
}

.items-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.item-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  transition: all 0.2s;
}

.item-card.enhanced {
  border-left: 4px solid #3b82f6;
}

.item-card:hover {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.display-mode {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-name {
  font-weight: 500;
  color: #374151;
  font-size: 1rem;
}

.item-actions {
  display: flex;
  gap: 0.5rem;
}

.ai-btn, .edit-btn, .delete-btn {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.ai-btn {
  background: #e0f2fe;
  color: #075985;
}

.ai-btn:hover:not(:disabled) {
  background: #bae6fd;
}

.ai-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.edit-btn {
  background: #fef3c7;
  color: #d97706;
}

.edit-btn:hover {
  background: #fde68a;
}

.delete-btn {
  background: #fee2e2;
  color: #dc2626;
}

.delete-btn:hover {
  background: #fecaca;
}

.prompt-section {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.75rem;
  font-size: 0.875rem;
}

.user-prompt, .ai-prompt, .no-prompt {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.user-prompt:last-child, .ai-prompt:last-child, .no-prompt:last-child {
  margin-bottom: 0;
}

.prompt-label {
  font-weight: 500;
  color: #374151;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.prompt-text {
  color: #4b5563;
  line-height: 1.4;
}

.keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.5rem;
}

.keyword-tag {
  background: #e0f2fe;
  color: #075985;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.prompt-hint {
  color: #6b7280;
  font-style: italic;
}

.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.edit-fields {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.edit-input, .edit-prompt {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.edit-input:focus, .edit-prompt:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.edit-prompt {
  min-height: 60px;
  resize: vertical;
  font-family: inherit;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.save-btn, .cancel-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 0.875rem;
}

.save-btn {
  background: #10b981;
  color: white;
}

.save-btn:hover {
  background: #059669;
}

.cancel-btn {
  background: #ef4444;
  color: white;
}

.cancel-btn:hover {
  background: #dc2626;
}

.help-section {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.help-section h3 {
  margin: 0 0 1rem 0;
  color: #1f2937;
  font-size: 1.125rem;
  font-weight: 600;
}

.help-section ul {
  margin: 0;
  padding-left: 1.25rem;
  color: #4b5563;
}

.help-section li {
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

/* レスポンシブ */
@media (max-width: 768px) {
  .inventory-container {
    padding: 0.5rem;
  }
  
  .input-row {
    flex-direction: column;
  }
  
  .add-btn {
    width: 100%;
  }
  
  .item-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  
  .item-actions {
    align-self: flex-end;
  }
  
  .edit-actions {
    justify-content: stretch;
  }
  
  .save-btn, .cancel-btn {
    flex: 1;
  }
}
</style> 