<script setup>
import { ref } from 'vue'
import { 
  imageToBase64, 
  analyzeFridgeBasic, 
  analyzeFridgeDetailed, 
  analyzeFridgeLightweight 
} from '../openai-client.js'

// リアクティブ変数
const selectedFile = ref(null)
const imagePreview = ref(null)
const stockList = ref(['牛乳', '卵', '玉ねぎ', 'にんじん', 'じゃがいも', '納豆'])
const customStock = ref('')
const isAnalyzing = ref(false)

// 解析結果
const basicResult = ref(null)
const detailedResult = ref(null)
const lightweightResult = ref(null)
const analysisTime = ref({})

// ファイル選択
const handleFileChange = (event) => {
  const file = event.target.files[0]
  if (file && file.type.startsWith('image/')) {
    selectedFile.value = file
    
    // プレビュー画像作成
    const reader = new FileReader()
    reader.onload = (e) => {
      imagePreview.value = e.target.result
    }
    reader.readAsDataURL(file)
  }
}

// 常備食材リスト管理
const addStock = () => {
  if (customStock.value.trim()) {
    stockList.value.push(customStock.value.trim())
    customStock.value = ''
  }
}

const removeStock = (index) => {
  stockList.value.splice(index, 1)
}

// 全モデルで解析実行
const analyzeAllModels = async () => {
  if (!selectedFile.value) {
    alert('画像を選択してください')
    return
  }

  isAnalyzing.value = true
  
  try {
    const imageBase64 = await imageToBase64(selectedFile.value)
    
    // 基本版解析
    const startBasic = Date.now()
    basicResult.value = await analyzeFridgeBasic(imageBase64)
    analysisTime.value.basic = Date.now() - startBasic

    // 詳細版解析
    const startDetailed = Date.now()
    detailedResult.value = await analyzeFridgeDetailed(imageBase64, stockList.value)
    analysisTime.value.detailed = Date.now() - startDetailed

    // 軽量版解析
    const startLightweight = Date.now()
    lightweightResult.value = await analyzeFridgeLightweight(imageBase64)
    analysisTime.value.lightweight = Date.now() - startLightweight

  } catch (error) {
    console.error('解析エラー:', error)
    alert('解析中にエラーが発生しました: ' + error.message)
  } finally {
    isAnalyzing.value = false
  }
}

// 個別モデル解析
const analyzeSingle = async (modelType) => {
  if (!selectedFile.value) {
    alert('画像を選択してください')
    return
  }

  isAnalyzing.value = true
  
  try {
    const imageBase64 = await imageToBase64(selectedFile.value)
    const start = Date.now()
    
    switch (modelType) {
      case 'basic':
        basicResult.value = await analyzeFridgeBasic(imageBase64)
        analysisTime.value.basic = Date.now() - start
        break
      case 'detailed':
        detailedResult.value = await analyzeFridgeDetailed(imageBase64, stockList.value)
        analysisTime.value.detailed = Date.now() - start
        break
      case 'lightweight':
        lightweightResult.value = await analyzeFridgeLightweight(imageBase64)
        analysisTime.value.lightweight = Date.now() - start
        break
    }
  } catch (error) {
    console.error('解析エラー:', error)
    alert('解析中にエラーが発生しました: ' + error.message)
  } finally {
    isAnalyzing.value = false
  }
}

// 結果をJSONパース（エラーハンドリング付き）
const parseResult = (result) => {
  if (!result || !result.success) return null
  
  try {
    const content = result.result
    // JSONの開始を探す
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}') + 1
    
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const jsonStr = content.substring(jsonStart, jsonEnd)
      return JSON.parse(jsonStr)
    }
    return null
  } catch (error) {
    console.error('JSON解析エラー:', error)
    return null
  }
}

// 結果のクリア
const clearResults = () => {
  basicResult.value = null
  detailedResult.value = null
  lightweightResult.value = null
  analysisTime.value = {}
}
</script>

