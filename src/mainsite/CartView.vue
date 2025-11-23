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

// ✅ Fetch cart directly
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
  } catch (err) {
    console.error('Error fetching cart:', err)
    cartItems.value = []
  }
}

// ✅ Add to cart function (for your productdetail.vue)
const addToCart = async (productId, quantity = 1) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      alert('Please login to add to cart')
      return
    }

    // Check if item already exists in cart
    const { data: existingItem } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .single()

    if (existingItem) {
      // Update quantity if item exists
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: existingItem.quantity + quantity })
        .eq('id', existingItem.id)

      if (error) throw error
    } else {
      // Add new item to cart
      const { error } = await supabase.from('cart_items').insert({
        user_id: user.id,
        product_id: productId,
        quantity: quantity,
      })

      if (error) throw error
    }

    await fetchCart() // Refresh cart
    alert('Product added to cart!')
  } catch (err) {
    console.error('Error adding to cart:', err)
    alert('Error adding product to cart')
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

// ✅ Update quantity
// ✅ Enhanced Update quantity with auto-delete
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



// Initialize
onMounted(async () => {
  loading.value = true
  await fetchCart()
  loading.value = false
})


// ✅ Enhanced Checkout function
// ✅ Enhanced Checkout function with shop_id
const checkoutSelected = () => {
  const selectedCartItems = cartItems.value.filter(i => selectedItems.value.includes(i.id))
  
  if (!selectedCartItems.length) {
    alert('Please select items to checkout')
    return
  }

  // Transform cart items to match purchase view format
  const itemsForCheckout = selectedCartItems.map(item => ({
    id: item.product_id,
    product_id: item.product_id,
    name: item.product?.prod_name || 'Unnamed Product',
    price: item.product?.price || 0,
    quantity: item.quantity,
    image: (typeof item.product?.main_img_urls === 'string'
      ? JSON.parse(item.product.main_img_urls)[0]
      : item.product?.main_img_urls?.[0]) || '/placeholder.png',
    cart_item_id: item.id, // Keep reference to cart item for cleanup
    shop_id: item.product?.shop?.id || item.product?.shop_id, // CRITICAL: Include shop_id
    product: item.product // Include full product data for shop info
  }))

  console.log('🛒 Items for checkout:', itemsForCheckout)
  console.log('🏪 Shop IDs:', itemsForCheckout.map(item => item.shop_id))

  // Navigate to purchase view with selected items
  router.push({
    name: 'purchaseview',
    state: {
      items: itemsForCheckout,
      fromCart: true // Flag to indicate coming from cart
    }
  })
}
</script>

<template>
  <v-app>
    <!-- Header -->
    <v-app-bar class="app-bar" flat color="#3f83c7" dark>
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
                    :src="
                      (typeof item.product?.main_img_urls === 'string'
                        ? JSON.parse(item.product.main_img_urls)[0]
                        : item.product?.main_img_urls?.[0]) || '/placeholder.png'
                    "
                    width="70"
                    height="70"
                    class="rounded-lg ml-2"
                    cover
                  />
                </template>

                <v-list-item-title class="font-weight-medium ms-3">
                  {{ item.product?.prod_name || 'Unnamed Product' }}
                </v-list-item-title>
                <v-list-item-subtitle class="ms-3">
                  ₱{{ item.product?.price?.toFixed(2) || '0.00' }}
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
                      ₱{{ ((item.product?.price || 0) * item.quantity).toFixed(2) }}
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
              .reduce((sum, i) => sum + (i.product?.price || 0) * i.quantity, 0)
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
}
</style>
