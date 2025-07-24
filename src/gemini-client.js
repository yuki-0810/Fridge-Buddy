import { GoogleGenerativeAI } from '@google/generative-ai'

// Vercel環境変数から取得
const apiKey = import.meta.env.VITE_GEMINI_API_KEY

if (!apiKey) {
  console.error('Gemini API Key が設定されていません')
  console.error('必要な環境変数: VITE_GEMINI_API_KEY')
}

const genAI = new GoogleGenerativeAI(apiKey)

// 画像をリサイズして圧縮する関数
const resizeAndCompressImage = (file, maxWidth = 1024, maxHeight = 768, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      // アスペクト比を保持しながらリサイズ
      let { width, height } = img
      
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height
          height = maxHeight
        }
      }

      canvas.width = width
      canvas.height = height

      // 画像を描画
      ctx.drawImage(img, 0, 0, width, height)

      // JPEGとして圧縮してBase64に変換
      canvas.toBlob((blob) => {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = reader.result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }, 'image/jpeg', quality)
    }

    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// 画像をbase64に変換する関数（圧縮対応）
export const imageToBase64 = async (file) => {
  try {
    // ファイルサイズが2MB以上の場合は圧縮
    if (file.size > 2 * 1024 * 1024) {
      console.log('大きな画像を圧縮中...', `${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return await resizeAndCompressImage(file, 1024, 768, 0.7)
    } else if (file.size > 1 * 1024 * 1024) {
      console.log('中サイズ画像を軽圧縮中...', `${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return await resizeAndCompressImage(file, 1280, 960, 0.8)
    } else {
      // 小さな画像はそのまま
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = () => {
          const base64 = reader.result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
      })
    }
  } catch (error) {
    // エラーの場合は元の方法でフォールバック
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = error => reject(error)
    })
  }
}

// JSONレスポンスを安全に抽出する関数
const extractJSONFromResponse = (text) => {
  try {
    // まず、マークダウンコードブロックを除去
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const match = text.match(codeBlockRegex);
    
    if (match) {
      // コードブロック内のJSONを使用
      return JSON.parse(match[1].trim());
    } else {
      // 直接JSONとしてパース
      return JSON.parse(text.trim());
    }
  } catch (error) {
    // JSONの開始と終了を探して抽出を試行
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      try {
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        return JSON.parse(jsonStr);
      } catch (parseError) {
        throw new Error(`JSON抽出失敗: ${parseError.message}`);
      }
    } else {
      throw new Error('有効なJSONが見つかりません');
    }
  }
}

// 常備食材の特徴プロンプトを生成
export const generateIngredientPrompt = async (ingredientName) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
    
    const prompt = `
「${ingredientName}」という食材について、冷蔵庫での画像認識精度を向上させるための特徴プロンプトを生成してください。

重要: 回答は必ず以下のJSON形式のみで返し、説明文やマークダウンは使用しないでください。

{
  "prompt": "画像認識用の特徴プロンプト（1-2文）",
  "keywords": ["キーワード1", "キーワード2", "キーワード3"],
  "storage_location": "推奨保存場所",
  "visual_cues": "視覚的な手がかり"
}
`

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    
    try {
      const parsedResult = extractJSONFromResponse(text)
      return {
        success: true,
        result: parsedResult,
        model: "gemini-2.5-flash"
      }
    } catch (parseError) {
      console.error('プロンプト生成レスポンス:', text)
      return {
        success: false,
        error: `レスポンス解析エラー: ${parseError.message}`,
        rawResponse: text,
        model: "gemini-2.5-flash"
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      model: "gemini-2.5-flash"
    }
  }
}

