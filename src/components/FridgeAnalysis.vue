<script setup>
import { ref, computed, onMounted } from 'vue'
import { imageToBase64, analyzeFridgeBasic } from '../openai-client.js'
import { supabase } from '../supabase.js'

// 撮影エリア定義
const CAMERA_AREAS = [
  {
    id: 'main',
    name: '冷蔵室正面',
    icon: '🥛',
    description: 'メイン冷蔵庫内部の全体像',
    placeholder: 'main_compartment.jpg'
  },
  {
    id: 'door',
    name: '冷蔵室扉',
    icon: '🧂',
    description: 'ドアポケット',
    placeholder: 'door_pocket.jpg'
  },
  {
    id: 'vegetable',
    name: '野菜室',
    icon: '🥬',
    description: '野菜室',
    placeholder: 'vegetable_drawer.jpg'
  }
]

// 状態管理
const currentStep = ref('capture') // 'capture', 'analyze', 'review'
const capturedImages = ref({}) // { areaId: { file, base64, name, detected_items, analysis_status } }
const inventoryItems = ref([]) // 常備食材一覧
const missingItems = ref([]) // 不足食材（買い物リスト）
const isAnalyzing = ref(false)
const errorMessage = ref('')
const showResults = ref(false)

// 初期化
onMounted(async () => {
  await loadInventoryItems()
})

// 常備食材一覧を読み込み
const loadInventoryItems = async () => {
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
  }
}

// 統計
const analysisStats = computed(() => {
  const totalAreas = CAMERA_AREAS.length
  const capturedAreas = Object.keys(capturedImages.value).length
  const analyzedAreas = Object.values(capturedImages.value).filter(
    area => area.analysis_status === 'completed'
  ).length
  const totalDetectedItems = Object.values(capturedImages.value)
    .flatMap(area => area.detected_items || []).length

  return {
    totalAreas,
    capturedAreas,
    analyzedAreas,
    totalDetectedItems,
    isComplete: analyzedAreas === totalAreas && totalAreas > 0
  }
})

// ファイル選択処理
const handleFileSelect = async (areaId, event) => {
  const file = event.target.files[0]
  if (!file || !file.type.startsWith('image/')) return

  try {
    const base64 = await imageToBase64(file)
    
    capturedImages.value[areaId] = {
      file: file,
      base64: base64,
      name: file.name,
      detected_items: [],
      analysis_status: 'pending' // 'pending', 'analyzing', 'completed', 'error'
    }

    // 自動的にAI分析を開始
    await analyzeImage(areaId)
  } catch (error) {
    console.error('画像アップロードエラー:', error)
    errorMessage.value = '画像のアップロードに失敗しました'
  }
}

// AI分析実行
const analyzeImage = async (areaId) => {
  const imageData = capturedImages.value[areaId]
  if (!imageData) return

  imageData.analysis_status = 'analyzing'
  errorMessage.value = ''

  try {
    console.log(`${CAMERA_AREAS.find(a => a.id === areaId)?.name}の分析を開始...`)
    
    const response = await analyzeFridgeBasic(imageData.base64)
    console.log('AI Response:', response)
    
    if (!response.success) {
      throw new Error(`GPT-4o API error: ${response.error}`)
    }
    
    const content = response.result
    console.log('AI Content:', content)

    // JSONレスポンスをパース
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0])
      console.log('Parsed Result:', result)
      
      const detectedItems = result.detected_items || []
      imageData.detected_items = detectedItems.map((item, index) => ({
        id: `ai_item_${areaId}_${index}_${Date.now()}`,
        name: item.name,
        quantity: item.quantity || '普通',
        confidence: item.confidence || 80,
        isAiGenerated: true
      }))
    } else {
      console.warn('JSONが見つかりませんでした:', content)
      imageData.detected_items = []
    }
    
    imageData.analysis_status = 'completed'
    console.log(`${CAMERA_AREAS.find(a => a.id === areaId)?.name}の分析完了`)
    
  } catch (error) {
    console.error(`${areaId}の分析エラー:`, error)
    imageData.analysis_status = 'error'
    errorMessage.value = `${CAMERA_AREAS.find(a => a.id === areaId)?.name}の分析に失敗しました`
  }
}

// すべての画像を分析
const analyzeAllImages = async () => {
  isAnalyzing.value = true
  
  for (const areaId of Object.keys(capturedImages.value)) {
    const imageData = capturedImages.value[areaId]
    if (imageData.analysis_status === 'pending') {
      await analyzeImage(areaId)
    }
  }
  
  isAnalyzing.value = false
}

