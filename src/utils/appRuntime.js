import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export const APP_RUNTIME_ACTIVE_EVENT = 'closeshop:app-active'
export const APP_RUNTIME_INACTIVE_EVENT = 'closeshop:app-inactive'

const ACTIVE_DEBOUNCE_MS = 900
const INACTIVE_DEBOUNCE_MS = 250

const runtimeListeners = new Set()

let runtimeStarted = false
let appStateListenerHandle = null
let appStateListenerPromise = null
let lastInactiveAt = 0
let lastActiveAt = 0
let lastActiveEmitAt = 0
let lastInactiveEmitAt = 0

const isClient = () => typeof window !== 'undefined' && typeof document !== 'undefined'

export const isAndroidNativeApp = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

const emitRuntimeEvent = (payload) => {
  runtimeListeners.forEach((listener) => {
    try {
      listener(payload)
    } catch (error) {
      console.warn('App runtime listener failed:', error)
    }
  })

  if (!isClient()) {
    return
  }

  const eventName =
    payload.type === 'active' ? APP_RUNTIME_ACTIVE_EVENT : APP_RUNTIME_INACTIVE_EVENT

  document.dispatchEvent(
    new CustomEvent(eventName, {
      detail: payload,
    }),
  )
}

const buildRuntimePayload = (type, source, timestamp) => ({
  type,
  source,
  timestamp,
  inactiveForMs: type === 'active' && lastInactiveAt ? timestamp - lastInactiveAt : 0,
  lastInactiveAt,
  lastActiveAt,
  isAndroidNative: isAndroidNativeApp(),
})

const notifyInactive = (source = 'unknown') => {
  const timestamp = Date.now()

  if (timestamp - lastInactiveEmitAt < INACTIVE_DEBOUNCE_MS) {
    return
  }

  lastInactiveAt = timestamp
  lastInactiveEmitAt = timestamp
  emitRuntimeEvent(buildRuntimePayload('inactive', source, timestamp))
}

const notifyActive = (source = 'unknown') => {
  const timestamp = Date.now()

  if (timestamp - lastActiveEmitAt < ACTIVE_DEBOUNCE_MS) {
    return
  }

  lastActiveAt = timestamp
  lastActiveEmitAt = timestamp
  emitRuntimeEvent(buildRuntimePayload('active', source, timestamp))
}

const handleVisibilityChange = () => {
  if (document.hidden) {
    notifyInactive('visibilitychange')
    return
  }

  notifyActive('visibilitychange')
}

const handleWindowFocus = () => {
  if (!document.hidden) {
    notifyActive('focus')
  }
}

const handlePageShow = () => {
  if (!document.hidden) {
    notifyActive('pageshow')
  }
}

const detachCapacitorListener = async () => {
  const resolvedHandle = appStateListenerHandle || (await appStateListenerPromise?.catch(() => null))

  if (resolvedHandle?.remove) {
    try {
      await resolvedHandle.remove()
    } catch (error) {
      console.warn('Failed to remove app state listener:', error)
    }
  }

  appStateListenerHandle = null
  appStateListenerPromise = null
}

const attachRuntimeListeners = () => {
  if (runtimeStarted || !isClient()) {
    return
  }

  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('pageshow', handlePageShow)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  if (Capacitor.isNativePlatform()) {
    appStateListenerPromise = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        notifyActive('capacitor')
        return
      }

      notifyInactive('capacitor')
    })
      .then((listenerHandle) => {
        appStateListenerHandle = listenerHandle
        return listenerHandle
      })
      .catch((error) => {
        console.warn('Failed to register app state listener:', error)
        return null
      })
  }

  runtimeStarted = true
}

const detachRuntimeListeners = async () => {
  if (!runtimeStarted || !isClient()) {
    return
  }

  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('pageshow', handlePageShow)
  document.removeEventListener('visibilitychange', handleVisibilityChange)

  await detachCapacitorListener()

  runtimeStarted = false
}

export const subscribeToAppRuntime = (listener) => {
  if (typeof listener !== 'function') {
    return () => {}
  }

  runtimeListeners.add(listener)
  attachRuntimeListeners()

  return () => {
    runtimeListeners.delete(listener)

    if (!runtimeListeners.size) {
      void detachRuntimeListeners()
    }
  }
}

export const getAppRuntimeSnapshot = () => ({
  isAndroidNative: isAndroidNativeApp(),
  lastInactiveAt,
  lastActiveAt,
  runtimeStarted,
})