<template>
  <div class="vision-test">
    <h2>🔍 OpenAI Vision 冷蔵庫画像解析テスト</h2>
    
    <div class="test-info">
      <h3>📊 モデル比較テスト</h3>
      <p>3つの異なるアプローチで冷蔵庫画像を解析し、精度とレスポンス時間を比較します：</p>
      <ul>
        <li><strong>基本版:</strong> GPT-4 Vision（基本的な食材検出）</li>
        <li><strong>詳細版:</strong> GPT-4 Vision（常備食材リスト対応・詳細分析）</li>
        <li><strong>軽量版:</strong> GPT-4o（高速・簡潔）</li>
      </ul>
    </div>

    <!-- 画像アップロード -->
    <section class="upload-section">
      <h3>📸 冷蔵庫画像をアップロード</h3>
      <input 
        type="file" 
        accept="image/*" 
        @change="handleFileChange"
        class="file-input"
      >
      
      <div v-if="imagePreview" class="image-preview">
        <img :src="imagePreview" alt="アップロード画像" />
      </div>
    </section>

    <!-- 常備食材リスト -->
    <section class="stock-section">
      <h3>📝 常備食材リスト（詳細版で使用）</h3>
      <div class="stock-input">
        <input 
          v-model="customStock" 
          placeholder="食材名を追加"
          @keyup.enter="addStock"
          class="input"
        >
        <button @click="addStock" class="btn btn-secondary">追加</button>
      </div>
      
      <div class="stock-list">
        <span 
          v-for="(item, index) in stockList" 
          :key="index"
          class="stock-item"
        >
          {{ item }}
          <button @click="removeStock(index)" class="remove-btn">×</button>
        </span>
      </div>
    </section>

    <!-- 解析実行 -->
    <section class="analyze-section">
      <h3>🚀 解析実行</h3>
      <div class="analyze-buttons">
        <button 
          @click="analyzeAllModels" 
          :disabled="!selectedFile || isAnalyzing"
          class="btn btn-primary"
        >
          {{ isAnalyzing ? '解析中...' : '全モデル一括解析' }}
        </button>
        
        <button 
          @click="analyzeSingle('basic')" 
          :disabled="!selectedFile || isAnalyzing"
          class="btn btn-secondary"
        >
          基本版のみ
        </button>
        
        <button 
          @click="analyzeSingle('detailed')" 
          :disabled="!selectedFile || isAnalyzing"
          class="btn btn-secondary"
        >
          詳細版のみ
        </button>
        
        <button 
          @click="analyzeSingle('lightweight')" 
          :disabled="!selectedFile || isAnalyzing"
          class="btn btn-secondary"
        >
          軽量版のみ
        </button>
        
        <button 
          @click="clearResults"
          class="btn btn-danger"
        >
          結果クリア
        </button>
      </div>
    </section>

    <!-- 解析結果 -->
    <section v-if="basicResult || detailedResult || lightweightResult" class="results-section">
      <h3>📊 解析結果</h3>
      
      <!-- 基本版結果 -->
      <div v-if="basicResult" class="result-card">
        <h4>基本版 (GPT-4 Vision) 
          <span v-if="analysisTime.basic" class="time">⏱️ {{ analysisTime.basic }}ms</span>
        </h4>
        
        <div v-if="basicResult.success" class="result-content">
          <pre>{{ parseResult(basicResult) ? JSON.stringify(parseResult(basicResult), null, 2) : basicResult.result }}</pre>
        </div>
        <div v-else class="error-content">
          <p>❌ エラー: {{ basicResult.error }}</p>
        </div>
      </div>

      <!-- 詳細版結果 -->
      <div v-if="detailedResult" class="result-card">
        <h4>詳細版 (GPT-4 Vision + 常備リスト) 
          <span v-if="analysisTime.detailed" class="time">⏱️ {{ analysisTime.detailed }}ms</span>
        </h4>
        
        <div v-if="detailedResult.success" class="result-content">
          <pre>{{ parseResult(detailedResult) ? JSON.stringify(parseResult(detailedResult), null, 2) : detailedResult.result }}</pre>
        </div>
        <div v-else class="error-content">
          <p>❌ エラー: {{ detailedResult.error }}</p>
        </div>
      </div>

      <!-- 軽量版結果 -->
      <div v-if="lightweightResult" class="result-card">
        <h4>軽量版 (GPT-4o) 
          <span v-if="analysisTime.lightweight" class="time">⏱️ {{ analysisTime.lightweight }}ms</span>
        </h4>
        
        <div v-if="lightweightResult.success" class="result-content">
          <pre>{{ parseResult(lightweightResult) ? JSON.stringify(parseResult(lightweightResult), null, 2) : lightweightResult.result }}</pre>
        </div>
        <div v-else class="error-content">
          <p>❌ エラー: {{ lightweightResult.error }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.vision-test {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.test-info {
  background: #f0f9ff;
  border: 1px solid #0ea5e9;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.test-info h3 {
  color: #0369a1;
  margin-bottom: 1rem;
}

.test-info ul {
  margin-left: 1.5rem;
}

.test-info ul li {
  margin-bottom: 0.5rem;
}

.upload-section,
.stock-section,
.analyze-section,
.results-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  background: white;
}

.upload-section h3,
.stock-section h3,
.analyze-section h3,
.results-section h3 {
  color: #2d3748;
  margin-bottom: 1rem;
}

.file-input {
  margin-bottom: 1rem;
  padding: 0.5rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.25rem;
  width: 100%;
}

.image-preview {
  margin-top: 1rem;
}

.image-preview img {
  max-width: 100%;
  max-height: 300px;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
}

.stock-input {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.stock-input .input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.25rem;
}

.stock-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.stock-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: #e2e8f0;
  padding: 0.25rem 0.5rem;
  border-radius: 1rem;
  font-size: 0.875rem;
}

.remove-btn {
  background: #e53e3e;
  color: white;
  border: none;
  border-radius: 50%;
  width: 1.25rem;
  height: 1.25rem;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.analyze-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.result-card {
  margin-bottom: 1.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  overflow: hidden;
}

.result-card h4 {
  background: #f9fafb;
  padding: 1rem;
  margin: 0;
  color: #374151;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.time {
  font-size: 0.875rem;
  color: #6b7280;
  font-weight: normal;
}

.result-content,
.error-content {
  padding: 1rem;
}

.result-content pre {
  background: #f3f4f6;
  padding: 1rem;
  border-radius: 0.25rem;
  overflow-x: auto;
  font-size: 0.875rem;
  white-space: pre-wrap;
}

.error-content p {
  color: #dc2626;
  margin: 0;
}

.btn-danger {
  background-color: #dc2626;
  color: white;
}

.btn-danger:hover {
  background-color: #b91c1c;
}

/* レスポンシブ対応 */
@media (max-width: 768px) {
  .analyze-buttons {
    flex-direction: column;
  }
  
  .analyze-buttons .btn {
    width: 100%;
  }
  
  .stock-input {
    flex-direction: column;
  }
  
  .result-card h4 {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}
</style> 