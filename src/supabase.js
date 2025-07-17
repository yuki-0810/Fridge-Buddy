import { createClient } from '@supabase/supabase-js'

// Vercel環境変数から取得
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase環境変数が設定されていません')
  console.error('必要な環境変数: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 接続テスト関数
export const testConnection = async () => {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    
    return { 
      success: true, 
      message: 'Supabase接続成功',
      session: data.session 
    }
  } catch (error) {
    return { 
      success: false, 
      message: `接続エラー: ${error.message}` 
    }
  }
} 