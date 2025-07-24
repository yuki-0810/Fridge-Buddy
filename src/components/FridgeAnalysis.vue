<script setup>
import { ref, computed, onMounted } from 'vue'
import { imageToBase64, analyzeFridgeWithYOLO, analyzeMultipleFridgeImages } from '../gemini-client.js'
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
const promptMap = ref({}) // 食材名とプロンプトのマップ
const missingItems = ref([]) // 不足食材（買い物リスト）
const integratedAnalysis = ref(null) // 統合解析結果
const isAnalyzing = ref(false)
const isIntegratedAnalyzing = ref(false)
const errorMessage = ref('')
const showResults = ref(false)
const aiEngine = ref('gemini-yolo') // AI engine indicator

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
    
    // プロンプトマップを作成
    const map = {}
    inventoryItems.value.forEach(item => {
      map[item.name] = {
        prompt: item.description_prompt || '',
        ai_prompt: item.ai_generated_prompt ? JSON.parse(item.ai_generated_prompt) : null
      }
    })
    promptMap.value = map
    
    console.log('プロンプトマップ:', promptMap.value)
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
    // アップロードされたエリアがすべて分析完了していて、かつ最低1つはアップロードされている場合に完了とする
    isComplete: capturedAreas > 0 && analyzedAreas === capturedAreas
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

// AI分析実行（Gemini YOLOベース）
const analyzeImage = async (areaId) => {
  const imageData = capturedImages.value[areaId]
  if (!imageData) return

  imageData.analysis_status = 'analyzing'
  errorMessage.value = ''

  try {
    console.log(`${CAMERA_AREAS.find(a => a.id === areaId)?.name}の分析を開始...`)
    
    const stockList = inventoryItems.value.map(item => item.name)
    const response = await analyzeFridgeWithYOLO(imageData.base64, stockList, promptMap.value)
    
    console.log('Gemini YOLO Response:', response)
    
    if (!response.success) {
      throw new Error(`Gemini API error: ${response.error}`)
    }
    
    const result = response.result
    console.log('解析結果:', result)
    
    if (result.detected_items) {
      imageData.detected_items = result.detected_items.map((item, index) => ({
        id: `yolo_item_${areaId}_${index}_${Date.now()}`,
        name: item.name,
        category: item.category || 'その他',
        quantity_level: item.quantity_level || 3,
        confidence: item.confidence || 70,
        location: item.location || areaId,
        bounding_box: item.bounding_box || '',
        matched_prompt: item.matched_prompt || '',
        visual_evidence: item.visual_evidence || '',
        isAiGenerated: true,
        engine: 'gemini-yolo'
      }))
      
      // 分析サマリーを保存
      imageData.analysis_summary = result.analysis_summary || {}
      imageData.recommendations = result.recommendations || []
    }

    imageData.analysis_status = 'completed'
    console.log(`${CAMERA_AREAS.find(a => a.id === areaId)?.name}の分析完了`)
    
    // すべてのエリアが分析完了した場合、統合解析を実行
    if (analysisStats.value.isComplete) {
      await performIntegratedAnalysis()
    }
    
  } catch (error) {
    console.error('AI分析エラー:', error)
    imageData.analysis_status = 'error'
    errorMessage.value = `分析に失敗しました: ${error.message}`
  }
}

