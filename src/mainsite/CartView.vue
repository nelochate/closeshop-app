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
  <v-app>
    <!-- Header with Back Button -->
    <v-app-bar class="app-bar" flat color="#3f83c7" dark>
      <!-- Back Button -->
      <v-btn icon @click="goBack" class="mr-2">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      
      <v-toolbar-title><strong>Cart</strong></v-toolbar-title>
      <v-spacer />
      <v-btn
        v-if="selectedItems.length > 0"
        icon
        color="white"
        @click="deleteSelectedItems"
        title="Delete Selected"
      >
        <v-icon>mdi-delete</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <!-- Loader -->
        <div v-if="loading" class="d-flex justify-center pa-6">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <!-- Empty State -->
        <div v-else-if="cartItems.length === 0" class="content">
          <h2 class="text-h6 font-weight-bold">Your cart is empty</h2>
          <v-icon size="64" color="grey">mdi-cart-outline</v-icon>
          <v-btn 
            color="primary" 
            class="mt-4" 
            @click="goBack"
          >
            <v-icon left>mdi-arrow-left</v-icon>
            Continue Shopping
          </v-btn>
        </div>

        <!-- Cart Items Grouped by Shop -->
        <div v-else>
          <v-list lines="two">
            <div v-for="(group, shopId) in groupedItems" :key="shopId" class="shop-group">
              <!-- Shop Header -->
              <v-list-item class="shop-header">
                <template #prepend>
                  <v-checkbox
                    :model-value="isShopAllSelected(shopId)"
                    :indeterminate="isShopPartialSelected(shopId)"
                    @click="selectAllInShop(shopId)"
                    density="compact"
                    color="primary"
                  />
                </template>
                <v-list-item-title class="font-weight-bold">
                  {{ group.shop.business_name }}
                </v-list-item-title>
                <template #append>
                  <v-chip size="small" variant="outlined">
                    {{ group.items.length }} item{{ group.items.length > 1 ? 's' : '' }}
                  </v-chip>
                </template>
              </v-list-item>

              <!-- Shop Items -->
              <v-list-item
                v-for="item in group.items"
                :key="item.id"
                class="cart-item mb-2 rounded-lg elevation-1"
              >
                <template #prepend>
                  <v-checkbox
                    :model-value="selectedItems.includes(item.id)"
                    @click="toggleItemSelection(item.id, shopId)"
                    density="compact"
                    color="primary"
                  />
                  <v-img
                    :src="getItemImage(item)"
                    width="70"
                    height="70"
                    class="rounded-lg ml-2"
                    cover
                  />
                </template>

                <v-list-item-title class="font-weight-medium ms-3">
                  {{ getItemDisplayName(item) }}
                </v-list-item-title>
                
                <!-- Display variety and size information -->
                <v-list-item-subtitle class="ms-3">
                  <div v-if="item.selected_variety || item.selected_size" class="text-caption">
                    <span v-if="item.selected_variety" class="text-primary">
                      {{ item.selected_variety }}
                    </span>
                    <span v-if="item.selected_variety && item.selected_size"> • </span>
                    <span v-if="item.selected_size">
                      Size: {{ item.selected_size }}
                    </span>
                  </div>
                  <div class="text-body-2 font-weight-bold mt-1">
                    ₱{{ getItemPrice(item).toFixed(2) }}
                  </div>
                </v-list-item-subtitle>

                <template #append>
                  <div class="d-flex flex-column align-end">
                    <div class="d-flex align-center mt-1">
                      <v-btn
                        icon
                        size="small"
                        variant="outlined"
                        color="primary"
                        @click="updateQuantity(item.id, item.quantity - 1)"
                      >
                        <v-icon small>mdi-minus</v-icon>
                      </v-btn>

                      <span class="mx-2">{{ item.quantity }}</span>

                      <v-btn
                        icon
                        size="small"
                        variant="outlined"
                        color="primary"
                        @click="updateQuantity(item.id, item.quantity + 1)"
                      >
                        <v-icon small>mdi-plus</v-icon>
                      </v-btn>
                    </div>

                    <div class="font-weight-bold text-primary mt-2">
                      ₱{{ (getItemPrice(item) * item.quantity).toFixed(2) }}
                    </div>
                    <v-btn
                      icon
                      variant="text"
                      color="red"
                      @click="deleteFromCart(item.id)"
                      size="small"
                    >
                      <v-icon small>mdi-delete</v-icon>
                    </v-btn>
                  </div>
                </template>
              </v-list-item>

              <v-divider class="my-4" v-if="Object.keys(groupedItems).length > 1" />
            </div>
          </v-list>
        </div>
      </v-container>
    </v-main>

    <!-- Checkout Bar -->
    <v-sheet
      v-if="cartItems.length"
      elevation="6"
      class="checkout-bar pa-3 d-flex align-center justify-space-between"
    >
      <div class="d-flex align-center">
        <v-checkbox
          :model-value="selectedItems.length === cartItems.length"
          :indeterminate="selectedItems.length > 0 && selectedItems.length < cartItems.length"
          @click="
            selectedItems.length === cartItems.length
              ? (selectedItems = [])
              : (selectedItems = cartItems.map((i) => i.id))
          "
          density="compact"
          color="primary"
          class="mr-2"
        />
        <div class="font-weight-bold">
          Total: ₱{{
            cartItems
              .filter((i) => selectedItems.includes(i.id))
              .reduce((sum, i) => sum + (getItemPrice(i) * i.quantity), 0)
              .toFixed(2)
          }}
        </div>
      </div>
      <v-btn color="primary" class="rounded-lg" @click="checkoutSelected">
        Checkout ({{ selectedItems.length }})
      </v-btn>
    </v-sheet>

    <!-- Bottom Navigation -->
    <BottomNav v-model="activeTab" />
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
}

.shop-header {
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
  margin-top: 8px;
}

.shop-group {
  margin-bottom: 16px;
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