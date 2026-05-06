import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/utils/supabase'

const CART_STALE_AFTER_MS = 45000
const CART_REFRESH_DEBOUNCE_MS = 150
const CART_SELECT_QUERY = `
  *,
  product:products(
    *,
    shop:shops(
      id,
      business_name,
      logo_url
    )
  )
`

const normalizeCartItems = (data = []) =>
  (data || []).map((item) => ({
    ...item,
    product: item.product
      ? {
          ...item.product,
          shop: item.product.shop || null,
        }
      : null,
  }))

export const useCartStore = defineStore('cart', () => {
  const items = ref([])
  const loading = ref(false)
  const initialized = ref(false)
  const activeUserId = ref(null)
  const lastFetchedAt = ref(0)
  const subscription = ref(null)

  let fetchPromise = null
  let initPromise = null
  let refreshTimeoutId = null
  let authListenerRegistered = false

  const count = computed(() =>
    items.value.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
  )

  const clearRealtimeSubscription = () => {
    if (refreshTimeoutId) {
      window.clearTimeout(refreshTimeoutId)
      refreshTimeoutId = null
    }

    if (subscription.value) {
      supabase.removeChannel(subscription.value)
      subscription.value = null
    }
  }

  const clearState = () => {
    clearRealtimeSubscription()
    items.value = []
    loading.value = false
    initialized.value = false
    activeUserId.value = null
    lastFetchedAt.value = 0
    fetchPromise = null
  }

  const resolveUserId = async (userId = activeUserId.value) => {
    if (userId) {
      return userId
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    return user?.id || null
  }

  const scheduleBackgroundRefresh = (delayMs = CART_REFRESH_DEBOUNCE_MS) => {
    if (refreshTimeoutId) {
      window.clearTimeout(refreshTimeoutId)
    }

    refreshTimeoutId = window.setTimeout(() => {
      refreshTimeoutId = null
      void fetchCart({ force: true, silent: true })
    }, delayMs)
  }

  const fetchCart = async ({ userId = null, force = false, silent = false } = {}) => {
    const resolvedUserId = await resolveUserId(userId)

    if (!resolvedUserId) {
      clearState()
      return []
    }

    activeUserId.value = resolvedUserId

    if (fetchPromise) {
      return fetchPromise
    }

    fetchPromise = (async () => {
      if (!silent) {
        loading.value = true
      }

      try {
        const { data, error } = await supabase
          .from('cart_items')
          .select(CART_SELECT_QUERY)
          .eq('user_id', resolvedUserId)

        if (error) {
          throw error
        }

        items.value = normalizeCartItems(data)
        initialized.value = true
        lastFetchedAt.value = Date.now()
        return items.value
      } catch (error) {
        console.error('fetchCart error:', error)

        if (!initialized.value) {
          items.value = []
        }

        return items.value
      } finally {
        if (!silent) {
          loading.value = false
        }

        fetchPromise = null
      }
    })()

    return fetchPromise
  }

  const subscribeToCart = async (userId = activeUserId.value) => {
    if (!userId) {
      clearRealtimeSubscription()
      return
    }

    if (subscription.value && activeUserId.value === userId) {
      return
    }

    clearRealtimeSubscription()
    activeUserId.value = userId

    subscription.value = supabase
      .channel(`cart:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cart_items',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          scheduleBackgroundRefresh()
        },
      )
      .subscribe()
  }

  const registerAuthListener = () => {
    if (authListenerRegistered) {
      return
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user?.id) {
        clearState()
        return
      }

      if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION'].includes(event)) {
        void initialize(session.user.id)
      }
    })

    authListenerRegistered = true
  }

  const ensureFresh = async ({
    maxAgeMs = CART_STALE_AFTER_MS,
    force = false,
    silent = true,
  } = {}) => {
    const resolvedUserId = await resolveUserId()

    if (!resolvedUserId) {
      clearState()
      return []
    }

    const stale = Date.now() - lastFetchedAt.value > maxAgeMs
    if (!force && initialized.value && activeUserId.value === resolvedUserId && !stale) {
      return items.value
    }

    return fetchCart({ userId: resolvedUserId, force: true, silent })
  }

  const addToCart = async (
    productId,
    quantity,
    selectedSize = null,
    selectedVariety = null,
    varietyData = null,
  ) => {
    try {
      const resolvedUserId = await resolveUserId()

      if (!resolvedUserId) {
        return { success: false, error: 'User not authenticated' }
      }

      let query = supabase
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', resolvedUserId)
        .eq('product_id', productId)

      query = selectedSize ? query.eq('selected_size', selectedSize) : query.is('selected_size', null)
      query = selectedVariety
        ? query.eq('selected_variety', selectedVariety)
        : query.is('selected_variety', null)

      const { data: existingItems, error: checkError } = await query

      if (checkError) {
        console.error('Error checking existing cart item:', checkError)
        return { success: false, error: checkError.message }
      }

      if (existingItems?.length) {
        const existingItem = existingItems[0]
        const { error: updateError } = await supabase
          .from('cart_items')
          .update({
            quantity: existingItem.quantity + quantity,
            variety_data: varietyData,
          })
          .eq('id', existingItem.id)

        if (updateError) {
          console.error('Error updating cart item:', updateError)
          return { success: false, error: updateError.message }
        }
      } else {
        const { error: insertError } = await supabase.from('cart_items').insert({
          user_id: resolvedUserId,
          product_id: productId,
          quantity,
          selected_size: selectedSize,
          selected_variety: selectedVariety,
          variety_data: varietyData,
        })

        if (insertError) {
          console.error('Error inserting cart item:', insertError)
          return { success: false, error: insertError.message }
        }
      }

      await fetchCart({ userId: resolvedUserId, force: true, silent: true })
      return { success: true, error: null }
    } catch (error) {
      console.error('Error in addToCart:', error)
      return {
        success: false,
        error: error?.message || 'An unexpected error occurred',
      }
    }
  }

  const updateQuantity = async (itemId, quantity) => {
    if (quantity < 1) {
      return deleteFromCart(itemId)
    }

    const currentItem = items.value.find((item) => item.id === itemId)
    const previousQuantity = currentItem?.quantity ?? null

    if (currentItem) {
      currentItem.quantity = quantity
      lastFetchedAt.value = Date.now()
    }

    try {
      const { error } = await supabase.from('cart_items').update({ quantity }).eq('id', itemId)

      if (error) {
        throw error
      }

      scheduleBackgroundRefresh()
      return { success: true, error: null }
    } catch (error) {
      if (currentItem && previousQuantity != null) {
        currentItem.quantity = previousQuantity
      }

      console.error('updateQuantity error:', error)
      return { success: false, error: error?.message || 'Failed to update cart quantity' }
    }
  }

  const deleteFromCart = async (itemId) => {
    const previousItems = [...items.value]
    items.value = items.value.filter((item) => item.id !== itemId)
    lastFetchedAt.value = Date.now()

    try {
      const { error } = await supabase.from('cart_items').delete().eq('id', itemId)

      if (error) {
        throw error
      }

      scheduleBackgroundRefresh()
      return { success: true, error: null }
    } catch (error) {
      items.value = previousItems
      console.error('deleteFromCart error:', error)
      return { success: false, error: error?.message || 'Failed to remove item from cart' }
    }
  }

  const initialize = async (userId = null) => {
    if (initPromise) {
      return initPromise
    }

    initPromise = (async () => {
      registerAuthListener()

      const resolvedUserId = await resolveUserId(userId)
      if (!resolvedUserId) {
        clearState()
        return false
      }

      if (
        initialized.value &&
        activeUserId.value === resolvedUserId &&
        subscription.value
      ) {
        return true
      }

      activeUserId.value = resolvedUserId
      await fetchCart({ userId: resolvedUserId, force: true })
      await subscribeToCart(resolvedUserId)
      initialized.value = true
      return true
    })()

    try {
      return await initPromise
    } finally {
      initPromise = null
    }
  }

  const init = async () => initialize()

  return {
    items,
    count,
    loading,
    initialized,
    lastFetchedAt,
    fetchCart,
    ensureFresh,
    addToCart,
    updateQuantity,
    deleteFromCart,
    initialize,
    init,
    clearState,
  }
})
