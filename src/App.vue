<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from './supabase.js'
import LoginForm from './components/LoginForm.vue'
import MainInventory from './components/MainInventory.vue'
import FridgeAnalysis from './components/FridgeAnalysis.vue'
import ShoppingList from './components/ShoppingList.vue'

// アプリ状態
const user = ref(null)
const loading = ref(true)
const activeView = ref('inventory') // 'inventory', 'analysis', 'shopping'

// 認証状態チェック
onMounted(async () => {
  // 現在のセッションを取得
  const { data: { session } } = await supabase.auth.getSession()
  user.value = session?.user ?? null
  
  // 認証状態の変更を監視
  supabase.auth.onAuthStateChange((event, session) => {
    user.value = session?.user ?? null
  })
  
  loading.value = false
})

// ログアウト機能
const handleLogout = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('ログアウトエラー:', error.message)
  } else {
    activeView.value = 'inventory' // ログアウト後はメイン画面に戻る
  }
}

// ナビゲーション
const switchView = (view) => {
  activeView.value = view
}
</script>

<template>
  <div id="app">
    <!-- ローディング中 -->
    <div v-if="loading" class="loading-screen">
      <div class="loading-spinner"></div>
      <p>読み込み中...</p>
    </div>
    
    <!-- 未ログイン時：ログイン画面 -->
    <LoginForm v-else-if="!user" />
    
    <!-- ログイン済み：メインアプリ -->
    <div v-else class="main-app">
      <!-- ヘッダー -->
      <header class="app-header">
        <div class="header-content">
          <h1 class="app-title">🧊 Fridge Buddy</h1>
          <button @click="handleLogout" class="logout-btn">
            ログアウト
          </button>
        </div>
      </header>
      
      <!-- メインコンテンツ -->
      <main class="main-content">
        <MainInventory v-if="activeView === 'inventory'" />
        <FridgeAnalysis v-else-if="activeView === 'analysis'" />
        <ShoppingList v-else-if="activeView === 'shopping'" />
      </main>
      
      <!-- 下部ナビゲーション -->
      <nav class="bottom-navigation">
        <button 
          @click="switchView('inventory')"
          :class="['nav-btn', { active: activeView === 'inventory' }]"
        >
          <span class="nav-icon">📋</span>
          <span class="nav-label">常備食材</span>
        </button>
        <button 
          @click="switchView('analysis')"
          :class="['nav-btn', { active: activeView === 'analysis' }]"
        >
          <span class="nav-icon">📸</span>
          <span class="nav-label">冷蔵庫確認</span>
        </button>
        <button 
          @click="switchView('shopping')"
          :class="['nav-btn', { active: activeView === 'shopping' }]"
        >
          <span class="nav-icon">🛒</span>
          <span class="nav-label">買い物リスト</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
#app {
  width: 100%;
  min-height: 100vh;
  background: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ローディング画面 */
.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: #6b7280;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e5e7eb;
  border-top: 3px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* メインアプリ */
.main-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* ヘッダー */
.app-header {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 1rem 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-title {
  margin: 0;
  color: #1f2937;
  font-size: 1.5rem;
  font-weight: bold;
}

.logout-btn {
  padding: 0.5rem 1rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.logout-btn:hover {
  background: #dc2626;
}

/* メインコンテンツ */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 80px; /* 下部ナビの高さ分 */
}

/* 下部ナビゲーション */
.bottom-navigation {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  border-top: 1px solid #e5e7eb;
  display: flex;
  padding: 0.5rem 0;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
}

.nav-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  color: #6b7280;
}

.nav-btn.active {
  color: #3b82f6;
}

.nav-btn:hover {
  background: #f8fafc;
}

.nav-icon {
  font-size: 1.25rem;
  margin-bottom: 0.25rem;
}

.nav-label {
  font-size: 0.75rem;
  font-weight: 500;
}

/* レスポンシブ */
@media (max-width: 768px) {
  .header-content {
    padding: 0 1rem;
  }
  
  .app-title {
    font-size: 1.25rem;
  }
  
  .nav-label {
    font-size: 0.625rem;
  }
}
</style> 