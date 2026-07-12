import { createRouter, createWebHashHistory } from 'vue-router'

// Options SPA routes. Profile editors are addressed by name.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/about' },
    { path: '/about', component: () => import('./views/About.vue') },
    { path: '/ui', component: () => import('./views/UiSettings.vue') },
    { path: '/general', component: () => import('./views/General.vue') },
    { path: '/io', component: () => import('./views/ImportExport.vue') },
    { path: '/sync', component: () => import('./views/Sync.vue') },
    { path: '/profile/:name', component: () => import('./views/ProfileEditor.vue'), props: true },
  ],
})
