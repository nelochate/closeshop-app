<script setup>
import { ref, onMounted } from 'vue'
import { useCartStore } from '@/stores/cart'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'


const activeTab = ref('cart')
const cart = useCartStore()

const loading = ref(true)
const selectedItems = ref([])

// ✅ Fetch cart on mount
onMounted(async () => {
  loading.value = true
  await cart.fetchCart()
  loading.value = false
})

// ✅ Delete item
const deleteItem = async (id) => {
  await cart.deleteFromCart(id)
  selectedItems.value = selectedItems.value.filter(i => i !== id)
}

// ✅ Update quantity (+ / -)
const updateQuantity = async (itemId, newQty) => {
  if (newQty < 1) return // prevent zero/negative

  const item = cart.items.find(i => i.id === itemId)
  if (!item) return

  try {
    // Instead of diff math, just set the new absolute qty
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


// ✅ Checkout selected
const checkoutSelected = () => {
  const items = cart.items.filter(i => selectedItems.value.includes(i.id))
  if (!items.length) {
    alert('Please select items to checkout')
    return
  }
  const total = items.reduce((sum, i) => sum + (i.product?.price || 0) * i.quantity, 0)
  alert(`Proceeding to checkout: ₱${total.toFixed(2)} for ${items.length} items`)
  // 🚀 TODO: navigate to checkout page
}
</script>

<template>
  <v-app>
    <!-- Header -->
    <v-app-bar flat color="#3f83c7" dark>
      <v-toolbar-title><strong>Cart</strong></v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <!-- Loader -->
        <div v-if="loading" class="d-flex justify-center pa-6">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <!-- Empty State -->
        <div v-else-if="cart.items.length === 0" class="content">
          <h2 class="text-h6 font-weight-bold">Your cart is empty</h2>
          <v-icon size="64" color="grey">mdi-cart-outline</v-icon>
        </div>

        <!-- Cart Items -->
        <v-list v-else lines="two">
          <v-list-item v-for="item in cart.items" :key="item.id" class="cart-item mb-3 rounded-lg elevation-1">
            <template #prepend>
              <v-checkbox v-model="selectedItems" :value="item.id" density="compact" color="primary" />
              <v-img :src="(typeof item.product?.main_img_urls === 'string'
                ? JSON.parse(item.product.main_img_urls)[0]
                : item.product?.main_img_urls?.[0]) || '/placeholder.png'" width="70" height="70"
                class="rounded-lg ml-2" cover />
            </template>

            <!-- Product Info -->
            <v-list-item-title class="font-weight-medium">
              {{ item.product?.prod_name || 'Unnamed Product' }}
            </v-list-item-title>
            <v-list-item-subtitle>
              ₱{{ item.product?.price?.toFixed(2) || '0.00' }}
            </v-list-item-subtitle>

            <!-- Quantity Controls -->
            <template #append>
              <div class="d-flex flex-column align-end">
                <div class="d-flex align-center mt-1">
                  <v-btn icon size="small" variant="outlined" color="primary"
                    @click="updateQuantity(item.id, item.quantity - 1)">
                    <v-icon small>mdi-minus</v-icon>
                  </v-btn>

                  <span class="mx-2">{{ item.quantity }}</span>

                  <v-btn icon size="small" variant="outlined" color="primary"
                    @click="updateQuantity(item.id, item.quantity + 1)">
                    <v-icon small>mdi-plus</v-icon>
                  </v-btn>
                </div>

                <div class="font-weight-bold text-primary mt-2">
                  ₱{{ ((item.product?.price || 0) * item.quantity).toFixed(2) }}
                </div>
                <v-btn icon variant="text" color="red" @click="deleteItem(item.id)">
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </div>
            </template>
          </v-list-item>
        </v-list>
      </v-container>
    </v-main>

    <!-- Checkout Bar -->
    <v-sheet v-if="cart.items.length" elevation="6" class="checkout-bar pa-3 d-flex align-center justify-space-between">
      <div class="font-weight-bold">
        Total: ₱{{
        cart.items
        .filter(i => selectedItems.includes(i.id))
        .reduce((sum, i) => sum + (i.product?.price || 0) * i.quantity, 0)
        .toFixed(2)
        }}
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

.checkout-bar {
  position: fixed;
  bottom: 64px; /* above BottomNav */
  left: 0;
  right: 0;
  background: #fff;
  z-index: 1100;
}
</style>
