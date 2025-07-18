<script setup>
import { ref, computed } from 'vue'
import { imageToBase64 } from '../openai-client.js'

// リアクティブ変数
const activeSection = ref('collect') // 'collect', 'manage', 'train'
const trainingData = ref([]) // 収集したトレーニングデータ
const currentImages = ref([]) // 現在アップロード中の画像
const currentLabels = ref({}) // 現在の画像のラベル
const isUploading = ref(false)
const isTraining = ref(false)

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
      }
    }
  } catch (error) {
    console.error('画像アップロードエラー:', error)
    alert('画像のアップロードに失敗しました')
  } finally {
    isUploading.value = false
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
  }
}

// セクション切り替え
const switchSection = (section) => {
  activeSection.value = section
}

// Fine-Tuning開始
const startTraining = async () => {
  if (stats.value.totalSamples < 10) {
    alert('最低10サンプル以上が必要です')
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
        
        <div v-if="isUploading" class="upload-status">
          <p>📤 アップロード中...</p>
        </div>
      </div>

      <!-- アップロードした画像の表示とラベル付け -->
      <div v-if="currentImages.length > 0" class="labeling-panel">
        <h4>🏷️ 食材ラベル付け</h4>
        
        <div class="images-grid">
          <div v-for="image in currentImages" :key="image.id" class="image-item">
            <div class="image-preview">
              <img :src="image.base64" :alt="image.name" />
              <p class="image-name">{{ image.name }}</p>
            </div>
            
            <div class="labeling-form">
              <h5>この画像の食材:</h5>
              
              <!-- 新しい食材追加フォーム -->
              <div class="add-item-form">
                <input 
                  type="text" 
                  placeholder="食材名"
                  class="item-input"
                  :id="`item-name-${image.id}`"
                >
                <select class="item-select" :id="`item-quantity-${image.id}`">
                  <option value="多い">多い</option>
                  <option value="普通" selected>普通</option>
                  <option value="少ない">少ない</option>
                  <option value="なし">なし</option>
                </select>
                <input 
                  type="text" 
                  placeholder="位置（上段/中段/下段等）"
                  class="item-input"
                  :id="`item-location-${image.id}`"
                >
                <button 
                  @click="addItemLabel(
                    image.id,
                    document.getElementById(`item-name-${image.id}`).value,
                    document.getElementById(`item-quantity-${image.id}`).value,
                    document.getElementById(`item-location-${image.id}`).value
                  )"
                  class="btn btn-secondary"
                >
                  追加
                </button>
              </div>
              
              <!-- 追加済み食材リスト -->
              <div v-if="currentLabels[image.id] && currentLabels[image.id].length > 0" class="labeled-items">
                <div 
                  v-for="item in currentLabels[image.id]" 
                  :key="item.id"
                  class="labeled-item"
                >
                  <span class="item-info">
                    <strong>{{ item.name }}</strong> - {{ item.quantity }} ({{ item.location }})
                  </span>
                  <button 
                    @click="removeItemLabel(image.id, item.id)"
                    class="remove-btn"
                  >
                    ×
                  </button>
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
            <li>最小サンプル数: 10以上 <span :class="stats.totalSamples >= 10 ? 'check-ok' : 'check-ng'">{{ stats.totalSamples >= 10 ? '✅' : '❌' }}</span></li>
            <li>推奨サンプル数: 50以上 <span :class="stats.totalSamples >= 50 ? 'check-ok' : 'check-ng'">{{ stats.totalSamples >= 50 ? '✅' : '❌' }}</span></li>
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
          :disabled="stats.totalSamples < 10 || isTraining"
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
}

.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-top: 1rem;
}

.image-item {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  overflow: hidden;
}

.image-preview {
  position: relative;
}

.image-preview img {
  width: 100%;
  height: 200px;
  object-fit: cover;
}

.image-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 0.5rem;
  margin: 0;
  font-size: 0.75rem;
}

.labeling-form {
  padding: 1rem;
}

.labeling-form h5 {
  margin-bottom: 0.75rem;
  color: #374151;
}

.add-item-form {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto;
  gap: 0.5rem;
  margin-bottom: 1rem;
  align-items: center;
}

.item-input, .item-select {
  padding: 0.5rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.labeled-items {
  max-height: 150px;
  overflow-y: auto;
}

.labeled-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: #f1f5f9;
  border-radius: 0.25rem;
  margin-bottom: 0.5rem;
}

.item-info {
  font-size: 0.875rem;
  color: #374151;
}

.remove-btn {
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 50%;
  width: 1.5rem;
  height: 1.5rem;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.save-panel {
  text-align: center;
  margin-top: 2rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 0.5rem;
}

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
  
  .add-item-form {
    grid-template-columns: 1fr;
  }
  
  .export-actions {
    flex-direction: column;
  }
  
  .sample-header {
    flex-direction: column;
    gap: 0.5rem;
  }
}
</style> 