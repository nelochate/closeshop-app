<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useCartStore } from '@/stores/cart'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'
import { useRouter } from 'vue-router'

const router = useRouter()
const activeTab = ref('cart')
const cart = useCartStore()

const loading = ref(true)
const selectedItems = ref([])
const shopSelection = ref({})


// Methods for navigation
const goToCart = () => {
  router.push({ name: '/cartview' })
}

const goHome = () => {
  router.push({ name: '/homepage' }) // Adjust to your home route name
}

const viewOrderDetails = () => {
  // Navigate to order details page
  router.push({ 
    name: 'orderdetails', 
    params: { id: orderId.value } 
  })
}
// ✅ Fetch cart directly - UPDATED TO INCLUDE VARIETY DATA
const fetchCart = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      cartItems.value = []
      return
    }

    const { data, error } = await supabase
      .from('cart_items')
      .select(
        `
        *,
        product:products (
          *,
          shop:shops (*)
        )
      `,
      )
      .order('created_at', { ascending: false })

    if (error) throw error
    cartItems.value = data || []
    
    // Debug: Log cart items to see variety data
    console.log('🛒 Cart items loaded:', data)
    data?.forEach(item => {
      console.log('📦 Cart item:', {
        id: item.id,
        product_name: item.product?.prod_name,
        selected_size: item.selected_size,
        selected_variety: item.selected_variety,
        variety_data: item.variety_data
      })
    })
  } catch (err) {
    console.error('Error fetching cart:', err)
    cartItems.value = []
  }
}

// ✅ Update quantity (+ / -)
const updateQuantity = async (itemId, newQty) => {
  if (newQty < 1) {
    // If quantity becomes 0, delete the item
    await deleteItem(itemId)
    return
  }

  const item = cart.items.find(i => i.id === itemId)
  if (!item) return

  try {
    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: newQty })
      .eq('id', itemId)

    if (error) throw error

    // Update store after success
    await cart.fetchCart()
  } catch (err) {
    console.error('updateQuantity error:', err)
  }
}

// ✅ Group items by shop
const groupedItems = computed(() => {
  const groups = {}

  cartItems.value.forEach((item) => {
    const shop = item.product?.shop || {}
    const shopId = shop?.id || item.product?.shop_id || 'unknown'
    const shopName = shop?.business_name || 'Unknown Shop'

    if (!groups[shopId]) {
      groups[shopId] = {
        shop: {
          id: shopId,
          business_name: shopName,
          ...shop,
        },
        items: [],
      }
    }
    groups[shopId].items.push(item)
  })

  return groups
})

// ✅ Select all items in a shop
const selectAllInShop = (shopId) => {
  const shopItems = groupedItems.value[shopId]?.items || []
  const shopItemIds = shopItems.map((item) => item.id)

  const allSelected = shopItemIds.every((id) => selectedItems.value.includes(id))

  if (allSelected) {
    selectedItems.value = selectedItems.value.filter((id) => !shopItemIds.includes(id))
    shopSelection.value[shopId] = []
  } else {
    const newSelections = shopItemIds.filter((id) => !selectedItems.value.includes(id))
    selectedItems.value = [...selectedItems.value, ...newSelections]
    shopSelection.value[shopId] = shopItemIds
  }
}

// ✅ Toggle item selection
const toggleItemSelection = (itemId, shopId) => {
  const index = selectedItems.value.indexOf(itemId)

  if (index > -1) {
    selectedItems.value.splice(index, 1)
    if (shopSelection.value[shopId]) {
      shopSelection.value[shopId] = shopSelection.value[shopId].filter((id) => id !== itemId)
    }
  } else {
    selectedItems.value.push(itemId)
    if (!shopSelection.value[shopId]) {
      shopSelection.value[shopId] = []
    }
    shopSelection.value[shopId].push(itemId)
  }
}

