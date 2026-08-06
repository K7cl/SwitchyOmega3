// alert — a minimal reactive toast for the options page, replacing the original
// AngularJS `showAlert()`. A single alert slides down from the top of the page
// and auto-dismisses after a few seconds. The visual (position/slide/hidden
// state) comes from `.alert-top-wrapper` in options.less; toggling the `ng-hide`
// class drives the transition exactly as the original did.

import { reactive } from 'vue'

export type AlertType = 'success' | 'error' | 'warning' | 'info'

export interface AlertState {
  shown: boolean
  type: AlertType
  message: string
}

const state = reactive<AlertState>({ shown: false, type: 'success', message: '' })
let hideTimer: ReturnType<typeof setTimeout> | null = null

/** The shared reactive alert state (read by OmegaAlert.vue). */
export function useAlert(): AlertState {
  return state
}

/**
 * Show a toast of the given type. Auto-hides after `timeout` ms; pass 0 to keep
 * it until dismissed. Calling again replaces the current toast.
 */
export function showAlert(type: AlertType, message: string, timeout = 3000): void {
  state.type = type
  state.message = message
  state.shown = true
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
  if (timeout > 0) {
    hideTimer = setTimeout(() => {
      state.shown = false
      hideTimer = null
    }, timeout)
  }
}

export function hideAlert(): void {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  state.shown = false
}
