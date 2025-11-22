<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()
const orderId = route.params.orderId as string

const order = ref<any>(null)
const items = ref<any[]>([])
const buyer = ref<any>(null)
const loading = ref(true)
const error = ref<string>('')

onMounted(async () => {
  if (!orderId) {
    error.value = 'No order ID provided'
    loading.value = false
    return
  }

  try {
    console.log('📋 Fetching order details for:', orderId)

    // Fetch order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError) throw orderError
    order.value = orderData
    console.log('✅ Order found:', orderData)

    // Fetch order items
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*, product:products(*)')
      .eq('order_id', orderId)

    if (itemsError) throw itemsError

    console.log('📦 Order items:', orderItems)

    // Transform order items with safe image parsing
    items.value = orderItems?.map((oi: any) => {
      let imageUrl = '/no-image.png'
      
      try {
        if (oi.product?.main_img_urls) {
          if (typeof oi.product.main_img_urls === 'string') {
            const parsed = JSON.parse(oi.product.main_img_urls)
            imageUrl = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : '/no-image.png'
          } else if (Array.isArray(oi.product.main_img_urls) && oi.product.main_img_urls.length > 0) {
            imageUrl = oi.product.main_img_urls[0]
          }
        }
      } catch (e) {
        console.warn('⚠️ Failed to parse image URL:', oi.product?.main_img_urls)
        imageUrl = '/no-image.png'
      }

      return {
        name: oi.product?.prod_name || 'Unknown Product',
        price: oi.price || 0,
        quantity: oi.quantity || 1,
        image: imageUrl,
      }
    }) || []

    console.log('✅ Transformed items:', items.value)

    // Fetch buyer info
    if (orderData?.user_id) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', orderData.user_id)
        .single()

      if (profileError) {
        console.warn('⚠️ Could not fetch profile:', profileError)
      } else {
        buyer.value = profile
        console.log('✅ Buyer found:', profile)
      }
    }

  } catch (err: any) {
    console.error('❌ Error loading order:', err)
    error.value = `Failed to load order details: ${err.message}`
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <v-app>
    <v-main>
      <v-app-bar color="#438fda" dark flat>
        <v-btn icon @click="router.push('/')">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title>Order Summary</v-toolbar-title>
      </v-app-bar>

      <v-container class="py-4">
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
          <p class="mt-4">Loading order details...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-8">
          <v-alert type="error" class="mb-4">
            {{ error }}
          </v-alert>
          <v-btn color="primary" @click="router.push('/')">Go to Home</v-btn>
        </div>

        <!-- Success State -->
        <div v-else>
          <v-card variant="outlined" class="mb-4">
            <v-card-title class="text-h5">Thank you for your order!</v-card-title>
            <v-card-text>
              <p><strong>Transaction Number:</strong> {{ order?.transaction_number || 'N/A' }}</p>
              <p><strong>Buyer:</strong> {{ buyer?.first_name }} {{ buyer?.last_name }}</p>
              <p><strong>Total Amount:</strong> ₱{{ order?.total_amount?.toFixed(2) || '0.00' }}</p>
              <p><strong>Status:</strong> <v-chip :color="order?.status === 'pending' ? 'warning' : 'success'" size="small">
                {{ order?.status || 'Unknown' }}
              </v-chip></p>
              <p v-if="order?.delivery_option"><strong>Delivery:</strong> {{ order.delivery_option }}</p>
              <p v-if="order?.delivery_date"><strong>Delivery Date:</strong> {{ order.delivery_date }}</p>
            </v-card-text>
          </v-card>

          <v-card variant="outlined" class="mb-4">
            <v-card-title>Order Items</v-card-title>
            <v-list>
              <v-list-item 
                v-for="(item, index) in items" 
                :key="index"
                class="mb-2"
              >
                <template #prepend>
                  <v-avatar size="60" class="mr-4">
                    <v-img 
                      :src="item.image" 
                      :alt="item.name"
                      cover
                    ></v-img>
                  </v-avatar>
                </template>

                <v-list-item-title class="font-weight-medium">
                  {{ item.name }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  ₱{{ item.price?.toFixed(2) }} × {{ item.quantity }} = 
                  <strong>₱{{ (item.price * item.quantity).toFixed(2) }}</strong>
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>

            <v-divider></v-divider>

            <v-card-text class="text-right">
              <div class="text-h6">
                Total: <strong>₱{{ order?.total_amount?.toFixed(2) || '0.00' }}</strong>
              </div>
            </v-card-text>
          </v-card>

          <div class="text-center mt-6">
            <v-btn color="primary" size="large" @click="router.push('/')">
              Go to Home
            </v-btn>
            <v-btn 
              variant="outlined" 
              @click="router.push('/cart')" 
              class="ml-2"
              size="large"
            >
              Back to Cart
            </v-btn>
          </div>
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.v-list-item {
  border-bottom: 1px solid #e0e0e0;
}

.v-list-item:last-child {
  border-bottom: none;
}
</style>