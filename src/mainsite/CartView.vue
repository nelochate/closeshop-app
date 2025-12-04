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
const shopGroups = ref({}) // Track items grouped by shop

// ✅ Fetch cart on mount
onMounted(async () => {
  loading.value = true
  await cart.fetchCart()
  // Group items by shop after fetching
  groupItemsByShop()
  loading.value = false
})

// ✅ Group items by shop
const groupItemsByShop = () => {
  const groups = {}

  cart.items.forEach(item => {
    const shopId = item.product?.shop?.id || 'unknown'

    if (!groups[shopId]) {
      groups[shopId] = {
        shop: item.product?.shop || {
          id: shopId,
          business_name: 'Unknown Shop',
          logo_url: null
        },
        items: []
      }
    }

    groups[shopId].items.push(item)
  })

  shopGroups.value = groups
}

// Watch for cart changes to update grouping
watch(() => cart.items, () => {
  groupItemsByShop()
}, { deep: true })

// ✅ Delete item
const deleteItem = async (id) => {
  await cart.deleteFromCart(id)
  selectedItems.value = selectedItems.value.filter(i => i !== id)
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

// ✅ Get item subtotal
const getItemSubtotal = (item) => {
  return (item.product?.price || 0) * item.quantity
}

// ✅ Get total for selected items
const getTotalSelectedAmount = computed(() => {
  return selectedItems.value.reduce((total, itemId) => {
    const item = cart.items.find(i => i.id === itemId)
    return total + getItemSubtotal(item || {})
  }, 0)
})

// ✅ Checkout selected - FIXED VERSION
const checkoutSelected = () => {
  const selectedCartItems = cart.items.filter(i => selectedItems.value.includes(i.id))

  if (!selectedCartItems.length) {
    alert('Please select items to checkout')
    return
  }

  // Save to localStorage as backup
  localStorage.setItem('selectedCartItemIds', JSON.stringify(selectedItems.value))
  
  // Save full item data to localStorage as backup
  const itemsForCheckout = selectedCartItems.map(item => ({
    id: item.product_id,
    product_id: item.product_id,
    name: item.product?.prod_name || 'Unnamed Product',
    price: item.product?.price || 0,
    quantity: item.quantity,
    image: (typeof item.product?.main_img_urls === 'string'
      ? JSON.parse(item.product.main_img_urls)[0]
      : item.product?.main_img_urls?.[0]) || '/placeholder.png',
    cart_item_id: item.id, // This is the cart_item ID from database
    shop_id: item.product?.shop?.id,
    product: item.product,
    shop: item.product?.shop
  }))
  
  localStorage.setItem('cart_checkout_items', JSON.stringify({
    items: itemsForCheckout,
    selectedCartItemIds: selectedItems.value,
    timestamp: new Date().toISOString()
  }))

  // Navigate with both state AND query parameters
  router.push({
    name: 'purchaseview',
    query: {
      cartItemIds: JSON.stringify(selectedItems.value),
      source: 'cart',
      timestamp: Date.now() // Add timestamp to prevent caching
    },
    state: {
      items: itemsForCheckout,
      selectedCartItemIds: selectedItems.value,
      fromCart: true
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

// ✅ Clear all selections
const clearSelections = () => {
  selectedItems.value = []
}

// ✅ Debug function
const debugCart = () => {
  console.log('=== CART DEBUG ===')
  console.log('Selected Items:', selectedItems.value)
  console.log('Cart Items:', cart.items.map(item => ({
    id: item.id,
    product_id: item.product_id,
    product_name: item.product?.prod_name
  })))
  console.log('Selected Cart Items:', cart.items.filter(i => selectedItems.value.includes(i.id)))
}
</script>

<template>
  <v-app>
    <!-- Header with back button -->
    <v-app-bar class="app-bar" flat color="#3f83c7" dark>
      <v-btn icon @click="goBack" class="mr-2">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="font-weight-bold">Cart</v-toolbar-title>
      <v-spacer />
      <v-btn
        v-if="selectedItems.length > 0"
        variant="text"
        color="white"
        @click="clearSelections"
        size="small"
      >
        Clear
      </v-btn>
      <!-- Debug button (remove in production) -->
      <v-btn
        v-if="false"
        variant="text"
        color="white"
        @click="debugCart"
        size="small"
        class="ml-2"
      >
        Debug
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container fluid class="container pb-12">
        <!-- Loader -->
        <div v-if="loading" class="d-flex justify-center align-center pa-12">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <!-- Empty State -->
        <div v-else-if="cart.items.length === 0" class="content">
          <v-icon size="80" color="grey-lighten-1" class="mb-4">mdi-cart-outline</v-icon>
          <h2 class="text-h6 font-weight-bold mb-2">Your cart is empty</h2>
          <p class="text-body-2 text-grey mb-4">Add items from shops to get started</p>
          <v-btn color="primary" @click="goBack" class="rounded-lg">
            Continue Shopping
          </v-btn>
        </div>

        <!-- Cart Items Grouped by Shop -->
        <div v-else>
          <div v-for="(group, shopId) in shopGroups" :key="shopId" class="mb-4">
            <!-- Shop Header -->
            <v-card
              class="shop-header mb-3 rounded-lg"
              variant="outlined"
              :style="{ borderLeft: '4px solid #3f83c7' }"
            >
              <v-card-text class="pa-3">
                <div class="d-flex align-center justify-space-between">
                  <!-- Shop Info (Clickable) -->
                  <div
                    class="d-flex align-center"
                    :style="{ cursor: shopId !== 'unknown' ? 'pointer' : 'default' }"
                    @click="goToShop(shopId)"
                  >
                    <v-avatar size="36" class="mr-3 elevation-1">
                      <v-img
                        v-if="group.shop.logo_url"
                        :src="group.shop.logo_url"
                        alt="Shop Logo"
                        cover
                      />
                      <v-icon v-else color="primary">mdi-store</v-icon>
                    </v-avatar>
                    <div>
                      <div class="font-weight-bold text-body-1">{{ group.shop.business_name }}</div>
                      <div class="text-caption text-grey">{{ group.items.length }} item(s)</div>
                    </div>
                  </div>

                  <!-- Shop Actions -->
                  <div class="d-flex align-center gap-2">
                    <v-checkbox
                      v-model="selectedItems"
                      :value="shopId"
                      @click.stop="toggleShopSelection(shopId)"
                      density="compact"
                      color="primary"
                      hide-details
                      class="mr-1"
                      :indeterminate="isShopPartialSelected(shopId)"
                    >
                      <template #label>
                        <v-tooltip location="top">
                          <template #activator="{ props }">
                            <v-icon
                              v-bind="props"
                              size="18"
                              :color="selectedItems.includes(shopId) ? 'primary' : 'grey'"
                            >
                              mdi-checkbox-multiple-marked
                            </v-icon>
                          </template>
                          <span>Select all from this shop</span>
                        </v-tooltip>
                      </template>
                    </v-checkbox>

                    <v-btn
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      @click="deleteSelectedFromShop(shopId)"
                      :disabled="!group.items.some(item => selectedItems.includes(item.id))"
                    >
                      <v-icon size="18">mdi-trash-can-outline</v-icon>
                      <v-tooltip location="top">
                        <span>Delete selected from shop</span>
                      </v-tooltip>
                    </v-btn>
                  </div>
                </div>
              </v-card-text>
            </v-card>

            <!-- Shop Items -->
            <div v-for="item in group.items" :key="item.id" class="mb-3">
              <v-card class="cart-item rounded-lg" variant="outlined">
                <v-card-text class="pa-3">
                  <div class="d-flex align-start">
                    <!-- Checkbox -->
                    <div class="mr-3 mt-1">
                      <v-checkbox
                        v-model="selectedItems"
                        :value="item.id"
                        density="compact"
                        color="primary"
                        hide-details
                      />
                    </div>

                    <!-- Product Image -->
                    <v-img
                      :src="(typeof item.product?.main_img_urls === 'string'
                        ? JSON.parse(item.product.main_img_urls)[0]
                        : item.product?.main_img_urls?.[0]) || '/placeholder.png'"
                      width="80"
                      height="80"
                      class="rounded-lg mr-3"
                      cover
                    />

                    <!-- Product Details -->
                    <div class="flex-grow-1">
                      <div class="d-flex justify-space-between align-start">
                        <div>
                          <h3 class="font-weight-medium text-body-1 mb-1">
                            {{ item.product?.prod_name || 'Unnamed Product' }}
                          </h3>
                          <div class="text-primary font-weight-bold mb-2">
                            ₱{{ item.product?.price?.toFixed(2) || '0.00' }}
                          </div>
                          <!-- Show variety/size if available -->
                          <div v-if="item.selected_variety || item.selected_size" class="text-caption text-grey mb-1">
                            <span v-if="item.selected_variety">{{ item.selected_variety }}</span>
                            <span v-if="item.selected_variety && item.selected_size"> • </span>
                            <span v-if="item.selected_size">Size: {{ item.selected_size }}</span>
                          </div>
                        </div>
                        <v-btn
                          icon
                          variant="text"
                          color="error"
                          size="small"
                          @click="deleteItem(item.id)"
                        >
                          <v-icon>mdi-delete</v-icon>
                        </v-btn>
                      </div>

                      <!-- Quantity Controls -->
                      <div class="d-flex align-center justify-space-between mt-3">
                        <div class="d-flex align-center">
                          <v-btn
                            icon
                            size="small"
                            variant="outlined"
                            color="primary"
                            @click="updateQuantity(item.id, item.quantity - 1)"
                            :disabled="item.quantity <= 1"
                            density="compact"
                          >
                            <v-icon size="16">mdi-minus</v-icon>
                          </v-btn>

                          <span class="mx-3 font-weight-bold">{{ item.quantity }}</span>

                          <v-btn
                            icon
                            size="small"
                            variant="outlined"
                            color="primary"
                            @click="updateQuantity(item.id, item.quantity + 1)"
                            density="compact"
                          >
                            <v-icon size="16">mdi-plus</v-icon>
                          </v-btn>
                        </div>

                        <div class="text-right">
                          <div class="text-caption text-grey">Subtotal</div>
                          <div class="font-weight-bold text-primary">
                            ₱{{ getItemSubtotal(item).toFixed(2) }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>

            <!-- Shop Total (if items selected) -->
            <v-card
              v-if="group.items.some(item => selectedItems.includes(item.id))"
              class="mt-2 rounded-lg"
              color="primary-lighten-5"
              variant="outlined"
            >
              <v-card-text class="pa-2 text-center">
                <span class="text-caption font-weight-medium">
                  Shop Subtotal: <span class="text-primary">₱{{
                    group.items
                      .filter(item => selectedItems.includes(item.id))
                      .reduce((sum, item) => sum + getItemSubtotal(item), 0)
                      .toFixed(2)
                  }}</span>
                </span>
              </v-card-text>
            </v-card>
          </div>
        </div>
      </v-container>
    </v-main>

    <!-- Checkout Bar -->
    <v-sheet
      v-if="cart.items.length > 0 && selectedItems.length > 0"
      elevation="6"
      class="checkout-bar pa-3 d-flex align-center justify-space-between"
    >
      <div class="d-flex flex-column">
        <div class="font-weight-bold text-body-1">
          Total: ₱{{ getTotalSelectedAmount.toFixed(2) }}
        </div>
        <div class="text-caption text-grey">
          {{ selectedItems.length }} item(s) selected
        </div>
      </div>
      <v-btn
        color="primary"
        class="rounded-lg px-6"
        @click="checkoutSelected"
        :disabled="selectedItems.length === 0"
      >
        Checkout
      </v-btn>
    </v-sheet>

    <!-- Bottom Navigation -->
    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
.app-bar {
  padding-top: 12px;
  position: sticky;
  top: 0;
  z-index: 1000;
}

.container {
  margin-top: 16px;
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
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.cart-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}

.checkout-bar {
  position: fixed;
  bottom: 64px;
  left: 0;
  right: 0;
  background: #fff;
  z-index: 1100;
  border-top: 1px solid #e0e0e0;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.08);
}

/* Safe area for notched phones */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .checkout-bar {
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .checkout-bar {
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .checkout-bar .v-btn {
    width: 100%;
  }

  .cart-item .v-img {
    width: 70px !important;
    height: 70px !important;
  }
}

/* Animation for quantity changes */
.quantity-change {
  animation: pulse 0.3s ease;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}

/* Scrollbar styling */
.v-main ::-webkit-scrollbar {
  width: 6px;
}

.v-main ::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.v-main ::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.v-main ::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>