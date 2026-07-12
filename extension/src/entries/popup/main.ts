import { createApp } from 'vue'
// Faithful styling: Bootstrap 3 (MIT) + the SwitchyOmega popup LESS compiled
// to src/styles (see scripts/build-styles.mjs).
import 'bootstrap/dist/css/bootstrap.min.css'
import '@/styles/popup.css'
import App from './App.vue'

// Popup: mount immediately. The app renders a synchronous snapshot from
// chrome.storage before any SW round-trip (TTI budget, plan §4.8).
createApp(App).mount('#app')
