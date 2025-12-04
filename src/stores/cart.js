import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/utils/supabase'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])
  const loading = ref(false)

  // ✅ Count of all quantities
  const count = computed(() => items.value.reduce((sum, i) => sum + i.quantity, 0))

  // ✅ Fetch cart items (with product join)
  async function fetchCart() {
    loading.value = true
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        items.value = []
        return
      }

      const { data, error } = await supabase
        .from('cart_items')
        .select(
          `
    *,
    product:products(
      *,
      shop:shops(
        id,
        business_name,
        logo_url
      )
    )
  `,
        )
        .eq('user_id', user.id)

      if (error) throw error
      items.value = data.map((item) => ({
        ...item,
        product: {
          ...item.product,
          shop: item.product?.shop || null,
        },
      }))
    } catch (err) {
      console.error('fetchCart error:', err)
      items.value = []
    } finally {
      loading.value = false
    }
  }

  // ✅ Add item
  // Add to cart with variety support
  const addToCart = async (
    productId,
    quantity,
    selectedSize = null,
    selectedVariety = null,
    varietyData = null,
  ) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        return { success: false, error: 'User not authenticated' }
      }

      // Build query for checking existing items
      let query = supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('product_id', productId)

      if (selectedSize) {
        query = query.eq('selected_size', selectedSize)
      } else {
        query = query.is('selected_size', null)
      }

      if (selectedVariety) {
        query = query.eq('selected_variety', selectedVariety)
      } else {
        query = query.is('selected_variety', null)
      }

      const { data: existingItems, error: checkError } = await query

      if (checkError) {
        console.error('❌ Error checking existing items:', checkError)
        return { success: false, error: checkError.message }
      }

      if (existingItems && existingItems.length > 0) {
        // Update existing item
        const existingItem = existingItems[0]
        const newQuantity = existingItem.quantity + quantity

        const { error: updateError } = await supabase
          .from('cart_items')
          .update({
            quantity: newQuantity,
            variety_data: varietyData,
          })
          .eq('id', existingItem.id)

        if (updateError) {
          console.error('❌ Error updating cart item:', updateError)
          return { success: false, error: updateError.message }
        }
      } else {
        // Insert new item
        const { error: insertError } = await supabase.from('cart_items').insert({
          user_id: user.id,
          product_id: productId,
          quantity: quantity,
          selected_size: selectedSize,
          selected_variety: selectedVariety,
          variety_data: varietyData,
        })

        if (insertError) {
          console.error('❌ Error inserting cart item:', insertError)
          return { success: false, error: insertError.message }
        }
      }

      // Refresh cart
      await fetchCart()
      return { success: true, error: null }
    } catch (err) {
      console.error('❌ Error in addToCart:', err)
      return {
        success: false,
        error: err.message || 'An unexpected error occurred',
      }
    }
  }

  // ✅ Delete item
  async function deleteFromCart(id) {
    try {
      const { error } = await supabase.from('cart_items').delete().eq('id', id)
      if (error) throw error
      items.value = items.value.filter((i) => i.id !== id)
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