// 買い物リスト生成
const generateShoppingList = () => {
  if (!analysisStats.value.isComplete) {
    errorMessage.value = 'すべてのエリアの分析が完了していません'
    return
  }

  // 検出された食材を収集
  const detectedItems = Object.values(capturedImages.value)
    .flatMap(area => area.detected_items || [])
    .map(item => item.name.toLowerCase())

  // 常備食材と照合して不足分を抽出
  const missing = inventoryItems.value.filter(inventoryItem => {
    const found = detectedItems.some(detectedName => 
      detectedName.includes(inventoryItem.name.toLowerCase()) ||
      inventoryItem.name.toLowerCase().includes(detectedName)
    )
    return !found
  })

  missingItems.value = missing.map(item => ({
    id: item.id,
    name: item.name,
    addedToList: true
  }))

  currentStep.value = 'review'
  showResults.value = true
}

// 手動で食材追加
const addManualItem = (areaId) => {
  const imageData = capturedImages.value[areaId]
  if (!imageData) return

  const newItem = {
    id: `manual_item_${areaId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: '新しい食材',
    quantity: '普通',
    confidence: 100,
    isAiGenerated: false
  }

  imageData.detected_items.push(newItem)
}

// 食材削除
const removeItem = (areaId, itemId) => {
  const imageData = capturedImages.value[areaId]
  if (!imageData) return

  imageData.detected_items = imageData.detected_items.filter(item => item.id !== itemId)
}

// 食材編集
const editingItem = ref(null)

const startEditingItem = (areaId, item) => {
  editingItem.value = {
    areaId: areaId,
    itemId: item.id,
    name: item.name,
    quantity: item.quantity
  }
}

const saveEditingItem = () => {
  if (!editingItem.value) return
  
  const imageData = capturedImages.value[editingItem.value.areaId]
  if (!imageData) return
  
  const itemIndex = imageData.detected_items.findIndex(
    item => item.id === editingItem.value.itemId
  )
  
  if (itemIndex !== -1) {
    imageData.detected_items[itemIndex].name = editingItem.value.name
    imageData.detected_items[itemIndex].quantity = editingItem.value.quantity
  }
  
  editingItem.value = null
}

const cancelEditing = () => {
  editingItem.value = null
}

// 買い物リストをSupabaseに保存
const saveShoppingList = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('ユーザーが認証されていません')
    }

    const itemsToSave = missingItems.value.filter(item => item.addedToList)
    
    if (itemsToSave.length === 0) {
      errorMessage.value = '買い物リストに追加する食材がありません'
      return
    }

    const { data, error } = await supabase
      .from('shopping_list')
      .insert(
        itemsToSave.map(item => ({
          user_id: user.id,
          item_name: item.name,
          is_purchased: false
        }))
      )

    if (error) {
      throw error
    }

    alert(`${itemsToSave.length}件の食材を買い物リストに追加しました`)
    
    // リセット
    resetAnalysis()
    
  } catch (error) {
    console.error('買い物リスト保存エラー:', error)
    errorMessage.value = '買い物リストの保存に失敗しました'
  }
}

// 分析リセット
const resetAnalysis = () => {
  capturedImages.value = {}
  missingItems.value = []
  currentStep.value = 'capture'
  showResults.value = false
  errorMessage.value = ''
  editingItem.value = null
}

// 画像削除
const removeImage = (areaId) => {
  if (confirm('この画像を削除しますか？')) {
    delete capturedImages.value[areaId]
  }
}
</script>

<template>
  <div class="analysis-container">
    <!-- ヘッダー -->
    <div class="page-header">
      <h2 class="page-title">📸 冷蔵庫の確認</h2>
      <p class="page-description">
        冷蔵庫を3つの角度から撮影して、AIが食材を自動検出します。<br>
        常備食材と照合して、不足分を買い物リストに追加できます。
      </p>
    </div>

    <!-- ステップインジケーター -->
    <div class="step-indicator">
      <div :class="['step', { active: currentStep === 'capture' }]">
        <span class="step-number">1</span>
        <span class="step-label">撮影</span>
      </div>
      <div :class="['step', { active: currentStep === 'analyze' }]">
        <span class="step-number">2</span>
        <span class="step-label">分析</span>
      </div>
      <div :class="['step', { active: currentStep === 'review' }]">
        <span class="step-number">3</span>
        <span class="step-label">確認</span>
      </div>
    </div>

    <!-- エラーメッセージ -->
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <!-- 撮影セクション -->
    <div v-if="currentStep === 'capture'" class="capture-section">
      <div class="capture-intro">
        <h3>📷 冷蔵庫を撮影してください</h3>
        <p>3つのエリアを撮影することで、より正確な食材検出が可能になります。</p>
      </div>

      <div class="camera-areas">
        <div v-for="area in CAMERA_AREAS" :key="area.id" class="camera-area">
          <div class="area-header">
            <span class="area-icon">{{ area.icon }}</span>
            <div class="area-info">
              <h4 class="area-name">{{ area.name }}</h4>
              <p class="area-description">{{ area.description }}</p>
            </div>
          </div>

          <!-- 未撮影状態 -->
          <div v-if="!capturedImages[area.id]" class="upload-zone">
            <input
              :id="`file-${area.id}`"
              type="file"
              accept="image/*"
              @change="handleFileSelect(area.id, $event)"
              class="file-input"
            />
            <label :for="`file-${area.id}`" class="upload-label">
              <span class="upload-icon">📸</span>
              <span class="upload-text">写真を選択</span>
            </label>
          </div>

          <!-- 撮影済み状態 -->
          <div v-else class="captured-state">
            <div class="image-preview">
              <img :src="capturedImages[area.id].base64" :alt="area.name" class="preview-image" />
              <button @click="removeImage(area.id)" class="remove-image-btn">×</button>
            </div>
            
            <!-- 分析状況 -->
            <div class="analysis-status">
              <div v-if="capturedImages[area.id].analysis_status === 'analyzing'" class="status-analyzing">
                <div class="status-spinner"></div>
                <span>AI分析中...</span>
              </div>
              <div v-else-if="capturedImages[area.id].analysis_status === 'completed'" class="status-completed">
                <span class="status-icon">✅</span>
                <span>分析完了（{{ capturedImages[area.id].detected_items.length }}件検出）</span>
              </div>
              <div v-else-if="capturedImages[area.id].analysis_status === 'error'" class="status-error">
                <span class="status-icon">⚠️</span>
                <span>分析失敗</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 次へボタン -->
      <div v-if="analysisStats.capturedAreas > 0" class="action-buttons">
        <button 
          @click="currentStep = 'analyze'"
          class="btn btn-primary"
        >
          検出結果を確認する →
        </button>
      </div>
    </div>

    <!-- 分析結果確認セクション -->
    <div v-else-if="currentStep === 'analyze'" class="analyze-section">
      <div class="analyze-header">
        <h3>🤖 AI検出結果の確認</h3>
        <p>検出された食材を確認し、必要に応じて編集してください。</p>
        
        <div class="analyze-stats">
          <span class="stat">撮影: {{ analysisStats.capturedAreas }}/{{ analysisStats.totalAreas }}エリア</span>
          <span class="stat">検出: {{ analysisStats.totalDetectedItems }}個の食材</span>
        </div>
      </div>

      <div class="detection-results">
        <div v-for="area in CAMERA_AREAS" :key="area.id" class="result-area">
          <div v-if="capturedImages[area.id]" class="area-result">
            <div class="result-header">
              <span class="area-icon">{{ area.icon }}</span>
              <h4 class="area-name">{{ area.name }}</h4>
              <button @click="addManualItem(area.id)" class="btn btn-secondary btn-sm">
                ➕ 手動追加
              </button>
            </div>

            <div class="result-content">
              <!-- 画像プレビュー -->
              <div class="image-container">
                <img :src="capturedImages[area.id].base64" :alt="area.name" class="result-image" />
              </div>

              <!-- 検出された食材一覧 -->
              <div class="detected-items">
                <div v-if="capturedImages[area.id].detected_items.length === 0" class="no-items">
                  <p>食材が検出されませんでした</p>
                  <button @click="addManualItem(area.id)" class="btn btn-primary btn-sm">
                    ➕ 手動で追加
                  </button>
                </div>

                <div v-else class="items-list">
                  <div 
                    v-for="item in capturedImages[area.id].detected_items" 
                    :key="item.id"
                    class="item-row"
                    :class="{ 'ai-generated': item.isAiGenerated, 'manual': !item.isAiGenerated }"
                  >
                    <!-- 編集モード -->
                    <div v-if="editingItem && editingItem.itemId === item.id" class="editing-mode">
                      <input 
                        v-model="editingItem.name"
                        type="text" 
                        placeholder="食材名"
                        class="edit-input"
                      >
                      <select v-model="editingItem.quantity" class="edit-select">
                        <option value="多い">多い</option>
                        <option value="普通">普通</option>
                        <option value="少ない">少ない</option>
                        <option value="なし">なし</option>
                      </select>
                      <div class="edit-actions">
                        <button @click="saveEditingItem()" class="btn btn-primary btn-sm">✅</button>
                        <button @click="cancelEditing()" class="btn btn-secondary btn-sm">❌</button>
                      </div>
                    </div>
                    
                    <!-- 表示モード -->
                    <div v-else class="display-mode">
                      <div class="item-info">
                        <span class="item-name">{{ item.name }}</span>
                        <span class="item-quantity">{{ item.quantity }}</span>
                        <span v-if="item.confidence" class="confidence">{{ item.confidence }}%</span>
                        <span class="source-badge">{{ item.isAiGenerated ? 'AI' : '手動' }}</span>
                      </div>
                      <div class="item-actions">
                        <button @click="startEditingItem(area.id, item)" class="btn btn-secondary btn-sm">✏️</button>
                        <button @click="removeItem(area.id, item.id)" class="btn btn-danger btn-sm">🗑️</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- アクションボタン -->
      <div class="action-buttons">
        <button @click="currentStep = 'capture'" class="btn btn-secondary">
          ← 撮影に戻る
        </button>
        <button 
          @click="generateShoppingList"
          :disabled="!analysisStats.isComplete"
          class="btn btn-primary"
        >
          買い物リストを作成 →
        </button>
      </div>
    </div>

    <!-- 買い物リスト確認セクション -->
    <div v-else-if="currentStep === 'review'" class="review-section">
      <div class="review-header">
        <h3>🛒 買い物リスト</h3>
        <p>常備食材と照合した結果、以下の食材が不足しています。</p>
      </div>

      <div v-if="missingItems.length === 0" class="no-missing">
        <div class="success-icon">🎉</div>
        <h4>すべての常備食材が揃っています！</h4>
        <p>追加で購入が必要な食材はありませんでした。</p>
      </div>

      <div v-else class="missing-items">
        <div class="missing-count">
          不足している食材: {{ missingItems.filter(item => item.addedToList).length }}件
        </div>
        
        <div class="items-list">
          <div v-for="item in missingItems" :key="item.id" class="missing-item">
            <label class="item-checkbox">
              <input 
                type="checkbox" 
                v-model="item.addedToList"
              />
              <span class="checkmark"></span>
              <span class="item-name">{{ item.name }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- アクションボタン -->
      <div class="action-buttons">
        <button @click="currentStep = 'analyze'" class="btn btn-secondary">
          ← 検出結果に戻る
        </button>
        <button 
          v-if="missingItems.length > 0"
          @click="saveShoppingList"
          :disabled="missingItems.filter(item => item.addedToList).length === 0"
          class="btn btn-primary"
        >
          買い物リストに追加
        </button>
        <button @click="resetAnalysis" class="btn btn-secondary">
          新しく撮影する
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analysis-container {
  max-width: 1000px;
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

/* ステップインジケーター */
.step-indicator {
  display: flex;
  justify-content: center;
  margin-bottom: 2rem;
  gap: 2rem;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.step.active {
  opacity: 1;
}

.step-number {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: #e5e7eb;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.875rem;
}

.step.active .step-number {
  background: #3b82f6;
  color: white;
}

.step-label {
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 500;
}

.step.active .step-label {
  color: #3b82f6;
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

/* 撮影セクション */
.capture-intro {
  text-align: center;
  margin-bottom: 2rem;
}

.capture-intro h3 {
  margin: 0 0 0.5rem 0;
  color: #374151;
}

.capture-intro p {
  margin: 0;
  color: #6b7280;
  font-size: 0.875rem;
}

.camera-areas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.camera-area {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.area-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}

.area-icon {
  font-size: 2rem;
}

.area-info {
  flex: 1;
}

.area-name {
  margin: 0;
  color: #374151;
  font-size: 1rem;
  font-weight: 600;
}

.area-description {
  margin: 0.25rem 0 0 0;
  color: #6b7280;
  font-size: 0.75rem;
}

/* アップロードゾーン */
.upload-zone {
  padding: 2rem;
  text-align: center;
}

.file-input {
  display: none;
}

.upload-label {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem;
  border: 2px dashed #cbd5e0;
  border-radius: 0.5rem;
  background: #f8fafc;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-label:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.upload-icon {
  font-size: 2rem;
  color: #6b7280;
}

.upload-text {
  color: #374151;
  font-weight: 500;
}

/* 撮影済み状態 */
.captured-state {
  padding: 1rem;
}

.image-preview {
  position: relative;
  margin-bottom: 1rem;
}

.preview-image {
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 0.5rem;
  background: #f8fafc;
}

.remove-image-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
}

.analysis-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.status-analyzing {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #3b82f6;
}

.status-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid #e5e7eb;
  border-top: 2px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status-completed {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #10b981;
}

.status-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #ef4444;
}

/* 分析セクション */
.analyze-header {
  text-align: center;
  margin-bottom: 2rem;
}

.analyze-header h3 {
  margin: 0 0 0.5rem 0;
  color: #374151;
}

.analyze-header p {
  margin: 0 0 1rem 0;
  color: #6b7280;
  font-size: 0.875rem;
}

.analyze-stats {
  display: flex;
  justify-content: center;
  gap: 1rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.stat {
  padding: 0.25rem 0.5rem;
  background: #f3f4f6;
  border-radius: 1rem;
}

.detection-results {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin-bottom: 2rem;
}

.area-result {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}

.result-header .area-name {
  flex: 1;
  margin: 0;
  color: #374151;
  font-size: 1rem;
  font-weight: 600;
}

.result-content {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1.5rem;
  padding: 1.5rem;
}

.image-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.result-image {
  width: 100%;
  max-height: 250px;
  object-fit: contain;
  border-radius: 0.5rem;
  background: #f8fafc;
}

.detected-items {
  display: flex;
  flex-direction: column;
}

.no-items {
  text-align: center;
  padding: 2rem;
  color: #6b7280;
}

.no-items p {
  margin: 0 0 1rem 0;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.item-row {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  transition: all 0.2s;
}

.item-row.ai-generated {
  border-left: 4px solid #10b981;
  background: #f0fdf4;
}

.item-row.manual {
  border-left: 4px solid #f59e0b;
  background: #fffbeb;
}

.display-mode {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.875rem;
}

.item-name {
  font-weight: bold;
  color: #1f2937;
}

.item-quantity {
  background: #e5e7eb;
  color: #374151;
  padding: 0.125rem 0.5rem;
  border-radius: 1rem;
  font-size: 0.75rem;
}

.confidence {
  background: #ddd6fe;
  color: #5b21b6;
  padding: 0.125rem 0.375rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: bold;
}

.source-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: bold;
}

.item-row.ai-generated .source-badge {
  background: #d1fae5;
  color: #065f46;
}

.item-row.manual .source-badge {
  background: #fef3c7;
  color: #92400e;
}

.item-actions {
  display: flex;
  gap: 0.5rem;
}

/* 編集モード */
.editing-mode {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.edit-input, .edit-select {
  padding: 0.5rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  background: white;
}

.edit-input {
  flex: 1;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
}

/* 買い物リストセクション */
.review-header {
  text-align: center;
  margin-bottom: 2rem;
}

.review-header h3 {
  margin: 0 0 0.5rem 0;
  color: #374151;
}

.review-header p {
  margin: 0;
  color: #6b7280;
  font-size: 0.875rem;
}

.no-missing {
  text-align: center;
  padding: 3rem 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  margin-bottom: 2rem;
}

.success-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.no-missing h4 {
  margin: 0 0 0.5rem 0;
  color: #374151;
}

.no-missing p {
  margin: 0;
  color: #6b7280;
}

.missing-items {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  overflow: hidden;
  margin-bottom: 2rem;
}

.missing-count {
  padding: 1rem;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
  color: #374151;
  font-weight: 600;
}

.missing-item {
  padding: 1rem;
  border-bottom: 1px solid #f3f4f6;
}

.missing-item:last-child {
  border-bottom: none;
}

.item-checkbox {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #374151;
}

.item-checkbox input[type="checkbox"] {
  margin: 0;
}

/* ボタン */
.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
}

.btn-sm {
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-secondary {
  background: #6b7280;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #4b5563;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
}

/* レスポンシブ */
@media (max-width: 768px) {
  .analysis-container {
    padding: 0.5rem;
  }
  
  .step-indicator {
    gap: 1rem;
  }
  
  .camera-areas {
    grid-template-columns: 1fr;
  }
  
  .result-content {
    grid-template-columns: 1fr;
  }
  
  .display-mode {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
  
  .editing-mode {
    flex-direction: column;
    align-items: stretch;
  }
  
  .action-buttons {
    flex-direction: column;
  }
}
</style> 