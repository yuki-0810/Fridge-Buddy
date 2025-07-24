import { GoogleGenerativeAI } from '@google/generative-ai'

// Vercel環境変数から取得
const apiKey = import.meta.env.VITE_GEMINI_API_KEY

if (!apiKey) {
  console.error('Gemini API Key が設定されていません')
  console.error('必要な環境変数: VITE_GEMINI_API_KEY')
}

const genAI = new GoogleGenerativeAI(apiKey)

// 画像をbase64に変換する関数
export const imageToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      // data:image/jpeg;base64, を除去してbase64部分のみを取得
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = error => reject(error)
  })
}

// 常備食材の特徴プロンプトを生成
export const generateIngredientPrompt = async (ingredientName) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
    
    const prompt = `
「${ingredientName}」という食材について、冷蔵庫での画像認識精度を向上させるための特徴プロンプトを生成してください。

以下の要素を含めて、シンプルで効果的な特徴を日本語で記述してください：
- 外観の特徴（色、形、サイズ）
- 保存場所の傾向（冷蔵室、野菜室、ドアポケットなど）
- パッケージの特徴（袋入り、容器、ラベルなど）
- 見分けるポイント

出力は以下のJSON形式で：
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
      const parsedResult = JSON.parse(text)
      return {
        success: true,
        result: parsedResult,
        model: "gemini-2.5-flash"
      }
    } catch (parseError) {
      return {
        success: false,
        error: "レスポンスのパースに失敗しました",
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
    
    // 常備食材のプロンプトを構築
    const ingredientPrompts = stockList.map(item => {
      const itemPrompt = promptMap[item] || {}
      return `- ${item}: ${itemPrompt.prompt || '一般的な特徴'} (${itemPrompt.keywords ? itemPrompt.keywords.join(', ') : ''})`
    }).join('\n')

    const prompt = `
あなたは冷蔵庫の食材を正確に検出するYOLOベースの物体検出エキスパートです。

以下の常備食材に特に注意して検出してください：
${ingredientPrompts}

この冷蔵庫の画像から、以下の形式でJSONを返してください：

{
  "detected_items": [
    {
      "name": "食材名",
      "category": "カテゴリ（野菜/肉類/乳製品/調味料/冷凍食品/その他）",
      "quantity_level": "残量レベル（0=なし, 1=僅少, 2=少ない, 3=普通, 4=多い）",
      "confidence": "検出信頼度（0-100）",
      "location": "冷蔵庫内位置",
      "bounding_box": "検出領域の説明",
      "matched_prompt": "使用されたプロンプト（該当する場合）",
      "visual_evidence": "視覚的根拠"
    }
  ],
  "analysis_summary": {
    "total_items": "検出総数",
    "high_confidence_items": "高信頼度アイテム数",
    "stock_items_found": "常備食材発見数",
    "missing_stock_items": ["見つからなかった常備食材"],
    "low_quantity_alerts": ["量が少ないアイテム"]
  },
  "recommendations": [
    "購入推奨アイテム"
  ]
}

※正確性を重視し、不明確なものは低い信頼度で報告してください。
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
      const parsedResult = JSON.parse(text)
      return {
        success: true,
        result: parsedResult,
        model: "gemini-2.5-flash",
        engine: "YOLO-based"
      }
    } catch (parseError) {
      return {
        success: false,
        error: "レスポンスのパースに失敗しました",
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
    
    const stockListText = stockList.length > 0 
      ? `特に以下の常備食材を重点的に検出：${stockList.join(', ')}`
      : '一般的な冷蔵庫食材を検出'

    const prompt = `
冷蔵庫画像の軽量解析を行います。${stockListText}

以下のJSON形式で簡潔に：
{
  "items": [
    {
      "name": "食材名",
      "quantity": "多い/普通/少ない/なし",
      "confidence": "信頼度（%）"
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
      const parsedResult = JSON.parse(text)
      return {
        success: true,
        result: parsedResult,
        model: "gemini-2.5-flash"
      }
    } catch (parseError) {
      return {
        success: false,
        error: "レスポンスのパースに失敗しました",
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
    
    const ingredientPrompts = stockList.map(item => {
      const itemPrompt = promptMap[item] || {}
      return `- ${item}: ${itemPrompt.prompt || '一般的な特徴'}`
    }).join('\n')

    const prompt = `
複数の冷蔵庫画像（${imageDataList.length}枚）を統合的に解析してください。

常備食材の特徴：
${ingredientPrompts}

各画像から得られる情報を統合し、以下のJSON形式で総合的な在庫状況を報告：

{
  "integrated_analysis": {
    "total_areas_scanned": ${imageDataList.length},
    "comprehensive_inventory": [
      {
        "name": "食材名",
        "total_quantity": "全体的な量",
        "locations": ["発見場所のリスト"],
        "confidence": "統合信頼度",
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
      const parsedResult = JSON.parse(text)
      return {
        success: true,
        result: parsedResult,
        model: "gemini-2.5-flash",
        images_analyzed: imageDataList.length
      }
    } catch (parseError) {
      return {
        success: false,
        error: "レスポンスのパースに失敗しました",
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