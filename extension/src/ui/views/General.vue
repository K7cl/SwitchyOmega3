<script setup lang="ts">
import { computed } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'
import { type Profile } from '@switchyomega/omega-pac'
import OmegaProfileInline from '@/ui/components/OmegaProfileInline.vue'

const store = useOptionsStore()

// Original master.coffee: downloadIntervals = [15, 60, 180, 360, 720, 1440, -1]
const downloadIntervals = [15, 60, 180, 360, 720, 1440, -1]
function downloadIntervalI18n(interval: number): string {
  return 'options_downloadInterval_' + (interval < 0 ? 'never' : interval)
}
const intervalFallback: Record<number, string> = {
  15: '15 Minutes',
  60: '1 Hour',
  180: '3 Hours',
  360: '6 Hours',
  720: '12 Hours',
  1440: 'Every day',
  '-1': 'Never',
}

const monitorWebRequests = computed<boolean>({
  get: () => Boolean(store.setting('-monitorWebRequests')),
  set: (v) => store.setSetting('-monitorWebRequests', v),
})
const showExternalProfile = computed<boolean>({
  get: () => Boolean(store.setting('-showExternalProfile')),
  set: (v) => store.setSetting('-showExternalProfile', v),
})
const downloadInterval = computed<number>({
  get: () => {
    const raw = store.setting<number | undefined>('-downloadInterval')
    return typeof raw === 'number' ? raw : -1
  },
  set: (v) => store.setSetting('-downloadInterval', v),
})

// $profile('systemProfile') / $profile('externalProfile') render inline chips.
const systemProfile = computed<Profile>(
  () =>
    store.profile('system') ?? {
      name: 'system',
      profileType: 'SystemProfile',
      color: '#0055ee',
    },
)
const externalProfile = computed<Profile>(() => ({
  name: t('popup_externalProfile') || '(External Profile)',
  profileType: 'FixedProfile',
  color: '#49afcd',
}))

// Split a localized message that embeds profile chips at $0/$1 positions into
// alternating text / chip segments (mirrors the AngularJS omega-html directive).
const SENTINEL = '￼'
type Segment = { text: string } | { chip: Profile }
function segments(key: string, fallback: string, chips: Profile[]): Segment[] {
  const subs = chips.map((_, i) => SENTINEL + i + SENTINEL)
  let msg = t(key, subs)
  if (!msg) msg = fallback.replace(/\$(\d+)/g, (_, i) => SENTINEL + i + SENTINEL)
  const parts: Segment[] = []
  const re = new RegExp(SENTINEL + '(\\d+)' + SENTINEL, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(msg)) !== null) {
    if (m.index > last) parts.push({ text: msg.slice(last, m.index) })
    parts.push({ chip: chips[Number(m[1])] })
    last = re.lastIndex
  }
  if (last < msg.length) parts.push({ text: msg.slice(last) })
  return parts
}

const higherPrioritySegments = computed(() =>
  segments(
    'options_conflicts_higherPriority',
    'If SwitchyOmega has higher priority, you can give the control back to ' +
      'other apps or system settings by selecting $0 in the popup menu.',
    [systemProfile.value],
  ),
)
const showExternalProfileHelpSegments = computed(() =>
  segments(
    'options_showExternalProfileHelp',
    'When $0 is selected, you can import the effective proxy settings from ' +
      'other apps by selecting $1 on the popup menu. The settings will be ' +
      'imported as a profile using the name you provide. Please note that the ' +
      'imported profile is a snapshot and will not reflect any changes from ' +
      'the source app thereafter.',
    [systemProfile.value, externalProfile.value],
  ),
)

const monitorWebRequestsHelp = computed(
  () =>
    t('options_monitorWebRequestsHelp') ||
    'A yellow badge will be displayed on the icon if some resources fail to ' +
      'load,<br>and you can set the profile for such resources conveniently ' +
      'via the popup menu.',
)
</script>

<template>
  <div class="page-header">
    <h2>{{ t('options_tab_general') || 'General' }}</h2>
  </div>

  <section class="settings-group">
    <h3>{{ t('options_group_networkRequests') || 'Network Requests' }}</h3>
    <div class="checkbox">
      <label>
        <input
          v-model="monitorWebRequests"
          type="checkbox"
        >
        <span>{{
          t('options_monitorWebRequests') ||
            'Show count of failed web requests for resources in the current tab.'
        }}</span>
      </label>
      <p
        class="help-block"
        v-html="monitorWebRequestsHelp"
      />
    </div>
  </section>

  <section class="settings-group width-limit">
    <h3>{{ t('options_downloadOptions') || 'Download Options' }}</h3>
    <p class="help-block">
      {{
        t('options_downloadOptionsHelp') ||
          'Configure the update frequency of online rule lists and PAC scripts.'
      }}
    </p>
    <div class="form-group">
      <label for="download-interval">{{
        t('options_downloadInterval') || 'Download Interval'
      }}</label>
      <select
        id="download-interval"
        v-model.number="downloadInterval"
        class="form-control inline-form-control"
      >
        <option
          v-for="interval in downloadIntervals"
          :key="interval"
          :value="interval"
        >
          {{ t(downloadIntervalI18n(interval)) || intervalFallback[interval] }}
        </option>
      </select>
    </div>
  </section>

  <section class="settings-group width-limit">
    <h3>{{ t('options_group_conflicts') || 'Conflicts' }}</h3>
    <p>
      {{
        t('options_conflicts_introduction') ||
          'Sometimes, other apps will also try to control the proxy settings, ' +
          'resulting in conflicts. Note that ad blockers and other extensions ' +
          'may also use proxy settings under the hood. Such conflicts cannot ' +
          'be avoided due to how the browser works.'
      }}
    </p>
    <p class="help-text text-danger">
      <span
        style="
          padding: 1px 4px;
          background: #da4f49;
          color: #fff;
          box-shadow: #ccc 1px 1px 1px 1px;
        "
      >=</span>
      {{
        t('options_conflicts_lowerPriority') ||
          'A red badge like this on the SwitchyOmega icon indicates that ' +
          'another app has higher priority so SwitchyOmega cannot control the ' +
          'settings. Please try to uninstall SwitchyOmega and reinstall, ' +
          'which should raise SwitchyOmega\'s priority. If you still see ' +
          'conflicts after reinstallation, please consider removing the other ' +
          'app causing the conflict.'
      }}
    </p>
    <p class="help-text text-info">
      <span class="glyphicon glyphicon-info-sign" />
      <template
        v-for="(seg, i) in higherPrioritySegments"
        :key="i"
      >
        <OmegaProfileInline
          v-if="'chip' in seg"
          :profile="seg.chip"
          class="profile-inline"
        />
        <span v-else>{{ seg.text }}</span>
      </template>
    </p>

    <div class="checkbox">
      <label>
        <input
          v-model="showExternalProfile"
          type="checkbox"
        >
        <span>{{
          t('options_showExternalProfile') ||
            'Show popup menu item to import proxy settings from other apps.'
        }}</span>
      </label>
    </div>
    <p class="help-block">
      <template
        v-for="(seg, i) in showExternalProfileHelpSegments"
        :key="i"
      >
        <OmegaProfileInline
          v-if="'chip' in seg"
          :profile="seg.chip"
          class="profile-inline"
        />
        <span v-else>{{ seg.text }}</span>
      </template>
    </p>
  </section>
</template>

<style scoped>
.profile-inline {
  display: inline-flex;
  vertical-align: middle;
}
</style>

