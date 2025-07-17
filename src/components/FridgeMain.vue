<script setup>
import { ref } from 'vue'

const appTitle = ref('Fridge Buddy')
const subtitle = ref('あなたの冷蔵庫を賢く管理')
</script>

<template>
  <div class="fridge-main">
    <header class="header">
      <div class="container">
        <h1 class="title">{{ appTitle }}</h1>
        <p class="subtitle">{{ subtitle }}</p>
      </div>
    </header>
    
    <main class="main-content">
      <div class="container">
        <div class="welcome-section">
          <h2>冷蔵庫管理を始めましょう</h2>
          <p>食材の管理、賞味期限の確認、レシピ提案まで、すべてFridge Buddyにお任せください。</p>
          
          <div class="action-buttons">
            <button class="btn btn-primary">食材を追加</button>
            <button class="btn btn-secondary">レシピを探す</button>
          </div>
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
}

.main-content {
  flex: 1;
  padding: 3rem 0;
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
}

/* レスポンシブ対応 */
@media (max-width: 768px) {
  .title {
    font-size: 2rem;
  }
  
  .subtitle {
    font-size: 1rem;
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
}
</style> 