<script setup>
import { ref, onMounted } from 'vue'
import { supabase, testConnection } from '../supabase.js'

// リアクティブ変数
const connectionStatus = ref('')
const user = ref(null)
const email = ref('test@example.com')
const password = ref('password123')
const authMessage = ref('')
const tableData = ref([])
const newItemName = ref('')
const tableMessage = ref('')

// 接続テスト
const handleTestConnection = async () => {
  const result = await testConnection()
  connectionStatus.value = result.message
  if (result.session) {
    user.value = result.session.user
  }
}

// 認証関連
const signUp = async () => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
    })
    if (error) throw error
    authMessage.value = `サインアップ成功: ${data.user?.email}`
    user.value = data.user
  } catch (error) {
    authMessage.value = `サインアップエラー: ${error.message}`
  }
}

const signIn = async () => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (error) throw error
    authMessage.value = `ログイン成功: ${data.user?.email}`
    user.value = data.user
  } catch (error) {
    authMessage.value = `ログインエラー: ${error.message}`
  }
}

const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    authMessage.value = 'ログアウト成功'
    user.value = null
  } catch (error) {
    authMessage.value = `ログアウトエラー: ${error.message}`
  }
}

// テーブル操作（仮のfridge_itemsテーブルを想定）
const fetchItems = async () => {
  try {
    const { data, error } = await supabase
      .from('fridge_items')
      .select('*')
    
    if (error) throw error
    tableData.value = data || []
    tableMessage.value = `アイテム取得成功: ${data?.length || 0}件`
  } catch (error) {
    tableMessage.value = `取得エラー: ${error.message}`
  }
}

const addItem = async () => {
  if (!newItemName.value.trim()) return
  
  try {
    const { data, error } = await supabase
      .from('fridge_items')
      .insert([
        { 
          name: newItemName.value,
          user_id: user.value?.id,
          created_at: new Date().toISOString()
        }
      ])
    
    if (error) throw error
    tableMessage.value = `アイテム追加成功: ${newItemName.value}`
    newItemName.value = ''
    await fetchItems() // リフレッシュ
  } catch (error) {
    tableMessage.value = `追加エラー: ${error.message}`
  }
}

const deleteItem = async (id) => {
  try {
    const { error } = await supabase
      .from('fridge_items')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    tableMessage.value = `アイテム削除成功: ID ${id}`
    await fetchItems() // リフレッシュ
  } catch (error) {
    tableMessage.value = `削除エラー: ${error.message}`
  }
}

// 初期化
onMounted(() => {
  handleTestConnection()
})
</script>

<template>
  <div class="supabase-test">
    <h2>🔧 Supabase接続テスト</h2>
    
    <!-- 接続テスト -->
    <section class="test-section">
      <h3>接続確認</h3>
      <button @click="handleTestConnection" class="btn btn-primary">接続テスト</button>
      <p :class="['status', connectionStatus.includes('成功') ? 'success' : 'error']">
        {{ connectionStatus || '未テスト' }}
      </p>
    </section>

    <!-- 認証テスト -->
    <section class="test-section">
      <h3>認証テスト</h3>
      <div class="auth-form">
        <input v-model="email" type="email" placeholder="メールアドレス" class="input">
        <input v-model="password" type="password" placeholder="パスワード" class="input">
        <div class="button-group">
          <button @click="signUp" class="btn btn-secondary">サインアップ</button>
          <button @click="signIn" class="btn btn-primary">ログイン</button>
          <button @click="signOut" class="btn btn-secondary">ログアウト</button>
        </div>
      </div>
      <p class="status">{{ authMessage || '未実行' }}</p>
      <p v-if="user" class="user-info">ログイン中: {{ user.email }}</p>
    </section>

    <!-- テーブル操作テスト -->
    <section class="test-section">
      <h3>テーブル操作テスト (fridge_items)</h3>
      <div class="table-form">
        <input v-model="newItemName" placeholder="アイテム名" class="input">
        <button @click="addItem" :disabled="!user" class="btn btn-primary">追加</button>
        <button @click="fetchItems" class="btn btn-secondary">取得</button>
      </div>
      <p class="status">{{ tableMessage || '未実行' }}</p>
      
      <div v-if="tableData.length > 0" class="table-data">
        <h4>取得データ ({{ tableData.length }}件)</h4>
        <ul>
          <li v-for="item in tableData" :key="item.id" class="item">
            <span>{{ item.name }}</span>
            <small>(ID: {{ item.id }})</small>
            <button @click="deleteItem(item.id)" class="btn-small btn-danger">削除</button>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.supabase-test {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.test-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  background: white;
}

.test-section h3 {
  color: #2d3748;
  margin-bottom: 1rem;
}

.auth-form,
.table-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 1rem;
}

.input {
  padding: 0.5rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.25rem;
  font-size: 1rem;
}

.button-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.status {
  margin: 0.5rem 0;
  padding: 0.5rem;
  border-radius: 0.25rem;
  font-weight: bold;
}

.status.success {
  background-color: #c6f6d5;
  color: #22543d;
}

.status.error {
  background-color: #fed7d7;
  color: #c53030;
}

.user-info {
  color: #3182ce;
  font-weight: bold;
}

.table-data {
  margin-top: 1rem;
}

.item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.btn-danger {
  background-color: #e53e3e;
  color: white;
}

.btn-danger:hover {
  background-color: #c53030;
}

/* レスポンシブ対応 */
@media (max-width: 768px) {
  .auth-form,
  .table-form {
    flex-direction: column;
    align-items: stretch;
  }
  
  .button-group {
    justify-content: center;
  }
  
  .item {
    flex-wrap: wrap;
  }
}
</style> 