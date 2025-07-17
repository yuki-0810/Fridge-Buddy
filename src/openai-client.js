import OpenAI from 'openai'

// Vercel環境変数から取得
const apiKey = import.meta.env.VITE_OPENAI_API_KEY

if (!apiKey) {
  console.error('OpenAI API Key が設定されていません')
  console.error('必要な環境変数: VITE_OPENAI_API_KEY')
}

const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true // フロントエンドでの使用を許可
})

// 画像をBase64に変換する関数
export const imageToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result)
    reader.onerror = error => reject(error)
  })
}

// 冷蔵庫画像解析 - 基本版
export const analyzeFridgeBasic = async (imageBase64) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `この冷蔵庫の写真を分析して、以下の形式でJSONを返してください：

{
  "detected_items": [
    {
      "name": "食材名",
      "quantity": "残量（多い/普通/少ない/なし）",
      "confidence": "信頼度（0-100）",
      "location": "冷蔵庫内の位置"
    }
  ],
  "overall_assessment": "全体的な印象"
}`
            },
            {
              type: "image_url",
              image_url: {
                url: imageBase64
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    })

    return {
      success: true,
      result: response.choices[0].message.content,
      model: "gpt-4o"
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      model: "gpt-4o"
    }
  }
}

// 冷蔵庫画像解析 - 詳細版（常備食材リスト対応）
export const analyzeFridgeDetailed = async (imageBase64, stockList = []) => {
  const stockListText = stockList.length > 0 
    ? `特に以下の常備食材に注目してください：${stockList.join(', ')}`
    : '一般的な冷蔵庫食材を検出してください'

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `この冷蔵庫の写真を詳細に分析してください。${stockListText}

以下の形式でJSONを返してください：

{
  "detected_items": [
    {
      "name": "食材名",
      "category": "カテゴリ（野菜/肉類/乳製品/調味料/その他）",
      "quantity_level": "残量レベル（5段階：0=なし, 1=僅少, 2=少ない, 3=普通, 4=多い）",
      "estimated_count": "推定個数・量",
      "confidence": "検出信頼度（0-100）",
      "location": "冷蔵庫内位置（上段/中段/下段/ドアポケット等）",
      "expiry_concern": "賞味期限の心配度（低/中/高）"
    }
  ],
  "shopping_suggestions": [
    "買い足すべき食材"
  ],
  "analysis_notes": "解析時の注意点や制約"
}`
            },
            {
              type: "image_url",
              image_url: {
                url: imageBase64
              }
            }
          ]
        }
      ],
      max_tokens: 1500
    })

    return {
      success: true,
      result: response.choices[0].message.content,
      model: "gpt-4o"
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      model: "gpt-4o"
    }
  }
}

// 冷蔵庫画像解析 - 軽量版（GPT-4o使用）
export const analyzeFridgeLightweight = async (imageBase64) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `冷蔵庫の中の食材を簡潔にリストアップしてください。JSON形式で：

{
  "items": ["食材名1", "食材名2", "..."],
  "notes": "短いコメント"
}`
            },
            {
              type: "image_url",
              image_url: {
                url: imageBase64
              }
            }
          ]
        }
      ],
      max_tokens: 500
    })

    return {
      success: true,
      result: response.choices[0].message.content,
      model: "gpt-4o"
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      model: "gpt-4o"
    }
  }
} 