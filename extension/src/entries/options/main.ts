import { createApp } from 'vue'
import { createPinia } from 'pinia'
// Faithful styling: Bootstrap 3 (MIT, bundled by Vite incl. glyphicon fonts) +
// the SwitchyOmega LESS compiled to src/styles (see scripts/build-styles.mjs).
import 'bootstrap/dist/css/bootstrap.min.css'
import '@/styles/options.css'
import App from './App.vue'
import { router } from '@/ui/router'

createApp(App).use(createPinia()).use(router).mount('#app')
