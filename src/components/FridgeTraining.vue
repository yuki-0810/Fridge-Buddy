<script setup>
import { ref, computed } from 'vue'
import { imageToBase64, analyzeFridgeBasic } from '../openai-client.js'

// リアクティブ変数
const activeSection = ref('collect') // 'collect', 'manage', 'train'
const trainingData = ref([]) // 収集したトレーニングデータ
const currentImages = ref([]) // 現在アップロード中の画像
const currentLabels = ref({}) // 現在の画像のラベル
const imageAnalysisStatus = ref({}) // 画像ごとの分析状況 { imageId: 'analyzing' | 'completed' | 'error' }
const isUploading = ref(false)
const isAnalyzing = ref(false) // 全体の分析中フラグ
const isTraining = ref(false)

// 編集中の食材
const editingItem = ref({
  imageId: null,
  itemId: null,
  name: '',
  quantity: '普通'
})

// GPT-4oによる自動食材検出
const analyzeImageWithAI = async (imageBase64) => {
  try {
    console.log('OpenAI Vision API呼び出し開始...')
    const response = await analyzeFridgeBasic(imageBase64)
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
      return result.detected_items || []
    } else {
      console.warn('JSONが見つかりませんでした:', content)
      return []
    }
    
  } catch (error) {
    console.error('AI食材検出エラー詳細:', error)
    throw error // エラーを再スローして上位で処理
  }
}

// 統計情報
const stats = computed(() => {
  const totalImages = trainingData.value.reduce((sum, item) => sum + item.images.length, 0)
  const uniqueItems = new Set(trainingData.value.flatMap(item => item.detected_items.map(d => d.name))).size
  
  return {
    totalSamples: trainingData.value.length,
    totalImages,
    uniqueItems,
    avgImagesPerSample: totalImages > 0 ? (totalImages / trainingData.value.length).toFixed(1) : 0
  }
})

// ファイル選択（複数可）
const handleFilesChange = async (event) => {
  const files = Array.from(event.target.files)
  if (files.length === 0) return

  isUploading.value = true
  currentImages.value = []
  currentLabels.value = {}
  imageAnalysisStatus.value = {} // 画像分析状況をリセット

  try {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const base64 = await imageToBase64(file)
        const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        currentImages.value.push({
          id: imageId,
          file: file,
          base64: base64,
          name: file.name
        })
        
        // 初期ラベルを設定
        currentLabels.value[imageId] = []
        imageAnalysisStatus.value[imageId] = 'analyzing' // 分析中状態に設定
      }
    }
    
    isUploading.value = false
    
    // 各画像を個別に分析
    for (const image of currentImages.value) {
      try {
        console.log(`画像 ${image.name} の分析を開始...`)
        isAnalyzing.value = true
        const detectedItems = await analyzeImageWithAI(image.base64)
        console.log(`画像 ${image.name} の分析結果:`, detectedItems)
        
        // 検出された食材をラベルとして追加
        detectedItems.forEach((item, index) => {
          currentLabels.value[image.id].push({
            id: `ai_item_${image.id}_${index}_${Date.now()}`,
            name: item.name,
            quantity: item.quantity || '普通',
            confidence: item.confidence || 80,
            isAiGenerated: true
          })
        })
        
        imageAnalysisStatus.value[image.id] = 'completed' // 分析完了状態に設定
        console.log(`画像 ${image.name} の分析完了`)
      } catch (error) {
        console.error(`画像 ${image.name} の分析エラー:`, error)
        imageAnalysisStatus.value[image.id] = 'error' // エラー状態に設定
      }
    }
    
    isAnalyzing.value = false
    
  } catch (error) {
    console.error('画像アップロードエラー:', error)
    alert('画像のアップロードに失敗しました')
    isAnalyzing.value = false
  }
}

// 食材ラベル追加
const addItemLabel = (imageId, itemName, quantity, location) => {
  if (!itemName.trim()) return

  if (!currentLabels.value[imageId]) {
    currentLabels.value[imageId] = []
  }

  currentLabels.value[imageId].push({
    name: itemName.trim(),
    quantity: quantity || '普通',
    location: location || '不明',
    confidence: 100, // ユーザーがラベル付けした場合は100%
    id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  })
}

