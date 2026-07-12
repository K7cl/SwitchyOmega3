import { createApp } from 'vue'
import App from './App.vue'

// Phase 0: bare Vue mount. Phase 6 adds the quick-switch menu, keyboard
// shortcuts, and synchronous snapshot render from storage (TTI budget).
createApp(App).mount('#app')