// ✅ Check if all items in shop are selected
const isShopAllSelected = (shopId) => {
  const shopItems = groupedItems.value[shopId]?.items || []
  if (shopItems.length === 0) return false
  return shopItems.every((item) => selectedItems.value.includes(item.id))
}

// ✅ Check if any items in shop are selected
const isShopPartialSelected = (shopId) => {
  const shopItems = groupedItems.value[shopId]?.items || []
  if (shopItems.length === 0) return false
  return (
    shopItems.some((item) => selectedItems.value.includes(item.id)) && !isShopAllSelected(shopId)
  )
}

// ✅ Delete selected items
const deleteSelectedItems = async () => {
  if (selectedItems.value.length === 0) {
    alert('Please select items to delete')
    return
  }

  try {
    const { error } = await supabase.from('cart_items').delete().in('id', selectedItems.value)

    if (error) throw error

    await fetchCart()
    selectedItems.value = []
    Object.keys(shopSelection.value).forEach((shopId) => {
      shopSelection.value[shopId] = []
    })
  } catch (err) {
    console.error('Error deleting items:', err)
    alert('Error deleting items')
  }
}

// ✅ Get display price for item (considers variety)
const getItemPrice = (item) => {
  // If variety data exists and has price, use variety price
  if (item.variety_data && item.variety_data.price !== undefined && item.variety_data.price !== null) {
    return item.variety_data.price
  }
  // Otherwise use product base price
  return item.product?.price || 0
}

// ✅ Get display name for item (includes variety info)
const getItemDisplayName = (item) => {
  let name = item.product?.prod_name || 'Unnamed Product'
  
  // Add variety name if exists
  if (item.selected_variety) {
    name += ` - ${item.selected_variety}`
  }
  
  // Add size if exists
  if (item.selected_size) {
    name += ` (${item.selected_size})`
  }
  
  return name
}

// ✅ Get display image for item (uses variety image if available)
const getItemImage = (item) => {
  // If variety has images, use the first variety image
  if (item.variety_data?.images && item.variety_data.images.length > 0) {
    return item.variety_data.images[0]
  }
  
  // Otherwise use product main image
  if (typeof item.product?.main_img_urls === 'string') {
    try {
      const parsed = JSON.parse(item.product.main_img_urls)
      return parsed?.[0] || '/placeholder.png'
    } catch {
      return item.product.main_img_urls || '/placeholder.png'
    }
  }
  
  return item.product?.main_img_urls?.[0] || '/placeholder.png'
}

// ✅ Enhanced Checkout function with variety support
const checkoutSelected = () => {
  const selectedCartItems = cart.items.filter(i => selectedItems.value.includes(i.id))

  if (!selectedCartItems.length) {
    alert('Please select items to checkout')
    return
  }

  // Save to localStorage as backup
  localStorage.setItem('selectedCartItemIds', JSON.stringify(selectedItems.value))
  
  // Navigate with query parameters
  router.push({
    name: 'purchaseview',
    query: {
      cartItemIds: JSON.stringify(selectedItems.value),
      source: 'cart'
    }
  })
}

const goBack = () => {
  router.back()
}

// ✅ Go to shop page
const goToShop = (shopId) => {
  if (shopId && shopId !== 'unknown') {
    router.push(`/shop/${shopId}`)
  }
}

// ✅ Select/Deselect all items in a shop
const toggleShopSelection = (shopId) => {
  const shop = shopGroups.value[shopId]
  if (!shop) return

  const shopItemIds = shop.items.map(item => item.id)
  const allSelected = shopItemIds.every(id => selectedItems.value.includes(id))

  if (allSelected) {
    // Deselect all items in this shop
    selectedItems.value = selectedItems.value.filter(id => !shopItemIds.includes(id))
  } else {
    // Select all items in this shop
    const toAdd = shopItemIds.filter(id => !selectedItems.value.includes(id))
    selectedItems.value = [...selectedItems.value, ...toAdd]
  }
}

