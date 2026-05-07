import { defineStore } from 'pinia'
import { ref } from 'vue'

const SELECTED_ADDRESS_STORAGE_KEY = 'closeshop:selected-checkout-address'
const RETURN_PATH_STORAGE_KEY = 'closeshop:checkout-return-path'

const readStoredValue = (key, fallback = null) => {
  if (typeof window === 'undefined') return fallback

  const rawValue = window.localStorage.getItem(key)
  if (!rawValue) return fallback

  try {
    return JSON.parse(rawValue)
  } catch (error) {
    console.warn(`Failed to read checkout store value for ${key}:`, error)
    return fallback
  }
}

const writeStoredValue = (key, value) => {
  if (typeof window === 'undefined') return

  if (value === null || value === undefined || value === '') {
    window.localStorage.removeItem(key)
    return
  }

  window.localStorage.setItem(key, JSON.stringify(value))
}

const cloneAddress = (address) => {
  if (!address) return null
  return JSON.parse(JSON.stringify(address))
}

export const useCheckoutStore = defineStore('checkout', () => {
  const selectedAddress = ref(readStoredValue(SELECTED_ADDRESS_STORAGE_KEY, null))
  const returnPath = ref(readStoredValue(RETURN_PATH_STORAGE_KEY, '/purchaseview'))

  const setSelectedAddress = (address) => {
    const nextAddress = cloneAddress(address)
    selectedAddress.value = nextAddress
    writeStoredValue(SELECTED_ADDRESS_STORAGE_KEY, nextAddress)
  }

  const clearSelectedAddress = () => {
    selectedAddress.value = null
    writeStoredValue(SELECTED_ADDRESS_STORAGE_KEY, null)
  }

  const setReturnPath = (path) => {
    const normalizedPath =
      typeof path === 'string' && path.trim() ? path.trim() : '/purchaseview'

    returnPath.value = normalizedPath
    writeStoredValue(RETURN_PATH_STORAGE_KEY, normalizedPath)
  }

  return {
    selectedAddress,
    returnPath,
    setSelectedAddress,
    clearSelectedAddress,
    setReturnPath,
  }
})
