import { Capacitor } from '@capacitor/core'

export const ANDROID_SYSTEM_INSETS_EVENT = 'closeshop:android-system-insets'

const KEYBOARD_INSET_THRESHOLD_PX = 120
const MAX_SAFE_INSET_PX = 160
const GESTURE_NAV_MAX_INSET_PX = 20
const TWO_BUTTON_NAV_MAX_INSET_PX = 32
const MIN_THREE_BUTTON_NAV_VISUAL_GAP_PX = 4
const MAX_THREE_BUTTON_NAV_VISUAL_GAP_PX = 8

const ANDROID_NAVIGATION_MODE = {
  none: 'none',
  gesture: 'gesture',
  twoButton: 'two-button',
  threeButton: 'three-button',
}

let initialized = false
let safeAreaSyncFrameId = 0
let removeListeners = () => {}
let hasNativeAndroidInsets = false
let latestNativeAndroidInsets = createInsetRecord()

function createInsetRecord() {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }
}

function isClient() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

export function isAndroidNativeApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function clampInset(value) {
  return Math.max(0, Math.min(MAX_SAFE_INSET_PX, Math.round(Number(value) || 0)))
}

function parsePxValue(value) {
  const parsed = Number.parseFloat(String(value || '').trim())
  return Number.isFinite(parsed) ? clampInset(parsed) : 0
}

function readCssInset(propertyName) {
  if (!isClient()) {
    return 0
  }

  const root = document.documentElement
  if (!root) {
    return 0
  }

  return parsePxValue(getComputedStyle(root).getPropertyValue(propertyName))
}

function readInjectedSafeAreaInsets() {
  return {
    top: readCssInset('--safe-area-inset-top'),
    right: readCssInset('--safe-area-inset-right'),
    bottom: readCssInset('--safe-area-inset-bottom'),
    left: readCssInset('--safe-area-inset-left'),
  }
}

function getViewportBottomInset() {
  const viewport = window.visualViewport
  if (!viewport) {
    return 0
  }

  const layoutHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0)
  const rawInset = Math.max(layoutHeight - (viewport.height + viewport.offsetTop), 0)

  // Ignore keyboard-sized viewport reductions so fixed controls do not jump while typing.
  if (rawInset >= KEYBOARD_INSET_THRESHOLD_PX) {
    return 0
  }

  return clampInset(rawInset)
}

function getResolvedAndroidInsets() {
  if (!isAndroidNativeApp()) {
    return createInsetRecord()
  }

  const injectedInsets = readInjectedSafeAreaInsets()
  const fallbackInsets = hasNativeAndroidInsets ? latestNativeAndroidInsets : injectedInsets

  return {
    top: Math.max(fallbackInsets.top, injectedInsets.top),
    right: Math.max(fallbackInsets.right, injectedInsets.right),
    bottom: Math.max(fallbackInsets.bottom, injectedInsets.bottom),
    left: Math.max(fallbackInsets.left, injectedInsets.left),
  }
}

function getAndroidNavigationMode(bottomInset) {
  if (bottomInset <= 0) {
    return ANDROID_NAVIGATION_MODE.none
  }

  if (bottomInset <= GESTURE_NAV_MAX_INSET_PX) {
    return ANDROID_NAVIGATION_MODE.gesture
  }

  if (bottomInset <= TWO_BUTTON_NAV_MAX_INSET_PX) {
    return ANDROID_NAVIGATION_MODE.twoButton
  }

  return ANDROID_NAVIGATION_MODE.threeButton
}

function getThreeButtonNavVisualGap(navBarHeight) {
  if (navBarHeight <= TWO_BUTTON_NAV_MAX_INSET_PX) {
    return 0
  }

  return Math.min(
    MAX_THREE_BUTTON_NAV_VISUAL_GAP_PX,
    Math.max(MIN_THREE_BUTTON_NAV_VISUAL_GAP_PX, Math.round(navBarHeight * 0.12)),
  )
}