// 統合解析実行
const performIntegratedAnalysis = async () => {
  if (isIntegratedAnalyzing.value) return
  
  isIntegratedAnalyzing.value = true
  
  try {
    console.log('統合解析を開始...')
    
    const imageDataList = Object.values(capturedImages.value)
      .filter(img => img.analysis_status === 'completed')
      .map(img => img.base64)
    
    if (imageDataList.length === 0) return
    
    const stockList = inventoryItems.value.map(item => item.name)
    const response = await analyzeMultipleFridgeImages(imageDataList, stockList, promptMap.value)
    
    console.log('統合解析レスポンス:', response)
    
    if (response.success) {
      integratedAnalysis.value = response.result.integrated_analysis
      
      // 統合結果から買い物リストを生成
      if (integratedAnalysis.value) {
        missingItems.value = [
          ...(integratedAnalysis.value.missing_items || []),
          ...(integratedAnalysis.value.low_stock_alerts || []),
          ...(integratedAnalysis.value.shopping_priority || [])
        ].filter((item, index, self) => self.indexOf(item) === index) // 重複除去
      }
      
      console.log('統合解析完了:', integratedAnalysis.value)
    } else {
      console.error('統合解析エラー:', response.error)
    }
  } catch (error) {
    console.error('統合解析エラー:', error)
    errorMessage.value = `統合解析に失敗しました: ${error.message}`
  } finally {
    isIntegratedAnalyzing.value = false
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
  if (Object.keys(capturedImages.value).length === 0) {
    errorMessage.value = '冷蔵庫の写真を少なくとも1つアップロードしてください'
    return
  }

  if (!analysisStats.value.isComplete) {
    errorMessage.value = 'アップロードした画像の分析が完了していません'
    return
  }

  // 検出された食材を収集（量の情報も含む）
  const detectedItems = Object.values(capturedImages.value)
    .flatMap(area => area.detected_items || [])

  // 常備食材と照合して不足分を抽出
  const missing = inventoryItems.value.filter(inventoryItem => {
    // この常備食材が検出されているかチェック
    const detectedItem = detectedItems.find(detectedItem => 
      detectedItem.name.toLowerCase().includes(inventoryItem.name.toLowerCase()) ||
      inventoryItem.name.toLowerCase().includes(detectedItem.name.toLowerCase())
    )
    
    // 検出されていない、または検出されていても量が「少ない」なら買い物リストに追加
    return !detectedItem || detectedItem.quantity_level === 1 // 1: 少ない
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
    category: 'その他',
    quantity_level: 3, // 3: 普通
    confidence: 100,
    location: areaId,
    isAiGenerated: false,
    engine: 'manual'
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
    quantity_level: item.quantity_level || 3
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
    imageData.detected_items[itemIndex].quantity_level = editingItem.value.quantity_level
  }
  
  editingItem.value = null
}

const cancelEditing = () => {
  editingItem.value = null
}

// 量レベルを文字列に変換
const quantityLevelToText = (level) => {
  const map = {
    0: 'なし',
    1: '僅少',
    2: '少ない',
    3: '普通',
    4: '多い'
  }
  return map[level] || '不明'
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
      <h2 class="page-title">📸 冷蔵庫の確認 v2.0</h2>
      <p class="page-description">
        <strong>🆕 Gemini YOLO検出</strong>で精度が向上！冷蔵庫を3つの角度から撮影して、AIが食材を自動検出します。<br>
        <strong>🤖 特徴プロンプト</strong>により、常備食材の認識精度が大幅に向上しました。
      </p>
      
      <!-- AI Engine Indicator -->
      <div class="ai-engine-badge">
        <span class="engine-icon">🤖</span>
        <span class="engine-text">Gemini 2.5 Flash + YOLO Detection</span>
      </div>
    </div>

    <!-- 統合解析結果 -->
    <div v-if="integratedAnalysis" class="integrated-analysis">
      <div class="analysis-header">
        <h3>🔬 統合解析結果</h3>
        <div class="analysis-summary">
          <span class="summary-stat">
            📊 {{ integratedAnalysis.total_areas_scanned }}エリア分析
          </span>
          <span class="summary-stat">
            🔍 {{ integratedAnalysis.comprehensive_inventory?.length || 0 }}食材検出
          </span>
          <span v-if="isIntegratedAnalyzing" class="analyzing-badge">
            🔄 統合解析中...
          </span>
        </div>
      </div>
      
      <div class="comprehensive-inventory">
        <div v-for="item in integratedAnalysis.comprehensive_inventory" :key="item.name" class="inventory-item">
          <div class="item-header">
            <span class="item-name">{{ item.name }}</span>
            <span class="total-quantity">{{ item.total_quantity }}</span>
            <span class="confidence-badge">{{ item.confidence }}%</span>
          </div>
          <div class="item-details">
            <span class="locations">📍 {{ item.locations?.join(', ') }}</span>
            <span v-if="item.notes" class="notes">💡 {{ item.notes }}</span>
          </div>
        </div>
      </div>
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
                <span>🤖 Gemini YOLO分析中...</span>
              </div>
              <div v-else-if="capturedImages[area.id].analysis_status === 'completed'" class="status-completed">
                <span class="status-icon">✅</span>
                <span>分析完了（{{ capturedImages[area.id].detected_items.length }}件検出）</span>
                <div v-if="capturedImages[area.id].analysis_summary" class="summary-details">
                  <span class="summary-detail">高信頼度: {{ capturedImages[area.id].analysis_summary.high_confidence_items || 0 }}件</span>
                  <span class="summary-detail">常備食材: {{ capturedImages[area.id].analysis_summary.stock_items_found || 0 }}件発見</span>
                </div>
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
        <p>YOLOベース検出で食材を特定しました。必要に応じて編集してください。</p>
        
        <div class="analyze-stats">
          <span class="stat">撮影: {{ analysisStats.capturedAreas }}/{{ analysisStats.totalAreas }}エリア</span>
          <span class="stat">検出: {{ analysisStats.totalDetectedItems }}個の食材</span>
          <span class="stat">エンジン: {{ aiEngine }}</span>
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
                      <select v-model="editingItem.quantity_level" class="edit-select">
                        <option :value="0">なし</option>
                        <option :value="1">僅少</option>
                        <option :value="2">少ない</option>
                        <option :value="3">普通</option>
                        <option :value="4">多い</option>
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
                        <span class="item-category">{{ item.category }}</span>
                        <span class="item-quantity">{{ quantityLevelToText(item.quantity_level) }}</span>
                        <span v-if="item.confidence" class="confidence">{{ item.confidence }}%</span>
                        <span class="source-badge" :class="{ 'ai-badge': item.isAiGenerated, 'manual-badge': !item.isAiGenerated }">
                          {{ item.isAiGenerated ? 'YOLO' : '手動' }}
                        </span>
                      </div>
                      
                      <!-- YOLO詳細情報 -->
                      <div v-if="item.isAiGenerated && item.engine === 'gemini-yolo'" class="yolo-details">
                        <div v-if="item.matched_prompt" class="matched-prompt">
                          <span class="detail-label">🎯 使用プロンプト:</span>
                          <span class="detail-text">{{ item.matched_prompt }}</span>
                        </div>
                        <div v-if="item.visual_evidence" class="visual-evidence">
                          <span class="detail-label">👁️ 視覚的根拠:</span>
                          <span class="detail-text">{{ item.visual_evidence }}</span>
                        </div>
                        <div v-if="item.location" class="location-info">
                          <span class="detail-label">📍 検出位置:</span>
                          <span class="detail-text">{{ item.location }}</span>
                        </div>
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
        <p>常備食材との照合結果と統合解析により、以下の食材の購入をお勧めします。</p>
      </div>

      <div v-if="missingItems.length === 0" class="no-missing">
        <div class="success-icon">🎉</div>
        <h4>すべての常備食材が揃っています！</h4>
        <p>追加で購入が必要な食材はありませんでした。</p>
      </div>

      <div v-else class="missing-items">
        <div class="missing-count">
          購入推奨食材: {{ missingItems.filter(item => item.addedToList).length }}件
        </div>
        
        <!-- 統合解析からの推奨 -->
        <div v-if="integratedAnalysis && integratedAnalysis.shopping_priority" class="priority-items">
          <h4>🔥 優先購入リスト</h4>
          <div class="priority-list">
            <span v-for="item in integratedAnalysis.shopping_priority" :key="item" class="priority-item">
              {{ item }}
            </span>
          </div>
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

.ai-engine-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #e0f2fe, #bae6fd);
  border: 1px solid #0284c7;
  color: #075985;
  padding: 0.5rem 1rem;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  margin-top: 1rem;
}

.engine-icon {
  font-size: 1.25rem;
}

/* 統合解析結果 */
.integrated-analysis {
  background: white;
  border: 2px solid #e0f2fe;
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.analysis-header {
  margin-bottom: 1rem;
}

.analysis-header h3 {
  margin: 0 0 0.5rem 0;
  color: #0c4a6e;
  font-size: 1.25rem;
  font-weight: 600;
}

.analysis-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.5rem;
}

.summary-stat {
  background: #f0f9ff;
  color: #0c4a6e;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.analyzing-badge {
  background: #fef3c7;
  color: #d97706;
  animation: pulse 2s infinite;
}

.comprehensive-inventory {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.inventory-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 0.75rem;
}

.inventory-item .item-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.inventory-item .item-name {
  font-weight: 600;
  color: #1e293b;
}

.total-quantity {
  background: #dbeafe;
  color: #1e40af;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.confidence-badge {
  background: #dcfce7;
  color: #166534;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.item-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #64748b;
}

.locations, .notes {
  display: block;
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
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.area-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.area-icon {
  font-size: 2rem;
}

.area-info h4 {
  margin: 0;
  color: #374151;
  font-size: 1rem;
  font-weight: 600;
}

.area-info p {
  margin: 0.25rem 0 0 0;
  color: #6b7280;
  font-size: 0.875rem;
}

.upload-zone {
  position: relative;
  border: 2px dashed #d1d5db;
  border-radius: 0.5rem;
  padding: 2rem;
  text-align: center;
  transition: all 0.2s;
  cursor: pointer;
}

.upload-zone:hover {
  border-color: #3b82f6;
  background: #f8fafc;
}

.file-input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.upload-icon {
  font-size: 2rem;
}

.upload-text {
  color: #374151;
  font-weight: 500;
}

.captured-state {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.image-preview {
  position: relative;
}

.preview-image, .result-image {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
}

.remove-image-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 50%;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.75rem;
}

.analysis-status {
  padding: 0.75rem;
  border-radius: 0.5rem;
  text-align: center;
}

.status-analyzing {
  background: #fef3c7;
  color: #d97706;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.status-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid #fbbf24;
  border-top: 2px solid #d97706;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.status-completed {
  background: #dcfce7;
  color: #166534;
}

.summary-details {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
  justify-content: center;
}

.summary-detail {
  background: #f0fdf4;
  color: #14532d;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

.status-error {
  background: #fee2e2;
  color: #dc2626;
}

.status-icon {
  margin-right: 0.25rem;
}

/* 分析結果セクション */
.analyze-header {
  text-align: center;
  margin-bottom: 2rem;
}

.analyze-header h3 {
  margin: 0 0 0.5rem 0;
  color: #374151;
}

.analyze-stats {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.stat {
  background: #f3f4f6;
  color: #374151;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
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
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.result-header h4 {
  margin: 0;
  color: #374151;
  font-weight: 600;
}

.result-content {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 1.5rem;
}

.detected-items {
  background: #f9fafb;
  border-radius: 0.5rem;
  padding: 1rem;
}

.no-items {
  text-align: center;
  color: #6b7280;
  padding: 2rem 1rem;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.item-row {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.75rem;
  transition: all 0.2s;
}

.item-row.ai-generated {
  border-left: 4px solid #10b981;
}

.item-row.manual {
  border-left: 4px solid #f59e0b;
}

.item-row:hover {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.editing-mode {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.edit-input, .edit-select {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.edit-input:focus, .edit-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.display-mode {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.item-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}

.item-name {
  font-weight: 600;
  color: #1f2937;
}

.item-category {
  background: #e5e7eb;
  color: #374151;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.item-quantity {
  background: #dbeafe;
  color: #1e40af;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.confidence {
  background: #dcfce7;
  color: #166534;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.source-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.ai-badge {
  background: #10b981;
  color: white;
}

.manual-badge {
  background: #f59e0b;
  color: white;
}

/* YOLO詳細情報 */
.yolo-details {
  background: #f0f9ff;
  border: 1px solid #e0f2fe;
  border-radius: 0.375rem;
  padding: 0.75rem;
  margin: 0.5rem 0;
  font-size: 0.75rem;
}

.yolo-details > div {
  margin-bottom: 0.5rem;
}

.yolo-details > div:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-weight: 500;
  color: #0c4a6e;
  margin-right: 0.5rem;
}

.detail-text {
  color: #64748b;
}

.item-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  align-self: flex-end;
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

.no-missing {
  text-align: center;
  padding: 3rem 1rem;
  background: white;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.success-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.missing-items {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.missing-count {
  font-size: 1.125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 1rem;
}

.priority-items {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 0.5rem;
}

.priority-items h4 {
  margin: 0 0 0.75rem 0;
  color: #d97706;
  font-size: 1rem;
}

.priority-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.priority-item {
  background: #f59e0b;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.missing-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 0;
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
  width: 100%;
}

.item-checkbox input[type="checkbox"] {
  margin: 0;
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
}

.item-checkbox input[type="checkbox"]:checked + .checkmark {
  background: #10b981;
  border-color: #10b981;
}

.item-checkbox input[type="checkbox"]:checked + .checkmark::after {
  content: '✓';
  color: white;
  font-weight: bold;
  font-size: 0.75rem;
}

/* ボタンスタイル */
.action-buttons {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
  flex-wrap: wrap;
}

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
  min-width: 140px;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-primary:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.btn-secondary {
  background: #6b7280;
  color: white;
}

.btn-secondary:hover {
  background: #4b5563;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  min-width: auto;
}

/* アニメーション */
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* レスポンシブ */
@media (max-width: 768px) {
  .analysis-container {
    padding: 0.5rem;
  }
  
  .camera-areas {
    grid-template-columns: 1fr;
  }
  
  .result-content {
    grid-template-columns: 1fr;
  }
  
  .analyze-stats {
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .action-buttons {
    flex-direction: column;
  }
  
  .btn {
    width: 100%;
  }
  
  .result-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  
  .item-info {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .yolo-details {
    font-size: 0.6875rem;
  }
}
</style> 