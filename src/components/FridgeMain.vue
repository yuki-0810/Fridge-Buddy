<script setup>
import { ref } from 'vue'
import SupabaseTest from './SupabaseTest.vue'
import FridgeVisionTest from './FridgeVisionTest.vue'

const appTitle = ref('Fridge Buddy')
const subtitle = ref('あなたの冷蔵庫を賢く管理')
const activeTab = ref('home') // 'home', 'test', 'vision'

const switchTab = (tab) => {
  activeTab.value = tab
}
</script>

<template>
  <div class="fridge-main">
    <header class="header">
      <div class="container">
        <h1 class="title">{{ appTitle }}</h1>
        <p class="subtitle">{{ subtitle }}</p>
        
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
        </nav>
      </div>
    </header>
    
    <main class="main-content">
      <div class="container">
        <!-- ホームタブ -->
        <div v-if="activeTab === 'home'" class="tab-content">
          <div class="welcome-section">
            <h2>冷蔵庫管理を始めましょう</h2>
            <p>食材の管理、賞味期限の確認、レシピ提案まで、すべてFridge Buddyにお任せください。</p>
            
            <div class="action-buttons">
              <button class="btn btn-primary">食材を追加</button>
              <button class="btn btn-secondary">レシピを探す</button>
            </div>
            
            <div class="test-note">
              <p>💡 <strong>開発中:</strong></p>
              <ul>
                <li>「Supabaseテスト」- 接続・認証・DB操作をテスト</li>
                <li>「Vision AIテスト」- OpenAI画像解析の精度比較テスト</li>
              </ul>
            </div>
          </div>
        </div>
        
        <!-- Supabaseテストタブ -->
        <div v-if="activeTab === 'test'" class="tab-content">
          <SupabaseTest />
        </div>
        
        <!-- Vision AIテストタブ -->
        <div v-if="activeTab === 'vision'" class="tab-content">
          <FridgeVisionTest />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.fridge-main {
  width: 100%;
  min-height: 100vh;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem 0;
  text-align: center;
}

.title {
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1.2rem;
  opacity: 0.9;
  margin-bottom: 1.5rem;
}

/* タブナビゲーション */
.tab-nav {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.tab-btn {
  padding: 0.5rem 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 1rem;
  white-space: nowrap;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
}

.tab-btn.active {
  background: white;
  color: #667eea;
  border-color: white;
  font-weight: bold;
}

.main-content {
  flex: 1;
  padding: 3rem 0;
}

.tab-content {
  min-height: 60vh;
}

.welcome-section {
  text-align: center;
  max-width: 600px;
  margin: 0 auto;
}

.welcome-section h2 {
  font-size: 2rem;
  color: #2d3748;
  margin-bottom: 1rem;
}

.welcome-section p {
  font-size: 1.1rem;
  color: #4a5568;
  margin-bottom: 2rem;
  line-height: 1.6;
}

.action-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 2rem;
}

.test-note {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-top: 2rem;
  text-align: left;
}

.test-note p {
  color: #9a3412;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.test-note ul {
  color: #9a3412;
  font-size: 0.9rem;
  margin-left: 1.5rem;
}

.test-note ul li {
  margin-bottom: 0.25rem;
}

/* レスポンシブ対応 */
@media (max-width: 768px) {
  .title {
    font-size: 2rem;
  }
  
  .subtitle {
    font-size: 1rem;
  }
  
  .tab-nav {
    flex-direction: column;
    align-items: center;
  }
  
  .tab-btn {
    width: 200px;
  }
  
  .welcome-section h2 {
    font-size: 1.5rem;
  }
  
  .welcome-section p {
    font-size: 1rem;
  }
  
  .action-buttons {
    flex-direction: column;
    align-items: center;
  }
  
  .action-buttons .btn {
    width: 200px;
  }
}

@media (max-width: 480px) {
  .header {
    padding: 1.5rem 0;
  }
  
  .main-content {
    padding: 2rem 0;
  }
  
  .title {
    font-size: 1.8rem;
  }
  
  .tab-btn {
    width: 150px;
    font-size: 0.9rem;
  }
}
</style> 