// ラベル削除
const removeItemLabel = (imageId, itemId) => {
  if (currentLabels.value[imageId]) {
    currentLabels.value[imageId] = currentLabels.value[imageId].filter(item => item.id !== itemId)
  }
}

// トレーニングデータとして保存
const saveTrainingData = () => {
  if (currentImages.value.length === 0) {
    alert('画像をアップロードしてください')
    return
  }

  // 少なくとも1つの画像にラベルが付いているかチェック
  const hasLabels = Object.values(currentLabels.value).some(labels => labels.length > 0)
  if (!hasLabels) {
    alert('少なくとも1つの画像に食材ラベルを付けてください')
    return
  }

  const newSample = {
    id: `sample_${Date.now()}`,
    created_at: new Date().toISOString(),
    images: currentImages.value.map(img => ({
      id: img.id,
      name: img.name,
      base64: img.base64
    })),
    detected_items: Object.values(currentLabels.value).flat(),
    notes: ''
  }

  trainingData.value.push(newSample)
  
  // リセット
  currentImages.value = []
  currentLabels.value = {}
  imageAnalysisStatus.value = {} // 画像分析状況をリセット
  
  alert(`トレーニングデータを保存しました（合計: ${trainingData.value.length}サンプル）`)
}

// JSONL形式でエクスポート
const exportJSONL = () => {
  if (trainingData.value.length === 0) {
    alert('エクスポートするデータがありません')
    return
  }

  const jsonlData = trainingData.value.map(sample => {
    // OpenAI Fine-Tuning形式に変換
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "この冷蔵庫の画像を分析して、以下の形式でJSONを返してください：\n{\n  \"detected_items\": [\n    {\n      \"name\": \"食材名\",\n      \"quantity\": \"残量\",\n      \"location\": \"位置\",\n      \"confidence\": \"信頼度\"\n    }\n  ]\n}"
          },
          ...sample.images.map(img => ({
            type: "image_url",
            image_url: {
              url: img.base64
            }
          }))
        ]
      },
      {
        role: "assistant",
        content: JSON.stringify({
          detected_items: sample.detected_items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            location: item.location,
            confidence: item.confidence
          }))
        })
      }
    ]

    return { messages }
  })

  const jsonlContent = jsonlData.map(item => JSON.stringify(item)).join('\n')
  
  // ダウンロード
  const blob = new Blob([jsonlContent], { type: 'application/jsonl' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fridge_training_data_${new Date().getTime()}.jsonl`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// データクリア
const clearAllData = () => {
  if (confirm('すべてのトレーニングデータを削除しますか？この操作は取り消せません。')) {
    trainingData.value = []
    currentImages.value = []
    currentLabels.value = {}
    imageAnalysisStatus.value = {} // 画像分析状況をリセット
  }
}

// セクション切り替え
const switchSection = (section) => {
  activeSection.value = section
}

// Fine-Tuning開始
const startTraining = async () => {
  if (stats.value.totalSamples < 2) {
    alert('最低2サンプル以上が必要です')
    return
  }

  if (!confirm(`${stats.value.totalSamples}サンプルでFine-Tuningを開始しますか？\n\n推定コスト: $${((stats.value.totalImages * 100 * 25) / 1000000).toFixed(2)}\n\n注意: この処理には数時間かかり、料金が発生します。`)) {
    return
  }

  isTraining.value = true

  try {
    // JSONLデータ準備
    const jsonlData = trainingData.value.map(sample => {
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "この冷蔵庫の画像を分析して、以下の形式でJSONを返してください：\n{\n  \"detected_items\": [\n    {\n      \"name\": \"食材名\",\n      \"quantity\": \"残量\",\n      \"location\": \"位置\",\n      \"confidence\": \"信頼度\"\n    }\n  ]\n}"
            },
            ...sample.images.map(img => ({
              type: "image_url",
              image_url: {
                url: img.base64
              }
            }))
          ]
        },
        {
          role: "assistant",
          content: JSON.stringify({
            detected_items: sample.detected_items.map(item => ({
              name: item.name,
              quantity: item.quantity,
              location: item.location,
              confidence: item.confidence
            }))
          })
        }
      ]
      return { messages }
    })

    // 現時点では、JSONLファイルをダウンロードして手動でOpenAI APIを使用するよう促す
    // 将来的にはサーバーサイドでOpenAI Fine-Tuning APIを直接呼び出す
    const jsonlContent = jsonlData.map(item => JSON.stringify(item)).join('\n')
    const blob = new Blob([jsonlContent], { type: 'application/jsonl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fridge_training_data_${new Date().getTime()}.jsonl`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    alert(`トレーニングデータをダウンロードしました。\n\n次のステップ:\n1. ダウンロードしたJSONLファイルをOpenAIにアップロード\n2. Fine-Tuningジョブを作成\n3. 学習完了後のモデルIDを取得\n\n詳細な手順はREADMEを参照してください。`)

  } catch (error) {
    console.error('Fine-Tuning開始エラー:', error)
    alert('Fine-Tuningの開始に失敗しました: ' + error.message)
  } finally {
    isTraining.value = false
  }
}