// YOLOベース画像解析（基本版）
export const analyzeFridgeWithYOLO = async (imageBase64, stockList = [], promptMap = {}) => {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.1
      }
    })
    
    // 常備食材のプロンプトを構築
    const ingredientPrompts = stockList.map(item => {
      const itemPrompt = promptMap[item] || {}
      const prompt = itemPrompt.prompt || '一般的な特徴'
      const keywords = itemPrompt.keywords ? itemPrompt.keywords.join(', ') : ''
      return `- ${item}: ${prompt} (${keywords})`
    }).join('\n')

    const prompt = `
YOLOベースの物体検出エキスパートとして、冷蔵庫の食材を分析してください。

常備食材の特徴:
${ingredientPrompts}

重要: 回答は必ず以下のJSON形式のみで返し、説明文やマークダウンは使用しないでください。

{
  "detected_items": [
    {
      "name": "食材名",
      "category": "カテゴリ（野菜/肉類/乳製品/調味料/冷凍食品/その他）",
      "quantity_level": 3,
      "confidence": 85,
      "location": "冷蔵庫内位置",
      "bounding_box": "検出領域の説明",
      "matched_prompt": "使用プロンプト",
      "visual_evidence": "視覚的根拠"
    }
  ],
  "analysis_summary": {
    "total_items": 5,
    "high_confidence_items": 3,
    "stock_items_found": 2,
    "missing_stock_items": ["食材名"],
    "low_quantity_alerts": ["食材名"]
  },
  "recommendations": ["購入推奨アイテム"]
}
`

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: "image/jpeg"
      }
    }

    const result = await model.generateContent([prompt, imagePart])
    const response = await result.response
    const text = response.text()
    
    try {
      const parsedResult = extractJSONFromResponse(text)
      return {
        success: true,
        result: parsedResult,
        model: "gemini-2.5-flash",
        engine: "YOLO-based"
      }
    } catch (parseError) {
      console.error('YOLO分析レスポンス:', text)
      return {
        success: false,
        error: `レスポンス解析エラー: ${parseError.message}`,
        rawResponse: text,
        model: "gemini-2.5-flash"
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      model: "gemini-2.5-flash"
    }
  }
}

// 軽量版解析（Gemini Flash使用）
export const analyzeFridgeLightweight = async (imageBase64, stockList = []) => {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.1
      }
    })
    
    const stockListText = stockList.length > 0 
      ? `特に以下の常備食材を重点的に検出：${stockList.join(', ')}`
      : '一般的な冷蔵庫食材を検出'

    const prompt = `
冷蔵庫画像の軽量解析を実行します。${stockListText}

重要: 回答は必ず以下のJSON形式のみで返してください。

{
  "items": [
    {
      "name": "食材名",
      "quantity": "多い/普通/少ない/なし",
      "confidence": 85
    }
  ],
  "missing_stock": ["見つからなかった常備食材"],
  "buy_suggestions": ["購入推奨"]
}
`

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: "image/jpeg"
      }
    }

    const result = await model.generateContent([prompt, imagePart])
    const response = await result.response
    const text = response.text()
    
    try {
      const parsedResult = extractJSONFromResponse(text)
      return {
        success: true,
        result: parsedResult,
        model: "gemini-2.5-flash"
      }
    } catch (parseError) {
      console.error('軽量解析レスポンス:', text)
      return {
        success: false,
        error: `レスポンス解析エラー: ${parseError.message}`,
        rawResponse: text,
        model: "gemini-2.5-flash"
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      model: "gemini-2.5-flash"
    }
  }
}

// 複数画像の統合解析
export const analyzeMultipleFridgeImages = async (imageDataList, stockList = [], promptMap = {}) => {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.1
      }
    })
    
    const ingredientPrompts = stockList.map(item => {
      const itemPrompt = promptMap[item] || {}
      return `- ${item}: ${itemPrompt.prompt || '一般的な特徴'}`
    }).join('\n')

    const prompt = `
複数の冷蔵庫画像（${imageDataList.length}枚）を統合的に解析してください。

常備食材の特徴：
${ingredientPrompts}

重要: 回答は必ず以下のJSON形式のみで返してください。

{
  "integrated_analysis": {
    "total_areas_scanned": ${imageDataList.length},
    "comprehensive_inventory": [
      {
        "name": "食材名",
        "total_quantity": "全体的な量",
        "locations": ["発見場所のリスト"],
        "confidence": 85,
        "notes": "補足情報"
      }
    ],
    "missing_items": ["見つからなかった常備食材"],
    "low_stock_alerts": ["補充が必要なアイテム"],
    "shopping_priority": ["優先購入リスト"]
  }
}
`

    const contents = [prompt]
    imageDataList.forEach((imageData, index) => {
      contents.push({
        inlineData: {
          data: imageData,
          mimeType: "image/jpeg"
        }
      })
    })

    const result = await model.generateContent(contents)
    const response = await result.response
    const text = response.text()
    
    try {
      const parsedResult = extractJSONFromResponse(text)
      return {
        success: true,
        result: parsedResult,
        model: "gemini-2.5-flash",
        images_analyzed: imageDataList.length
      }
    } catch (parseError) {
      console.error('統合解析レスポンス:', text)
      return {
        success: false,
        error: `レスポンス解析エラー: ${parseError.message}`,
        rawResponse: text,
        model: "gemini-2.5-flash"
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      model: "gemini-2.5-flash"
    }
  }
} 