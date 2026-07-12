<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { t } from '@/ui/i18n'
import { useOptionsStore } from '@/ui/store'

const emit = defineEmits<{ close: [] }>()

const store = useOptionsStore()
const router = useRouter()

// Firefox lacks the proxy PAC APIs the original disables here; Chromium
// supports PAC profiles, so they stay enabled.
const pacProfilesUnsupported = false

const profileIcons: Record<string, string> = {
  FixedProfile: 'glyphicon-globe',
  SwitchProfile: 'glyphicon-retweet',
  PacProfile: 'glyphicon-file',
  RuleListProfile: 'glyphicon-list',
  VirtualProfile: 'glyphicon-question-sign',
}

const name = ref('')
const profileType = ref('FixedProfile')

const RESERVED = ['direct', 'system']

const isReserved = computed(() => RESERVED.indexOf(name.value.trim().toLowerCase()) >= 0)
const isConflict = computed(() => !!store.profile(name.value.trim()))
function isProfileNameHidden(n: string): boolean {
  const key = '+' + n.trim()
  const p = store.options[key] as { name?: string } | undefined
  return !!p && !!p.name && p.name.startsWith('__')
}
const isEmpty = computed(() => name.value.trim().length === 0)
const isHidden = computed(() => !isEmpty.value && !isReserved.value && !isConflict.value && isProfileNameHidden(name.value))

const nameValid = computed(() => !isEmpty.value && !isReserved.value && !isConflict.value)
const formValid = computed(() => nameValid.value && !!profileType.value)

function dismiss(): void {
  emit('close')
}

async function create(): Promise<void> {
  if (!formValid.value) return
  const finalName = name.value.trim()
  store.addProfile({
    name: finalName,
    profileType: profileType.value,
    color: '#77b1eb',
    defaultProfileName: profileType.value === 'VirtualProfile' ? 'direct' : undefined,
  })
  emit('close')
  router.push('/profile/' + encodeURIComponent(finalName))
}
</script>

