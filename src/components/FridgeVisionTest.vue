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

// 精度向上オプション
const analysisOptions = ref({
  stockOnlyMode: false, // 常備食材のみ検出
  minConfidence: 70,    // 最小信頼度(%)
  requireRetake: true   // 低信頼度時の再撮影要求
})

// 解析結果
const basicResult = ref(null)
const detailedResult = ref(null)
const lightweightResult = ref(null)
const analysisTime = ref({})
const filteredResults = ref({}) // フィルタ後の結果

// 画像品質チェック
const imageQuality = ref({
  brightness: 'good', // 'good', 'fair', 'poor'
  brightnessText: '良好',
  size: 'good', // 'good', 'fair', 'poor'
  sizeText: '良好'
})

// ファイル選択
const handleFileChange = (event) => {
  const file = event.target.files[0]
  if (file && file.type.startsWith('image/')) {
    selectedFile.value = file
    
    // プレビュー画像作成
    const reader = new FileReader()
    reader.onload = (e) => {
      imagePreview.value = e.target.result
      checkImageQuality(e.target.result)
    }
    reader.readAsDataURL(file)
  }
}

// 画像品質チェック
const checkImageQuality = (imageUrl) => {
  const img = new Image()
  img.src = imageUrl

  img.onload = () => {
    const width = img.width
    const height = img.height

    if (width < 1000 || height < 1000) {
      imageQuality.value.size = 'poor'
      imageQuality.value.sizeText = '低解像度'
    } else {
      imageQuality.value.size = 'good'
      imageQuality.value.sizeText = '良好'
    }

    // 明るさの判定はより複雑なアルゴリズムが必要になります。
    // ここでは簡易的に、画像の平均輝度を計算してみます。
    // 実際のアプリケーションでは、OpenCVやTensorFlowなどを使用することを推奨します。
    // ここでは、画像の平均輝度を計算してみます。
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, width, height)

    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    let totalBrightness = 0
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3
    }
    const averageBrightness = totalBrightness / (width * height)

    if (averageBrightness < 100) { // 例: 平均輝度が低い場合
      imageQuality.value.brightness = 'poor'
      imageQuality.value.brightnessText = '暗い'
    } else {
      imageQuality.value.brightness = 'good'
      imageQuality.value.brightnessText = '良好'
    }
  }

  img.onerror = () => {
    imageQuality.value.brightness = 'poor'
    imageQuality.value.brightnessText = 'エラー'
    imageQuality.value.size = 'poor'
    imageQuality.value.sizeText = 'エラー'
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

// 信頼度フィルタリング
const filterByConfidence = (result, minConfidence) => {
  if (!result || !result.success) return result
  
  try {
    const parsed = parseResult(result)
    if (!parsed) return result
    
    let filteredItems = []
    let lowConfidenceCount = 0
    
    if (parsed.detected_items && Array.isArray(parsed.detected_items)) {
      parsed.detected_items.forEach(item => {
        const confidence = parseInt(item.confidence) || 0
        if (confidence >= minConfidence) {
          filteredItems.push(item)
        } else {
          lowConfidenceCount++
        }
      })
    }
    
    return {
      ...result,
      filtered: true,
      filteredData: {
        ...parsed,
        detected_items: filteredItems,
        filtering_summary: {
          total_detected: (parsed.detected_items || []).length,
          high_confidence: filteredItems.length,
          low_confidence: lowConfidenceCount,
          min_confidence_threshold: minConfidence
        }
      }
    }
  } catch (error) {
    console.error('フィルタリングエラー:', error)
    return result
  }
}

// 常備食材限定フィルタリング
const filterByStockList = (result, stockList) => {
  if (!result || !result.success || !stockList.length) return result
  
  try {
    const parsed = result.filtered ? result.filteredData : parseResult(result)
    if (!parsed) return result
    
    const stockItemsLower = stockList.map(item => item.toLowerCase())
    let matchedItems = []
    let unmatchedItems = []
    
    if (parsed.detected_items && Array.isArray(parsed.detected_items)) {
      parsed.detected_items.forEach(item => {
        const itemNameLower = item.name.toLowerCase()
        const isMatch = stockItemsLower.some(stock => 
          itemNameLower.includes(stock) || stock.includes(itemNameLower)
        )
        
        if (isMatch) {
          matchedItems.push(item)
        } else {
          unmatchedItems.push(item)
        }
      })
    }
    
    return {
      ...result,
      stockFiltered: true,
      stockFilteredData: {
        ...parsed,
        detected_items: matchedItems,
        stock_filtering_summary: {
          target_stock_items: stockList.length,
          matched_items: matchedItems.length,
          unmatched_items: unmatchedItems.length,
          unmatched_list: unmatchedItems.map(item => item.name)
        }
      }
    }
  } catch (error) {
    console.error('常備食材フィルタリングエラー:', error)
    return result
  }
}

// 結果の後処理
const processResults = () => {
  let needRetakeAlert = false
  const alertMessages = []

  if (basicResult.value) {
    let processed = basicResult.value
    if (analysisOptions.value.minConfidence > 0) {
      processed = filterByConfidence(processed, analysisOptions.value.minConfidence)
      if (processed.filteredData && processed.filteredData.filtering_summary.low_confidence > 0) {
        needRetakeAlert = true
        alertMessages.push(`基本版: ${processed.filteredData.filtering_summary.low_confidence}件の低信頼度項目`)
      }
    }
    if (analysisOptions.value.stockOnlyMode) {
      processed = filterByStockList(processed, stockList.value)
    }
    filteredResults.value.basic = processed
  }
  
  if (detailedResult.value) {
    let processed = detailedResult.value
    if (analysisOptions.value.minConfidence > 0) {
      processed = filterByConfidence(processed, analysisOptions.value.minConfidence)
      if (processed.filteredData && processed.filteredData.filtering_summary.low_confidence > 0) {
        needRetakeAlert = true
        alertMessages.push(`詳細版: ${processed.filteredData.filtering_summary.low_confidence}件の低信頼度項目`)
      }
    }
    if (analysisOptions.value.stockOnlyMode) {
      processed = filterByStockList(processed, stockList.value)
    }
    filteredResults.value.detailed = processed
  }
  
  if (lightweightResult.value) {
    let processed = lightweightResult.value
    // 軽量版は簡単な構造なので、シンプルなフィルタリング
    if (analysisOptions.value.stockOnlyMode && lightweightResult.value.success) {
      try {
        const parsed = parseResult(lightweightResult.value)
        if (parsed && parsed.items) {
          const stockItemsLower = stockList.value.map(item => item.toLowerCase())
          const filteredItems = parsed.items.filter(item => 
            stockItemsLower.some(stock => 
              item.toLowerCase().includes(stock) || stock.includes(item.toLowerCase())
            )
          )
          processed = {
            ...lightweightResult.value,
            stockFiltered: true,
            stockFilteredData: {
              ...parsed,
              items: filteredItems,
              original_count: parsed.items.length,
              filtered_count: filteredItems.length
            }
          }
        }
      } catch (error) {
        console.error('軽量版フィルタリングエラー:', error)
      }
    }
    filteredResults.value.lightweight = processed
  }

  // 再撮影アラート
  if (needRetakeAlert && analysisOptions.value.requireRetake) {
    showRetakeAlert(alertMessages)
  }
}

// 再撮影アラート表示
const showRetakeAlert = (messages) => {
  const alertText = `
📸 画像の撮り直しをお勧めします

検出された問題:
${messages.map(msg => `• ${msg}`).join('\n')}

より良い結果を得るために:
• 十分な明るさで撮影してください
• カメラのピントを食材に合わせてください  
• 食材が重ならないよう配置してください
• 高解像度で撮影してください

撮り直しますか？
  `
  
  if (confirm(alertText)) {
    // ファイル入力をクリックして再撮影を促す
    const fileInput = document.querySelector('.file-input')
    if (fileInput) {
      fileInput.click()
    }
  }
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
    
    // 結果の後処理
    processResults()

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
    
    // 結果の後処理
    processResults()
    
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

// 表示用データの取得
const getDisplayData = (resultKey) => {
  const filtered = filteredResults.value[resultKey]
  if (filtered && (filtered.stockFiltered || filtered.filtered)) {
    return filtered.stockFilteredData || filtered.filteredData || parseResult(filtered)
  }
  
  const original = {
    basic: basicResult.value,
    detailed: detailedResult.value,
    lightweight: lightweightResult.value
  }[resultKey]
  
  return parseResult(original)
}

// 結果のクリア
const clearResults = () => {
  basicResult.value = null
  detailedResult.value = null
  lightweightResult.value = null
  analysisTime.value = {}
  filteredResults.value = {}
}

const appTitle = ref('Fridge Buddy')
const subtitle = ref('あなたの冷蔵庫を賢く管理')
const activeTab = ref('home') // 'home', 'test', 'vision', 'training'

const switchTab = (tab) => {
  activeTab.value = tab
}
</script>

<template>
  <div class="vision-test">
    <h2>🔍 OpenAI Vision 冷蔵庫画像解析テスト</h2>
    
    <!-- タブナビゲーション -->
    <nav class="tab-nav">
      <button 
        @click="switchTab('home')" 
        :class="['tab-btn', { active: activeTab === 'home' }]"
      >
        ホーム
      </button>
      <button 
        @click="switchTab('test')" 
        :class="['tab-btn', { active: activeTab === 'test' }]"
      >
        Supabaseテスト
      </button>
      <button 
        @click="switchTab('vision')" 
        :class="['tab-btn', { active: activeTab === 'vision' }]"
      >
        Vision AIテスト
      </button>
      <button 
        @click="switchTab('training')" 
        :class="['tab-btn', { active: activeTab === 'training' }]"
      >
        モデル学習
      </button>
    </nav>

    <div v-if="activeTab === 'home'" class="home-content">
      <h3>{{ appTitle }}</h3>
      <p>{{ subtitle }}</p>
      <p>このアプリケーションは、OpenAI Vision APIを使用して冷蔵庫内の食材を検出し、その結果をJSON形式で出力します。</p>
      <p>テストページでは、異なるモデル（基本版、詳細版、軽量版）を比較し、精度とレスポンス時間を確認できます。</p>
      <p>また、Fine-Tuning用のデータ収集タブも用意しており、ユーザーが自分の冷蔵庫の画像とラベルをアップロードできます。</p>
    </div>

    <div v-if="activeTab === 'test'" class="test-info">
      <h3>📊 モデル比較テスト</h3>
      <p>3つの異なるアプローチで冷蔵庫画像を解析し、精度とレスポンス時間を比較します：</p>
      <ul>
        <li><strong>基本版:</strong> GPT-4o（基本的な食材検出）</li>
        <li><strong>詳細版:</strong> GPT-4o（常備食材リスト対応・詳細分析）</li>
        <li><strong>軽量版:</strong> GPT-4o（高速・簡潔）</li>
      </ul>
    </div>

    <!-- 画像アップロード -->
    <section v-if="activeTab === 'vision'" class="upload-section">
      <h3>🖼️ 冷蔵庫画像をアップロード</h3>
      
      <!-- 撮影ガイダンス -->
      <div class="photo-guidance">
        <h4>📋 高精度解析のための撮影ガイド</h4>
        <div class="guidance-grid">
          <div class="guidance-item">
            <span class="guidance-icon">💡</span>
            <div>
              <strong>明るさ</strong><br>
              十分な照明で、食材が鮮明に見える環境で撮影
            </div>
          </div>
          <div class="guidance-item">
            <span class="guidance-icon">📐</span>
            <div>
              <strong>角度</strong><br>
              冷蔵庫の正面から、食材が重ならないように撮影
            </div>
          </div>
          <div class="guidance-item">
            <span class="guidance-icon">🎯</span>
            <div>
              <strong>焦点</strong><br>
              ピントを合わせ、ブレのない鮮明な画像
            </div>
          </div>
          <div class="guidance-item">
            <span class="guidance-icon">📦</span>
            <div>
              <strong>整理</strong><br>
              可能であれば食材を見やすく配置
            </div>
          </div>
        </div>
      </div>
      
      <input 
        type="file" 
        accept="image/*" 
        @change="handleFileChange"
        class="file-input"
      >
      
      <div v-if="imagePreview" class="image-preview">
        <img :src="imagePreview" alt="アップロード画像" />
        <div class="image-quality-check">
          <h5>📊 画像品質チェック</h5>
          <div class="quality-indicators">
            <div class="quality-item">
              <span class="indicator" :class="imageQuality.brightness">●</span>
              明るさ: {{ imageQuality.brightnessText }}
            </div>
            <div class="quality-item">
              <span class="indicator" :class="imageQuality.size">●</span>
              解像度: {{ imageQuality.sizeText }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 常備食材リスト -->
    <section v-if="activeTab === 'vision'" class="stock-section">
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
    <section v-if="activeTab === 'vision'" class="analyze-section">
      <h3>🚀 解析実行</h3>
      
      <!-- 精度向上オプション -->
      <div class="accuracy-options">
        <h4>⚙️ 精度向上オプション</h4>
        <div class="options-grid">
          <div class="option-item">
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                v-model="analysisOptions.stockOnlyMode"
                @change="processResults"
              >
              <span class="checkmark"></span>
              常備食材のみ検出
            </label>
            <p class="option-desc">登録した常備食材リストの項目のみを表示</p>
          </div>
          
          <div class="option-item">
            <label class="range-label">
              最小信頼度: {{ analysisOptions.minConfidence }}%
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="5"
                v-model="analysisOptions.minConfidence"
                @input="processResults"
                class="confidence-slider"
              >
            </label>
            <p class="option-desc">この値未満の信頼度の結果を除外</p>
          </div>
          
          <div class="option-item">
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                v-model="analysisOptions.requireRetake"
              >
              <span class="checkmark"></span>
              低信頼度時の再撮影要求
            </label>
            <p class="option-desc">信頼度が低い場合、撮り直しを促す</p>
          </div>
        </div>
      </div>
      
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
    <section v-if="activeTab === 'vision'" v-if="basicResult || detailedResult || lightweightResult" class="results-section">
      <h3>📊 解析結果</h3>
      
      <!-- 基本版結果 -->
      <div v-if="basicResult" class="result-card">
        <h4>基本版 (GPT-4o) 
          <span v-if="analysisTime.basic" class="time">⏱️ {{ analysisTime.basic }}ms</span>
        </h4>
        
        <div v-if="basicResult.success" class="result-content">
          <!-- フィルタリング情報 -->
          <div v-if="filteredResults.basic && (filteredResults.basic.filtered || filteredResults.basic.stockFiltered)" class="filter-info">
            <div v-if="filteredResults.basic.filtered" class="filter-summary">
              🔍 信頼度フィルタ: {{ filteredResults.basic.filteredData.filtering_summary.high_confidence }}件表示 
              ({{ filteredResults.basic.filteredData.filtering_summary.low_confidence }}件除外)
            </div>
            <div v-if="filteredResults.basic.stockFiltered" class="filter-summary">
              📝 常備食材フィルタ: {{ filteredResults.basic.stockFilteredData.stock_filtering_summary.matched_items }}件一致
            </div>
          </div>
          
          <pre>{{ getDisplayData('basic') ? JSON.stringify(getDisplayData('basic'), null, 2) : basicResult.result }}</pre>
        </div>
        <div v-else class="error-content">
          <p>❌ エラー: {{ basicResult.error }}</p>
        </div>
      </div>

      <!-- 詳細版結果 -->
      <div v-if="detailedResult" class="result-card">
        <h4>詳細版 (GPT-4o + 常備リスト) 
          <span v-if="analysisTime.detailed" class="time">⏱️ {{ analysisTime.detailed }}ms</span>
        </h4>
        
        <div v-if="detailedResult.success" class="result-content">
          <!-- フィルタリング情報 -->
          <div v-if="filteredResults.detailed && (filteredResults.detailed.filtered || filteredResults.detailed.stockFiltered)" class="filter-info">
            <div v-if="filteredResults.detailed.filtered" class="filter-summary">
              🔍 信頼度フィルタ: {{ filteredResults.detailed.filteredData.filtering_summary.high_confidence }}件表示 
              ({{ filteredResults.detailed.filteredData.filtering_summary.low_confidence }}件除外)
            </div>
            <div v-if="filteredResults.detailed.stockFiltered" class="filter-summary">
              📝 常備食材フィルタ: {{ filteredResults.detailed.stockFilteredData.stock_filtering_summary.matched_items }}件一致
            </div>
          </div>
          
          <pre>{{ getDisplayData('detailed') ? JSON.stringify(getDisplayData('detailed'), null, 2) : detailedResult.result }}</pre>
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
          <!-- フィルタリング情報 -->
          <div v-if="filteredResults.lightweight && filteredResults.lightweight.stockFiltered" class="filter-info">
            <div class="filter-summary">
              📝 常備食材フィルタ: {{ filteredResults.lightweight.stockFilteredData.filtered_count }}件一致 
              (元: {{ filteredResults.lightweight.stockFilteredData.original_count }}件)
            </div>
          </div>
          
          <pre>{{ getDisplayData('lightweight') ? JSON.stringify(getDisplayData('lightweight'), null, 2) : lightweightResult.result }}</pre>
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
  position: relative;
}

.image-preview img {
  max-width: 100%;
  max-height: 300px;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
}

/* 撮影ガイダンス */
.photo-guidance {
  background: #f0f9ff;
  border: 1px solid #0ea5e9;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.photo-guidance h4 {
  color: #0369a1;
  margin-bottom: 1rem;
}

.guidance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.guidance-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  background: white;
  border-radius: 0.25rem;
  border: 1px solid #e0f2fe;
}

.guidance-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.guidance-item strong {
  color: #0369a1;
  display: block;
  margin-bottom: 0.25rem;
}

.guidance-item div {
  font-size: 0.875rem;
  color: #374151;
  line-height: 1.4;
}

.image-quality-check {
  position: absolute;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  margin: 0.5rem;
  font-size: 0.875rem;
  z-index: 10;
}

.image-quality-check h5 {
  margin-top: 0;
  margin-bottom: 0.5rem;
  color: #e0e7ff;
}

.quality-indicators {
  display: flex;
  gap: 0.5rem;
}

.quality-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
}

.indicator {
  font-size: 1rem;
}

.indicator.good {
  color: #22c55e;
}

.indicator.fair {
  color: #f59e0b;
}

.indicator.poor {
  color: #ef4444;
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

.accuracy-options {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f9fafb;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
}

.accuracy-options h4 {
  color: #2d3748;
  margin-bottom: 0.75rem;
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.option-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #374151;
}

.checkbox-label input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkmark {
  height: 1.25rem;
  width: 1.25rem;
  background-color: #e2e8f0;
  border: 1px solid #cbd5e0;
  border-radius: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox-label input:checked ~ .checkmark {
  background-color: #0ea5e9;
  border-color: #0ea5e9;
}

.checkmark:after {
  content: "";
  display: none;
  width: 0.5rem;
  height: 1rem;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.checkbox-label input:checked ~ .checkmark:after {
  display: block;
}

.range-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #374151;
}

.confidence-slider {
  width: 100%;
  accent-color: #0ea5e9; /* スライダーの色を変更 */
}

.option-desc {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
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

.filter-info {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: #f0f9eb;
  border: 1px solid #a7f3d0;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #065f46;
}

.filter-summary {
  margin-bottom: 0.5rem;
}

.filter-summary:last-child {
  margin-bottom: 0;
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