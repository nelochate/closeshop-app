import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

let latestSyncId = 0

const isAndroidNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

const nextAnimationFrame = () =>
  new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      resolve()
      return
    }

    window.requestAnimationFrame(() => resolve())
  })

const waitForStatusBarPaint = async () => {
  await Promise.resolve()
  await nextAnimationFrame()
  await nextAnimationFrame()
}

const applyWhiteStatusBarContent = async () => {
  await StatusBar.show()
  await StatusBar.setStyle({ style: Style.Dark })
  return true
}

export const syncGlobalStatusBar = async (_route, { waitForPaint = true } = {}) => {
  const syncId = ++latestSyncId

  if (!isAndroidNative()) {
    return false
  }

  if (waitForPaint) {
    await waitForStatusBarPaint()
  }

  if (syncId !== latestSyncId) {
    return false
  }

  try {
    return await applyWhiteStatusBarContent()
  } catch (error) {
    console.warn('Status bar sync failed:', error)
    return false
  }
}

export const syncCurrentViewStatusBar = async ({ waitForPaint = true } = {}) => {
  const syncId = ++latestSyncId

  if (!isAndroidNative()) {
    return false
  }

  if (waitForPaint) {
    await waitForStatusBarPaint()
  }

  if (syncId !== latestSyncId) {
    return false
  }

  try {
    return await applyWhiteStatusBarContent()
  } catch (error) {
    console.warn('Current view status bar sync failed:', error)
    return false
  }
}
