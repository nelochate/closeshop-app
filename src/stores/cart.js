import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/utils/supabase'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])
  const loading = ref(false)

  // ✅ Count of all quantities
  const count = computed(() =>
    items.value.reduce((sum, i) => sum + i.quantity, 0)
  )

  // ✅ Fetch cart items (with product join)
  async function fetchCart() {
    loading.value = true
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        items.value = []
        return
      }

      const { data, error } = await supabase
        .from('cart_items')
        .select(`
          id,
          quantity,
          product_id,
          product:products (
            id,
            prod_name,
            price,
            main_img_urls
          )
        `)
        .eq('user_id', user.id)

      if (error) throw error
      items.value = data || []
    } catch (err) {
      console.error('fetchCart error:', err)
      items.value = []
    } finally {
      loading.value = false
    }
  }

  // ✅ Add item
  async function addToCart(productId, qty = 1) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const { data: existing } = await supabase
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('product_id', productId)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('cart_items')
          .update({ quantity: existing.quantity + qty })
          .eq('id', existing.id)
      } else {
        await supabase.from('cart_items').insert({
          user_id: user.id,
          product_id: productId,
          quantity: qty,
        })
      }

      await fetchCart()
    } catch (err) {
      console.error('addToCart error:', err)
    }
  }

  // ✅ Delete item
  async function deleteFromCart(id) {
    try {
      const { error } = await supabase.from('cart_items').delete().eq('id', id)
      if (error) throw error
      items.value = items.value.filter(i => i.id !== id)
    } catch (err) {
      console.error('deleteFromCart error:', err)
    }
  }

  // ✅ Init
  async function init() {
    await fetchCart()
  }

  return { items, count, loading, fetchCart, addToCart, deleteFromCart, init }
})