function applySafeAreaVariables() {
  if (!isClient()) {
    return
  }

  const root = document.documentElement
  const body = document.body
  if (!root || !body) {
    return
  }

  const isAndroidNative = isAndroidNativeApp()
  const resolvedInsets = getResolvedAndroidInsets()
  const viewportBottomInset = getViewportBottomInset()
  const bottomSystemInset = Math.max(resolvedInsets.bottom, viewportBottomInset)
  const navigationMode = isAndroidNative
    ? getAndroidNavigationMode(bottomSystemInset)
    : ANDROID_NAVIGATION_MODE.none
  const isGestureNavigation = navigationMode === ANDROID_NAVIGATION_MODE.gesture
  const isTwoButtonNavigation = navigationMode === ANDROID_NAVIGATION_MODE.twoButton
  const hasThreeButtonNavigation = navigationMode === ANDROID_NAVIGATION_MODE.threeButton
  const androidBottomClearance = isAndroidNative ? bottomSystemInset : 0
  const androidNavBarHeight =
    isTwoButtonNavigation || hasThreeButtonNavigation ? bottomSystemInset : 0
  const androidNavExtraSpace = hasThreeButtonNavigation
    ? getThreeButtonNavVisualGap(androidNavBarHeight)
    : 0
  const bottomSafeSpace = androidBottomClearance
  const bottomNavLift = hasThreeButtonNavigation
    ? Math.max(androidNavBarHeight - androidNavExtraSpace, 0)
    : 0
  const navigationBackdropHeight = androidNavBarHeight

  root.classList.toggle('app-android-native', isAndroidNative)
  root.classList.toggle('app-android-gesture-nav', isAndroidNative && isGestureNavigation)
  root.classList.toggle('app-android-two-button-nav', isAndroidNative && isTwoButtonNavigation)
  root.classList.toggle('app-android-three-button-nav', hasThreeButtonNavigation)
  body.classList.toggle('app-android-native', isAndroidNative)
  body.classList.toggle('app-android-gesture-nav', isAndroidNative && isGestureNavigation)
  body.classList.toggle('app-android-two-button-nav', isAndroidNative && isTwoButtonNavigation)
  body.classList.toggle('app-android-three-button-nav', hasThreeButtonNavigation)

  if (isAndroidNative) {
    root.style.setProperty('--app-safe-area-top', `${resolvedInsets.top}px`)
    root.style.setProperty('--app-safe-area-right', `${resolvedInsets.right}px`)
    root.style.setProperty('--app-safe-area-bottom', `${resolvedInsets.bottom}px`)
    root.style.setProperty('--app-safe-area-left', `${resolvedInsets.left}px`)
    root.style.setProperty('--app-bottom-safe-space', `${bottomSafeSpace}px`)
    root.style.setProperty('--app-android-nav-bar-height', `${androidNavBarHeight}px`)
    root.style.setProperty('--app-android-nav-extra-space', `${androidNavExtraSpace}px`)
    root.style.setProperty('--app-bottom-nav-lift', `${bottomNavLift}px`)
    root.style.setProperty('--app-navigation-backdrop-height', `${navigationBackdropHeight}px`)
  } else {
    root.style.removeProperty('--app-safe-area-top')
    root.style.removeProperty('--app-safe-area-right')
    root.style.removeProperty('--app-safe-area-bottom')
    root.style.removeProperty('--app-safe-area-left')
    root.style.removeProperty('--app-bottom-safe-space')
    root.style.removeProperty('--app-android-nav-bar-height')
    root.style.removeProperty('--app-android-nav-extra-space')
    root.style.removeProperty('--app-bottom-nav-lift')
    root.style.removeProperty('--app-navigation-backdrop-height')
  }

  root.style.setProperty('--app-safe-area-bottom-runtime', `${viewportBottomInset}px`)
  root.style.setProperty('--app-android-bottom-clearance', `${androidBottomClearance}px`)
}

export function queueSafeAreaSync() {
  if (!isClient() || safeAreaSyncFrameId) {
    return
  }

  safeAreaSyncFrameId = window.requestAnimationFrame(() => {
    safeAreaSyncFrameId = 0
    applySafeAreaVariables()
  })
}

function normalizeInsetDetail(detail) {
  return {
    top: clampInset(detail?.top),
    right: clampInset(detail?.right),
    bottom: clampInset(detail?.bottom),
    left: clampInset(detail?.left),
  }
}

function handleNativeAndroidInsets(event) {
  hasNativeAndroidInsets = true
  latestNativeAndroidInsets = normalizeInsetDetail(event?.detail)
  queueSafeAreaSync()
}

export function initializeSafeAreaController() {
  if (!isClient() || initialized) {
    return removeListeners
  }

  const handleViewportChange = () => {
    queueSafeAreaSync()
  }

  window.addEventListener('resize', handleViewportChange, { passive: true })
  window.addEventListener('orientationchange', handleViewportChange, { passive: true })
  window.addEventListener(ANDROID_SYSTEM_INSETS_EVENT, handleNativeAndroidInsets)
  window.visualViewport?.addEventListener('resize', handleViewportChange)
  window.visualViewport?.addEventListener('scroll', handleViewportChange)

  initialized = true
  removeListeners = () => {
    if (!initialized) {
      return
    }

    if (safeAreaSyncFrameId) {
      window.cancelAnimationFrame(safeAreaSyncFrameId)
      safeAreaSyncFrameId = 0
    }

    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('orientationchange', handleViewportChange)
    window.removeEventListener(ANDROID_SYSTEM_INSETS_EVENT, handleNativeAndroidInsets)
    window.visualViewport?.removeEventListener('resize', handleViewportChange)
    window.visualViewport?.removeEventListener('scroll', handleViewportChange)

    initialized = false
  }

  queueSafeAreaSync()

  return removeListeners
}