<template>
  <div>
    <div
      class="modal-backdrop in"
      @click="dismiss"
    />
    <div
      class="modal in"
      tabindex="-1"
      role="dialog"
      style="display: block"
    >
      <div
        class="modal-dialog"
        role="document"
      >
        <div class="modal-content">
          <form
            name="newProfile"
            @submit.prevent="create"
          >
            <div class="modal-header">
              <button
                type="button"
                class="close"
                @click="dismiss"
              >
                <span aria-hidden="true">&times;</span>
                <span class="sr-only">Close</span>
              </button>
              <h4 class="modal-title">
                {{ t('options_modalHeader_newProfile') || 'New Profile' }}
              </h4>
            </div>
            <div class="modal-body">
              <div
                class="form-group"
                :class="{ 'has-error': !nameValid }"
              >
                <label for="profile-new-name">{{ t('options_newProfileName') || 'Profile name' }}</label>
                <input
                  id="profile-new-name"
                  v-model="name"
                  type="text"
                  name="profileNewName"
                  class="form-control"
                  required
                  autofocus
                >
                <div
                  v-show="isEmpty"
                  class="help-block"
                >
                  {{ t('options_profileNameEmpty') || 'Please enter a name for the profile.' }}
                </div>
                <div
                  v-show="!isEmpty && isReserved"
                  class="help-block"
                >
                  {{ t('options_profileNameReserved') || 'This name is reserved and cannot be used.' }}
                </div>
                <div
                  v-show="!isEmpty && !isReserved && isConflict"
                  class="help-block"
                >
                  {{ t('options_profileNameConflict') || 'A profile with this name already exists.' }}
                </div>
                <div
                  v-show="isHidden"
                  class="help-block"
                >
                  <div class="text-info">
                    <span class="glyphicon glyphicon-info-sign" />
                    {{ t('options_profileNameHidden') || 'A hidden profile with this name already exists.' }}
                  </div>
                </div>
              </div>
              <label>{{ t('options_profileType') || 'Profile type' }}</label>
              <div class="radio">
                <label>
                  <input
                    v-model="profileType"
                    type="radio"
                    name="profile-new-type"
                    value="FixedProfile"
                  >
                  <span class="profile-type">
                    <span
                      class="glyphicon"
                      :class="profileIcons['FixedProfile']"
                    />
                    <span>{{ t('options_profileTypeFixedProfile') || 'Proxy Profile' }}</span>
                  </span>
                  <div class="help-block">
                    {{ t('options_profileDescFixedProfile') || 'A profile with a fixed proxy server or a list of proxy servers.' }}
                  </div>
                </label>
              </div>
              <div class="radio">
                <label>
                  <input
                    v-model="profileType"
                    type="radio"
                    name="profile-new-type"
                    value="SwitchProfile"
                  >
                  <span class="profile-type">
                    <span
                      class="glyphicon"
                      :class="profileIcons['SwitchProfile']"
                    />
                    <span>{{ t('options_profileTypeSwitchProfile') || 'Switch Profile' }}</span>
                  </span>
                  <div class="help-block">
                    {{ t('options_profileDescSwitchProfile') || 'Switch between profiles based on flexible rules.' }}
                  </div>
                </label>
              </div>
              <div class="radio">
                <label>
                  <input
                    v-model="profileType"
                    type="radio"
                    name="profile-new-type"
                    value="PacProfile"
                    :disabled="pacProfilesUnsupported"
                  >
                  <span class="profile-type">
                    <span
                      class="glyphicon"
                      :class="profileIcons['PacProfile']"
                    />
                    <span>{{ t('options_profileTypePacProfile') || 'PAC Profile' }}</span>
                  </span>
                  <div class="help-block">
                    {{ t('options_profileDescPacProfile') || 'A profile based on a PAC script.' }}
                  </div>
                  <div
                    v-show="!pacProfilesUnsupported"
                    class="help-block"
                  >
                    {{ t('options_profileDescMorePacProfile') || 'You can write your own proxy rules using JavaScript.' }}
                  </div>
                  <div
                    v-show="pacProfilesUnsupported"
                    class="has-error"
                  >
                    <div class="help-block">
                      <span class="glyphicon glyphicon-warning-sign" />
                      {{ t('options_pac_profile_unsupported_moz') || 'PAC profiles are not supported in this browser.' }}
                    </div>
                  </div>
                </label>
              </div>
              <div class="radio">
                <label>
                  <input
                    v-model="profileType"
                    type="radio"
                    name="profile-new-type"
                    value="RuleListProfile"
                  >
                  <span class="profile-type">
                    <span
                      class="glyphicon"
                      :class="profileIcons['RuleListProfile']"
                    />
                    <span>{{ t('options_profileTypeRuleListProfile') || 'Rule List Profile' }}</span>
                  </span>
                  <div class="help-block">
                    {{ t('options_profileDescRuleListProfile') || 'A profile based on an online rule list, such as AutoProxy or Switardis.' }}
                  </div>
                </label>
              </div>
              <div class="radio">
                <label>
                  <input
                    v-model="profileType"
                    type="radio"
                    name="profile-new-type"
                    value="VirtualProfile"
                  >
                  <span class="profile-type">
                    <span
                      class="glyphicon virtual-profile-icon"
                      :class="profileIcons['VirtualProfile']"
                    />
                    <span>{{ t('options_profileTypeVirtualProfile') || 'Virtual Profile' }}</span>
                  </span>
                  <div class="help-block">
                    {{ t('options_profileDescVirtualProfile') || 'A placeholder that redirects to another profile of your choice.' }}
                  </div>
                </label>
              </div>
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-default"
                @click="dismiss"
              >
                {{ t('dialog_cancel') || 'Cancel' }}
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                :disabled="!formValid"
              >
                {{ t('options_createProfile') || 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
