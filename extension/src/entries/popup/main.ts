import { createApp } from 'vue'
import App from './App.vue'

// Popup: mount immediately. The app renders a synchronous snapshot from
// chrome.storage before any SW round-trip (TTI budget, plan §4.8).
createApp(App).mount('#app')