// 食材編集開始
const startEditingItem = (imageId, item) => {
  editingItem.value = {
    imageId: imageId,
    itemId: item.id,
    name: item.name,
    quantity: item.quantity
  }
}

// 食材編集保存
const saveEditingItem = () => {
  if (!editingItem.value.imageId || !editingItem.value.itemId) return
  
  const labels = currentLabels.value[editingItem.value.imageId]
  const itemIndex = labels.findIndex(item => item.id === editingItem.value.itemId)
  
  if (itemIndex !== -1) {
    labels[itemIndex].name = editingItem.value.name
    labels[itemIndex].quantity = editingItem.value.quantity
  }
  
  cancelEditing()
}

// 編集キャンセル
const cancelEditing = () => {
  editingItem.value = {
    imageId: null,
    itemId: null,
    name: '',
    quantity: '普通'
  }
}

// 手動で食材追加
const addManualItem = (imageId) => {
  if (!currentLabels.value[imageId]) {
    currentLabels.value[imageId] = []
  }

  const newItem = {
    id: `manual_item_${imageId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: '新しい食材',
    quantity: '普通',
    confidence: 100,
    isAiGenerated: false
  }

  currentLabels.value[imageId].push(newItem)
  startEditingItem(imageId, newItem)
}
</script>

<template>
  <div class="training-container">
    <h2>🧠 AI モデル Fine-Tuning</h2>
    
    <!-- セクションナビゲーション -->
    <nav class="section-nav">
      <button 
        @click="switchSection('collect')" 
        :class="['section-btn', { active: activeSection === 'collect' }]"
      >
        📸 データ収集
      </button>
      <button 
        @click="switchSection('manage')" 
        :class="['section-btn', { active: activeSection === 'manage' }]"
      >
        📊 データ管理
      </button>
      <button 
        @click="switchSection('train')" 
        :class="['section-btn', { active: activeSection === 'train' }]"
      >
        🚀 モデル学習
      </button>
    </nav>

    <!-- データ収集セクション -->
    <div v-if="activeSection === 'collect'" class="collect-section">
      <div class="info-panel">
        <h3>📋 Fine-Tuning用データ収集</h3>
        <p>あなたの冷蔵庫に特化したAIモデルを作成するため、常備食材の画像データを収集します。</p>
        <ul>
          <li>食材が鮮明に写った高品質な画像を使用</li>
          <li>様々な角度・照明条件での撮影を推奨</li>
          <li>各画像に正確な食材ラベルを付与</li>
          <li>最低20サンプル以上を推奨（より多いほど精度向上）</li>
        </ul>
      </div>

      <!-- 画像アップロード -->
      <div class="upload-panel">
        <h4>📷 画像アップロード（複数選択可）</h4>
        <input 
          type="file" 
          multiple
          accept="image/*" 
          @change="handleFilesChange"
          class="file-input"
          :disabled="isUploading"
        >
        
        <div v-if="isUploading || isAnalyzing" class="upload-status">
          <p v-if="isUploading">📤 アップロード中...</p>
          <p v-if="isAnalyzing">🤖 AI分析中... GPT-4oが食材を検出しています</p>
        </div>
      </div>

      <!-- アップロードした画像の表示とラベル付け -->
      <div v-if="currentImages.length > 0" class="labeling-panel">
        <h4>🤖 AI検出結果と食材編集</h4>
        <p class="ai-info">
          💡 GPT-4oが自動で食材を検出しました。結果を確認して、必要に応じて編集・追加してください。
        </p>
        
        <div class="images-grid">
          <div v-for="image in currentImages" :key="image.id" class="image-item">
            <!-- 画像表示（縦横比保持） -->
            <div class="image-container">
              <img :src="image.base64" :alt="image.name" class="food-image" />
              <p class="image-name">{{ image.name }}</p>
            </div>
            
            <!-- AI検出結果と編集 -->
            <div class="detected-items-section">
              <div class="section-header">
                <h5>🔍 検出された食材</h5>
                <button 
                  @click="addManualItem(image.id)" 
                  class="btn btn-secondary"
                  :disabled="imageAnalysisStatus[image.id] === 'analyzing'"
                >
                  ➕ 手動追加
                </button>
              </div>
              
              <!-- 分析中の表示 -->
              <div v-if="imageAnalysisStatus[image.id] === 'analyzing'" class="analysis-status analyzing">
                <div class="status-icon">🤖</div>
                <div class="status-text">
                  <p><strong>GPT-4oで分析中...</strong></p>
                  <p>食材を検出しています。少々お待ちください。</p>
                </div>
              </div>
              
              <!-- 分析エラーの表示 -->
              <div v-else-if="imageAnalysisStatus[image.id] === 'error'" class="analysis-status error">
                <div class="status-icon">⚠️</div>
                <div class="status-text">
                  <p><strong>分析に失敗しました</strong></p>
                  <p>手動で食材を追加してください。</p>
                  <button @click="addManualItem(image.id)" class="btn btn-primary">➕ 食材を追加</button>
                </div>
              </div>
              
              <!-- 分析完了 - 検出された食材一覧 -->
              <div v-else-if="imageAnalysisStatus[image.id] === 'completed'" class="analysis-completed">
                <div v-if="currentLabels[image.id] && currentLabels[image.id].length > 0" class="items-list">
                  <div 
                    v-for="item in currentLabels[image.id]" 
                    :key="item.id"
                    class="item-row"
                    :class="{ 'ai-generated': item.isAiGenerated, 'manual': !item.isAiGenerated }"
                  >
                    <!-- 編集モード -->
                    <div v-if="editingItem.itemId === item.id" class="editing-mode">
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
                        <button @click="saveEditingItem()" class="btn btn-primary btn-sm">✅ 保存</button>
                        <button @click="cancelEditing()" class="btn btn-secondary btn-sm">❌ キャンセル</button>
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
                        <button @click="startEditingItem(image.id, item)" class="btn btn-secondary btn-sm">✏️ 編集</button>
                        <button @click="removeItemLabel(image.id, item.id)" class="btn btn-danger btn-sm">🗑️ 削除</button>
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- 食材が検出されなかった場合（分析完了後） -->
                <div v-else class="no-items-detected">
                  <div class="status-icon">🔍</div>
                  <div class="status-text">
                    <p><strong>食材が検出されませんでした</strong></p>
                    <p>手動で食材を追加してください。</p>
                    <button @click="addManualItem(image.id)" class="btn btn-primary">➕ 食材を追加</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="save-panel">
          <button 
            @click="saveTrainingData"
            class="btn btn-primary"
          >
            💾 トレーニングデータとして保存
          </button>
        </div>
      </div>
    </div>

    <!-- データ管理セクション -->
    <div v-if="activeSection === 'manage'" class="manage-section">
      <div class="stats-panel">
        <h3>📊 収集済みデータ統計</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-number">{{ stats.totalSamples }}</span>
            <span class="stat-label">サンプル数</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{ stats.totalImages }}</span>
            <span class="stat-label">画像数</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{ stats.uniqueItems }}</span>
            <span class="stat-label">食材種類</span>
          </div>
          <div class="stat-item">
            <span class="stat-number">{{ stats.avgImagesPerSample }}</span>
            <span class="stat-label">平均画像/サンプル</span>
          </div>
        </div>
      </div>

      <div class="export-panel">
        <h4>📁 データエクスポート</h4>
        <p>収集したデータをOpenAI Fine-Tuning用のJSONL形式でエクスポートします。</p>
        
        <div class="export-actions">
          <button 
            @click="exportJSONL"
            :disabled="trainingData.length === 0"
            class="btn btn-primary"
          >
            📥 JSONL形式でダウンロード
          </button>
          <button 
            @click="clearAllData"
            class="btn btn-danger"
          >
            🗑️ 全データクリア
          </button>
        </div>
      </div>

      <!-- データ一覧 -->
      <div v-if="trainingData.length > 0" class="data-list">
        <h4>🗂️ 収集済みサンプル一覧</h4>
        <div class="samples-list">
          <div v-for="sample in trainingData" :key="sample.id" class="sample-item">
            <div class="sample-header">
              <span class="sample-date">{{ new Date(sample.created_at).toLocaleString() }}</span>
              <span class="sample-stats">
                {{ sample.images.length }}枚の画像, {{ sample.detected_items.length }}個の食材
              </span>
            </div>
            <div class="sample-items">
              <span v-for="item in sample.detected_items" :key="item.id" class="item-tag">
                {{ item.name }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- モデル学習セクション -->
    <div v-if="activeSection === 'train'" class="train-section">
      <div class="train-info">
        <h3>🚀 モデル学習</h3>
        <p>収集したデータを使用してGPT-4oのFine-Tuningを実行します。</p>
        
        <div class="requirements">
          <h4>📋 学習要件</h4>
          <ul>
            <li>最小サンプル数: 2以上 <span :class="stats.totalSamples >= 2 ? 'check-ok' : 'check-ng'">{{ stats.totalSamples >= 2 ? '✅' : '❌' }}</span></li>
            <li>推奨サンプル数: 5以上 <span :class="stats.totalSamples >= 5 ? 'check-ok' : 'check-ng'">{{ stats.totalSamples >= 5 ? '✅' : '❌' }}</span></li>
            <li>各サンプルにラベル付き <span class="check-ok">✅</span></li>
          </ul>
        </div>

        <div class="cost-estimation">
          <h4>💰 推定コスト</h4>
          <p>学習用画像: {{ stats.totalImages }}枚 ≈ {{ (stats.totalImages * 100).toLocaleString() }} トークン</p>
          <p>推定学習コスト: ${{ ((stats.totalImages * 100 * 25) / 1000000).toFixed(2) }}</p>
          <p>推定推論コスト: ${{ ((stats.totalImages * 100 * 3.75) / 1000000).toFixed(2) }} / 1000回</p>
        </div>
      </div>

      <div class="train-actions">
        <button 
          :disabled="stats.totalSamples < 2 || isTraining"
          class="btn btn-primary"
          @click="startTraining"
        >
          {{ isTraining ? '🔄 学習中...' : '🚀 Fine-Tuning開始' }}
        </button>
      </div>

      <div v-if="isTraining" class="training-status">
        <p>⏳ モデル学習を開始しています...</p>
        <p>⚠️ 学習には数時間かかる場合があります。ページを閉じても学習は継続されます。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.training-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.section-nav {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 1rem;
}

.section-btn {
  padding: 0.75rem 1.5rem;
  border: 1px solid #e2e8f0;
  background: white;
  color: #374151;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.875rem;
}

.section-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e0;
}

.section-btn.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.info-panel, .upload-panel, .labeling-panel, .stats-panel, .export-panel, .train-info {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.info-panel h3, .stats-panel h3, .train-info h3 {
  color: #1f2937;
  margin-bottom: 1rem;
}

.info-panel ul {
  margin-left: 1.5rem;
  color: #374151;
}

.file-input {
  width: 100%;
  padding: 0.75rem;
  border: 2px dashed #cbd5e0;
  border-radius: 0.5rem;
  background: #f8fafc;
  cursor: pointer;
}

.file-input:hover {
  border-color: #94a3b8;
}

.upload-status {
  text-align: center;
  color: #6b7280;
  margin-top: 1rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
}

.ai-info {
  background: #dbeafe;
  border: 1px solid #93c5fd;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1.5rem;
  color: #1e40af;
  font-size: 0.875rem;
}

.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  margin-top: 1rem;
}

.image-item {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  overflow: hidden;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 画像表示（縦横比保持） */
.image-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f8fafc;
  padding: 1rem;
}

.food-image {
  max-width: 100%;
  max-height: 300px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 0.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.image-name {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #374151;
  text-align: center;
  word-break: break-all;
}

/* AI検出結果セクション */
.detected-items-section {
  padding: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.section-header h5 {
  margin: 0;
  color: #374151;
  font-size: 1rem;
}

/* 分析中の表示 */
.analysis-status.analyzing {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem;
  background: #f0fdf4;
  border: 1px solid #d1fae5;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.analysis-status.analyzing .status-icon {
  font-size: 3rem;
  color: #10b981;
  margin-bottom: 0.5rem;
}

.analysis-status.analyzing .status-text {
  text-align: center;
  color: #065f46;
}

.analysis-status.analyzing .status-text p {
  margin-bottom: 0.25rem;
}

/* 分析エラーの表示 */
.analysis-status.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.analysis-status.error .status-icon {
  font-size: 3rem;
  color: #f59e0b;
  margin-bottom: 0.5rem;
}

.analysis-status.error .status-text {
  text-align: center;
  color: #92400e;
}

.analysis-status.error .status-text p {
  margin-bottom: 0.25rem;
}

.analysis-status.error .status-text button {
  margin-top: 1rem;
}

/* 分析完了 - 検出された食材一覧 */
.analysis-completed {
  padding: 1.5rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.analysis-completed .items-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.analysis-completed .item-row {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1rem;
  transition: all 0.2s ease;
}

.analysis-completed .item-row.ai-generated {
  border-left: 4px solid #10b981;
  background: #f0fdf4;
}

.analysis-completed .item-row.manual {
  border-left: 4px solid #f59e0b;
  background: #fffbeb;
}

.analysis-completed .item-row:hover {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 表示モード */
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
  flex-direction: column;
  gap: 1rem;
}

.edit-input, .edit-select {
  padding: 0.5rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  background: white;
}

.edit-input:focus, .edit-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

/* 食材が検出されなかった場合（分析完了後） */
.no-items-detected {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 0.5rem;
  border: 2px dashed #d1d5db;
}

.no-items-detected .status-icon {
  font-size: 3rem;
  color: #9ca3af;
  margin-bottom: 0.5rem;
}

.no-items-detected .status-text {
  text-align: center;
  color: #4b5563;
}

.no-items-detected .status-text p {
  margin-bottom: 0.25rem;
}

.no-items-detected .status-text button {
  margin-top: 1rem;
}

/* ボタンスタイル */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
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

/* 保存パネル */
.save-panel {
  text-align: center;
  margin-top: 2rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 0.5rem;
}

/* 統計グリッド */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.stat-item {
  text-align: center;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 0.5rem;
}

.stat-number {
  display: block;
  font-size: 2rem;
  font-weight: bold;
  color: #3b82f6;
}

.stat-label {
  display: block;
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.export-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.samples-list {
  max-height: 400px;
  overflow-y: auto;
}

.sample-item {
  padding: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.sample-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.sample-date {
  font-size: 0.875rem;
  color: #6b7280;
}

.sample-stats {
  font-size: 0.875rem;
  color: #374151;
}

.sample-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.item-tag {
  background: #dbeafe;
  color: #1e40af;
  padding: 0.25rem 0.5rem;
  border-radius: 1rem;
  font-size: 0.75rem;
}

.requirements ul {
  margin-left: 1.5rem;
}

.check-ok {
  color: #22c55e;
}

.check-ng {
  color: #ef4444;
}

.cost-estimation {
  background: #fef3c7;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-top: 1rem;
}

.cost-estimation h4 {
  color: #92400e;
  margin-bottom: 0.5rem;
}

.cost-estimation p {
  color: #92400e;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}

.train-actions {
  text-align: center;
  margin-top: 2rem;
}

.training-status {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-top: 1rem;
}

.training-status p {
  color: #1e40af;
  margin-bottom: 0.5rem;
}

/* レスポンシブ対応 */
@media (max-width: 768px) {
  .section-nav {
    flex-direction: column;
  }
  
  .images-grid {
    grid-template-columns: 1fr;
  }
  
  .display-mode {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .export-actions {
    flex-direction: column;
  }
  
  .sample-header {
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .edit-actions {
    justify-content: flex-start;
  }
}
</style> 