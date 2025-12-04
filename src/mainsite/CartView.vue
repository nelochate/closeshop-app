<script setup>
import { ref, onMounted, computed } from 'vue'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'
// Add router import
import { useRouter } from 'vue-router'
const router = useRouter()
const activeTab = ref('cart')
const loading = ref(true)
const cartItems = ref([]) // Replace cart store with local state
const selectedItems = ref([])
const shopSelection = ref({})
const collapsedShops = ref({}) // Track which shops are collapsed

// Toggle shop collapse state
const toggleShopCollapse = (shopId) => {
  collapsedShops.value[shopId] = !collapsedShops.value[shopId]
}

// Check if shop is collapsed
const isShopCollapsed = (shopId) => {
  return collapsedShops.value[shopId] === true
}

// Methods for navigation
const goToCart = () => {
  router.push({ name: '/cartview' })
}

const goHome = () => {
  router.push({ name: '/homepage' }) // Adjust to your home route name
}

const viewOrderDetails = () => {
  // Navigate to order details page - you need to have an orderId to pass
  // For now, we'll navigate to orders page
  router.push({ name: 'orders' })
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
      `
      )
      .eq('user_id', user.id) // Added filter for current user
      .order('created_at', { ascending: false })

    if (error) throw error
    cartItems.value = data || []
    
    // Initialize collapsed state for all shops (default: collapsed false)
    if (data && data.length > 0) {
      const shopIds = [...new Set(data.map(item => item.product?.shop?.id || item.product?.shop_id).filter(Boolean))]
      shopIds.forEach(shopId => {
        if (collapsedShops.value[shopId] === undefined) {
          collapsedShops.value[shopId] = false // Default to expanded
        }
      })
    }
    
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

// ✅ Enhanced Update quantity with variety support
const updateQuantity = async (itemId, newQty) => {
  if (newQty < 1) {
    // If quantity becomes 0 or negative, delete the item
    await deleteFromCart(itemId)
    return
  }

  try {
    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: newQty })
      .eq('id', itemId)

    if (error) throw error
    await fetchCart() // Refresh cart
  } catch (err) {
    console.error('Error updating quantity:', err)
  }
}

// ✅ Delete from cart
const deleteFromCart = async (cartItemId) => {
  try {
    const { error } = await supabase.from('cart_items').delete().eq('id', cartItemId)

    if (error) throw error
    await fetchCart() // Refresh cart
  } catch (err) {
    console.error('Error deleting from cart:', err)
    alert('Error deleting item from cart')
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

// ✅ Calculate shop subtotal
const getShopSubtotal = (shopId) => {
  const shopItems = groupedItems.value[shopId]?.items || []
  return shopItems.reduce((total, item) => {
    return total + (getItemPrice(item) * item.quantity)
  }, 0)
}

// ✅ Calculate shop total items
const getShopItemCount = (shopId) => {
  const shopItems = groupedItems.value[shopId]?.items || []
  return shopItems.reduce((total, item) => total + item.quantity, 0)
}

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

// ✅ Calculate subtotal for selected items
const selectedSubtotal = computed(() => {
  return selectedItems.value.reduce((total, itemId) => {
    const item = cartItems.value.find(i => i.id === itemId)
    if (item) {
      return total + (getItemPrice(item) * item.quantity)
    }
    return total
  }, 0)
})

// ✅ Calculate total items count
const totalItemsCount = computed(() => {
  return cartItems.value.reduce((total, item) => total + item.quantity, 0)
})

// ✅ Enhanced Checkout function with variety support
const checkoutSelected = () => {
  const selectedCartItems = cartItems.value.filter(i => selectedItems.value.includes(i.id))
  
  if (!selectedCartItems.length) {
    alert('Please select items to checkout')
    return
  }

  // Transform cart items to match purchase view format WITH VARIETY DATA
  const itemsForCheckout = selectedCartItems.map(item => ({
    id: item.product_id,
    product_id: item.product_id,
    name: getItemDisplayName(item),
    price: getItemPrice(item), // Use the correct price (variety or base)
    quantity: item.quantity,
    image: getItemImage(item), // Use correct image (variety or base)
    cart_item_id: item.id,
    shop_id: item.product?.shop?.id || item.product?.shop_id,
    product: item.product,
    // ADD VARIETY DATA FOR CHECKOUT
    selected_size: item.selected_size,
    selected_variety: item.selected_variety,
    variety_data: item.variety_data
  }))

  console.log('🛒 Items for checkout with varieties:', itemsForCheckout)

  // Navigate to purchase view with selected items
  router.push({
    name: 'purchaseview',
    state: {
      items: itemsForCheckout,
      fromCart: true // Flag to indicate coming from cart
    }
  })
}

// ✅ Back button function
const goBack = () => {
  router.back()
}

// Initialize
onMounted(async () => {
  loading.value = true
  await fetchCart()
  loading.value = false
})
</script>

<template>
  <!-- This is now the actual cart view, not the success view -->
  <v-app>
    <!-- App Bar -->
    <v-app-bar color="primary" flat dense>
      <v-app-bar-nav-icon @click="goBack">
        <v-icon color="white">mdi-arrow-left</v-icon>
      </v-app-bar-nav-icon>
      <v-app-bar-title class="text-h6 font-weight-bold text-white">
        Shopping Cart ({{ totalItemsCount }})
      </v-app-bar-title>
    </v-app-bar>

    <v-main>
      <!-- Loading State -->
      <div v-if="loading" class="d-flex justify-center align-center py-12">
        <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
      </div>

      <!-- Empty Cart -->
      <div v-else-if="cartItems.length === 0" class="d-flex flex-column align-center justify-center py-16">
        <v-icon size="120" color="grey-lighten-2" class="mb-4">mdi-cart-outline</v-icon>
        <div class="text-h5 text-grey-darken-2 font-weight-medium mb-2">Your cart is empty</div>
        <div class="text-body-1 text-grey mb-6">Add some products to get started</div>
        <v-btn color="primary" @click="goHome" rounded="lg">
          <v-icon left>mdi-store</v-icon>
          Continue Shopping
        </v-btn>
      </div>

      <!-- Cart Items -->
      <div v-else>
        <!-- Shop Groups -->
        <div v-for="(group, shopId) in groupedItems" :key="shopId" class="shop-group">
          <!-- Shop Header with Collapse Toggle -->
          <v-card flat class="shop-header" @click="toggleShopCollapse(shopId)" style="cursor: pointer;">
            <v-card-text class="d-flex align-center py-3">
              <!-- Shop Selection Checkbox -->
              <div @click.stop>
                <v-checkbox
                  :model-value="isShopAllSelected(shopId)"
                  :indeterminate="isShopPartialSelected(shopId)"
                  @click="selectAllInShop(shopId)"
                  hide-details
                  class="mr-2"
                ></v-checkbox>
              </div>
              
              <!-- Shop Logo -->
              <v-avatar size="36" class="mr-3">
                <v-img
                  v-if="group.shop.logo_url"
                  :src="group.shop.logo_url"
                  :alt="group.shop.business_name"
                ></v-img>
                <v-icon v-else color="primary">mdi-store</v-icon>
              </v-avatar>
              
              <!-- Shop Info -->
              <div class="flex-grow-1">
                <div class="d-flex justify-space-between align-center">
                  <div>
                    <div class="text-subtitle-1 font-weight-medium">{{ group.shop.business_name }}</div>
                    <div class="text-caption text-grey">
                      {{ getShopItemCount(shopId) }} item{{ getShopItemCount(shopId) !== 1 ? 's' : '' }} • ₱{{ getShopSubtotal(shopId).toFixed(2) }}
                    </div>
                  </div>
                  <div class="d-flex align-center">
                    <!-- Collapse/Expand Icon -->
                    <v-icon :class="{ 'rotate-180': isShopCollapsed(shopId) }" class="transition-all">
                      mdi-chevron-down
                    </v-icon>
                  </div>
                </div>
              </div>
            </v-card-text>
          </v-card>

          <!-- Items in this Shop (Collapsible) -->
          <v-expand-transition>
            <div v-show="!isShopCollapsed(shopId)">
              <v-card
                v-for="item in group.items"
                :key="item.id"
                class="cart-item mb-2"
                flat
              >
                <v-card-text class="pa-4">
                  <div class="d-flex align-start">
                    <!-- Item Selection Checkbox -->
                    <div @click.stop>
                      <v-checkbox
                        :model-value="selectedItems.includes(item.id)"
                        @click="toggleItemSelection(item.id, shopId)"
                        hide-details
                        class="mt-0 mr-3"
                      ></v-checkbox>
                    </div>

                    <!-- Product Image -->
                    <v-avatar size="80" rounded="lg" class="mr-4">
                      <v-img
                        :src="getItemImage(item)"
                        :alt="getItemDisplayName(item)"
                        cover
                      ></v-img>
                    </v-avatar>

                    <!-- Product Details -->
                    <div class="flex-grow-1">
                      <!-- Product Name & Price -->
                      <div class="d-flex justify-space-between mb-2">
                        <div>
                          <div class="text-body-1 font-weight-medium mb-1">
                            {{ getItemDisplayName(item) }}
                          </div>
                          <div class="text-h6 text-primary">
                            ₱{{ getItemPrice(item).toFixed(2) }}
                          </div>
                          <!-- Variant info -->
                          <div v-if="item.selected_variety || item.selected_size" class="text-caption text-grey mt-1">
                            <span v-if="item.selected_variety">{{ item.selected_variety }}</span>
                            <span v-if="item.selected_variety && item.selected_size"> • </span>
                            <span v-if="item.selected_size">Size: {{ item.selected_size }}</span>
                          </div>
                        </div>
                      </div>

                      <!-- Quantity Controls -->
                      <div class="d-flex align-center justify-space-between mt-3">
                        <div class="d-flex align-center">
                          <v-btn
                            icon
                            size="small"
                            :disabled="item.quantity <= 1"
                            @click="updateQuantity(item.id, item.quantity - 1)"
                          >
                            <v-icon>mdi-minus</v-icon>
                          </v-btn>
                          <div class="mx-3 text-body-1">{{ item.quantity }}</div>
                          <v-btn
                            icon
                            size="small"
                            @click="updateQuantity(item.id, item.quantity + 1)"
                          >
                            <v-icon>mdi-plus</v-icon>
                          </v-btn>
                        </div>
                        
                        <!-- Delete Button -->
                        <v-btn
                          icon
                          size="small"
                          color="error"
                          @click="deleteFromCart(item.id)"
                        >
                          <v-icon>mdi-trash-can-outline</v-icon>
                        </v-btn>
                      </div>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </v-expand-transition>

          <!-- Shop Footer (only shows when collapsed) -->
          <v-card v-if="isShopCollapsed(shopId)" flat class="shop-footer mt-2">
            <v-card-text class="py-3 text-center">
              <div class="text-caption text-grey">
                {{ group.items.length }} item{{ group.items.length !== 1 ? 's' : '' }} collapsed • 
                Click to expand
              </div>
            </v-card-text>
          </v-card>
        </div>

        <!-- Checkout Bar -->
        <div class="checkout-bar-wrapper">
          <v-bottom-navigation class="checkout-bar" fixed>
            <div class="d-flex align-center justify-space-between pa-4" style="width: 100%;">
              <div>
                <div class="text-subtitle-1 font-weight-bold">
                  ₱{{ selectedSubtotal.toFixed(2) }}
                </div>
                <div class="text-caption text-grey">
                  {{ selectedItems.length }} item{{ selectedItems.length !== 1 ? 's' : '' }} selected
                </div>
              </div>
              <div class="d-flex gap-2">
                <v-btn
                  v-if="selectedItems.length > 0"
                  color="error"
                  variant="text"
                  @click="deleteSelectedItems"
                  :disabled="loading"
                >
                  Delete
                </v-btn>
                <v-btn
                  color="primary"
                  @click="checkoutSelected"
                  :disabled="selectedItems.length === 0 || loading"
                  :loading="loading"
                >
                  Checkout
                </v-btn>
              </div>
            </div>
          </v-bottom-navigation>
        </div>
      </div>
    </v-main>

    <!-- Bottom Navigation -->
    <BottomNav :activeTab="activeTab" />
  </v-app>
</template>

<style scoped>
.app-bar {
  padding-top: 12px;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}

.cart-item {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.cart-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.shop-header {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  margin-top: 12px;
  transition: all 0.3s ease;
}

.shop-header:hover {
  background: #e9ecef;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
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
  border-top: 1px solid #e0e0e0;
}

.checkout-bar-wrapper {
  padding-bottom: 120px; /* Space for checkout bar */
}

/* Rotate animation for collapse icon */
.rotate-180 {
  transform: rotate(180deg);
}

.transition-all {
  transition: all 0.3s ease;
}

/* Improved scroll area */
.v-main {
  padding-bottom: 120px;
}

/* Mobile responsiveness */
@media (max-width: 600px) {
  .shop-header .text-subtitle-1 {
    font-size: 0.9rem;
  }
  
  .cart-item .v-avatar {
    width: 70px !important;
    height: 70px !important;
  }
  
  .v-card-text {
    padding: 12px !important;
  }
  
  .checkout-bar .v-btn {
    min-width: 80px;
  }
}

/* Add smooth transitions for collapsed sections */
.v-expand-transition-enter-active,
.v-expand-transition-leave-active {
  transition: all 0.3s ease;
}

.v-expand-transition-enter-from,
.v-expand-transition-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>