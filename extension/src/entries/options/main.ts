import { createApp } from 'vue'
import App from './App.vue'

// Phase 0: bare Vue mount. Phase 5 adds pinia (options store) + vue-router
// (about / ui / general / io / profile/:name) and the full options SPA.
createApp(App).mount('#app')
