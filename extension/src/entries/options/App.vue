<script setup lang="ts">
import { onMounted } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'
import Sidebar from '@/ui/components/Sidebar.vue'
import OmegaAlert from '@/ui/components/OmegaAlert.vue'

const store = useOptionsStore()

onMounted(() => {
  store.load().catch((e) => console.error('Failed to load options', e))
  window.addEventListener('beforeunload', (ev) => {
    if (store.isDirty) {
      ev.preventDefault()
      ev.returnValue = ''
    }
  })
})
</script>

<template>
  <div class="container-fluid">
    <OmegaAlert />
    <Sidebar />
    <main class="col-lg-10 col-sm-9 col-lg-offset-2 col-sm-offset-3 om-main">
      <div
        v-if="!store.loaded"
        class="om-loading text-muted"
      >
        {{ t('options_loading') || 'Loading…' }}
      </div>
      <router-view v-else />
    </main>
  </div>
</template>

<style>
/* The SwitchyOmega look comes from Bootstrap 3 + options.css. In particular
   `main { padding-top: 85px }` reserves room for the fixed .page-header, so we
   must NOT override main's padding here. */
.om-loading {
  padding: 2rem;
}
</style>