// ✅ Check if all items in a shop are selected
const isShopAllSelected = (shopId) => {
  const shop = shopGroups.value[shopId]
  if (!shop || shop.items.length === 0) return false

  return shop.items.every(item => selectedItems.value.includes(item.id))
}

// ✅ Check if some items in a shop are selected
const isShopPartialSelected = (shopId) => {
  const shop = shopGroups.value[shopId]
  if (!shop || shop.items.length === 0) return false

  const selectedCount = shop.items.filter(item => selectedItems.value.includes(item.id)).length
  return selectedCount > 0 && selectedCount < shop.items.length
}

// ✅ Delete selected items from a shop
const deleteSelectedFromShop = (shopId) => {
  const shop = shopGroups.value[shopId]
  if (!shop) return

  const shopSelectedItems = shop.items.filter(item => selectedItems.value.includes(item.id))
  if (shopSelectedItems.length === 0) return

  if (confirm(`Delete ${shopSelectedItems.length} item(s) from ${shop.shop.business_name}?`)) {
    shopSelectedItems.forEach(item => deleteItem(item.id))
  }
}
</script>

<template>
  <v-container class="d-flex flex-column align-center justify-center text-center py-8">
    <!-- Success Icon -->
    <v-icon color="success" size="80" class="mb-4">
      mdi-check-circle-outline
    </v-icon>
    
    <!-- Success Message -->
    <h2 class="text-h5 font-weight-bold mb-2">Order Placed Successfully!</h2>
    <p class="text-body-1 mb-6">
      Your order has been confirmed. You'll receive a confirmation email shortly.
    </p>
    
    <!-- Order Details -->
    <v-card class="mb-6" width="100%" max-width="400">
      <v-card-text>
        <div class="text-body-2 mb-2">
          Order #: <strong>{{ orderId }}</strong>
        </div>
        <div class="text-body-2 mb-2">
          Total: <strong>₱{{ totalAmount.toFixed(2) }}</strong>
        </div>
        <div class="text-body-2">
          Estimated Delivery: <strong>{{ estimatedDelivery }}</strong>
        </div>
      </v-card-text>
    </v-card>
    
    <!-- Action Buttons -->
    <div class="d-flex flex-column gap-3" style="width: 100%; max-width: 400px;">
      <!-- Go to Cart Button -->
      <v-btn
        color="primary"
        variant="outlined"
        @click="goToCart"
        class="rounded-lg py-4"
        block
      >
        <v-icon left>mdi-cart</v-icon>
        Go to Cart
      </v-btn>
      
      <!-- Continue Shopping Button -->
      <v-btn
        color="primary"
        @click="goHome"
        class="rounded-lg py-4"
        block
      >
        <v-icon left>mdi-home</v-icon>
        Go to Home
      </v-btn>
      
      <!-- View Order Details Button -->
      <v-btn
        color="secondary"
        variant="text"
        @click="viewOrderDetails"
        class="rounded-lg py-3"
        block
      >
        <v-icon left>mdi-file-document-outline</v-icon>
        View Order Details
      </v-btn>
    </div>
  </v-container>
</template>

<style scoped>
.app-bar {
  padding-top: 12px;
  position: sticky;
  top: 0;
  z-index: 1000;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 24px;
  min-height: 60vh;
}

.shop-header {
  background: #f8fafc;
  transition: background 0.2s ease;
}

.shop-header:hover {
  background: #f0f7ff;
}

.cart-item {
  background: #fff;
}

.shop-header {
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
  margin-top: 8px;
}

.shop-group {
  margin-bottom: 16px;
}

.shop-footer {
  background: #f8f9fa;
  border: 1px dashed #dee2e6;
  border-radius: 8px;
}

.checkout-bar {
  position: fixed;
  bottom: 64px;
  left: 0;
  right: 0;
  background: #fff;
  z-index: 1100;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
}
</style>
