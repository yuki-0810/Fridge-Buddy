<script setup>
import { ref } from 'vue'
import { supabase } from '../supabase.js'

// フォーム状態
const isLogin = ref(true) // true: ログイン, false: 新規登録
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

// フォーム切り替え
const toggleMode = () => {
  isLogin.value = !isLogin.value
  errorMessage.value = ''
  email.value = ''
  password.value = ''
}

// ログイン処理
const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = 'メールアドレスとパスワードを入力してください'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })

    if (error) {
      throw error
    }

    // ログイン成功時は自動でApp.vueの認証状態が更新される
  } catch (error) {
    console.error('ログインエラー:', error)
    errorMessage.value = 'ログインに失敗しました: ' + error.message
  } finally {
    loading.value = false
  }
}

// 新規登録処理
const handleSignUp = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = 'メールアドレスとパスワードを入力してください'
    return
  }

  if (password.value.length < 6) {
    errorMessage.value = 'パスワードは6文字以上で入力してください'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
    })

    if (error) {
      throw error
    }

    // 登録成功時のメッセージ
    if (data.user && !data.session) {
      errorMessage.value = '確認メールを送信しました。メールを確認してアカウントを有効化してください。'
    }
  } catch (error) {
    console.error('登録エラー:', error)
    errorMessage.value = '登録に失敗しました: ' + error.message
  } finally {
    loading.value = false
  }
}

// フォーム送信
const handleSubmit = () => {
  if (isLogin.value) {
    handleLogin()
  } else {
    handleSignUp()
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <!-- ヘッダー -->
      <div class="login-header">
        <h1 class="app-title">🧊 Fridge Buddy</h1>
        <p class="app-subtitle">あなたの冷蔵庫を賢く管理</p>
      </div>

      <!-- フォーム -->
      <form @submit.prevent="handleSubmit" class="login-form">
        <h2 class="form-title">{{ isLogin ? 'ログイン' : '新規登録' }}</h2>
        
        <!-- エラーメッセージ -->
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>

        <!-- メールアドレス -->
        <div class="form-group">
          <label for="email" class="form-label">メールアドレス</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            :disabled="loading"
            class="form-input"
            placeholder="example@email.com"
          />
        </div>

        <!-- パスワード -->
        <div class="form-group">
          <label for="password" class="form-label">パスワード</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            :disabled="loading"
            class="form-input"
            :placeholder="isLogin ? 'パスワード' : '6文字以上のパスワード'"
          />
        </div>

        <!-- 送信ボタン -->
        <button
          type="submit"
          :disabled="loading"
          class="submit-btn"
        >
          <span v-if="loading">処理中...</span>
          <span v-else>{{ isLogin ? 'ログイン' : '新規登録' }}</span>
        </button>
      </form>

      <!-- モード切り替え -->
      <div class="toggle-section">
        <p class="toggle-text">
          {{ isLogin ? 'アカウントをお持ちでない方' : '既にアカウントをお持ちの方' }}
        </p>
        <button @click="toggleMode" type="button" class="toggle-btn">
          {{ isLogin ? '新規登録はこちら' : 'ログインはこちら' }}
        </button>
      </div>

      <!-- 機能説明 -->
      <div class="features">
        <h3>主な機能</h3>
        <ul>
          <li>📋 常備食材の管理</li>
          <li>📸 冷蔵庫の画像分析</li>
          <li>🛒 自動買い物リスト生成</li>
          <li>🤖 AI による食材検出</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1rem;
}

.login-card {
  background: white;
  border-radius: 1rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  width: 100%;
  max-width: 400px;
}

.login-header {
  background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
  color: white;
  padding: 2rem 1.5rem;
  text-align: center;
}

.app-title {
  margin: 0;
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.app-subtitle {
  margin: 0;
  font-size: 1rem;
  opacity: 0.9;
}

.login-form {
  padding: 1.5rem;
}

.form-title {
  margin: 0 0 1.5rem 0;
  font-size: 1.5rem;
  color: #1f2937;
  text-align: center;
}

.error-message {
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #374151;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input:disabled {
  background: #f9fafb;
  color: #6b7280;
}

.submit-btn {
  width: 100%;
  padding: 0.75rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-top: 0.5rem;
}

.submit-btn:hover:not(:disabled) {
  background: #2563eb;
}

.submit-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.toggle-section {
  padding: 1rem 1.5rem;
  background: #f9fafb;
  text-align: center;
  border-top: 1px solid #e5e7eb;
}

.toggle-text {
  margin: 0 0 0.5rem 0;
  color: #6b7280;
  font-size: 0.875rem;
}

.toggle-btn {
  background: none;
  border: none;
  color: #3b82f6;
  font-weight: 500;
  cursor: pointer;
  text-decoration: underline;
}

.toggle-btn:hover {
  color: #2563eb;
}

.features {
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #e5e7eb;
}

.features h3 {
  margin: 0 0 0.75rem 0;
  color: #374151;
  font-size: 1rem;
}

.features ul {
  margin: 0;
  padding-left: 1.5rem;
  color: #6b7280;
}

.features li {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}

/* レスポンシブ */
@media (max-width: 480px) {
  .login-container {
    padding: 0.5rem;
  }
  
  .login-header {
    padding: 1.5rem 1rem;
  }
  
  .app-title {
    font-size: 1.75rem;
  }
  
  .login-form {
    padding: 1rem;
  }
}
</style> 