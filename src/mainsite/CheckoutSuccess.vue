<template>
  <v-app>
    <v-main class="bg-grey-lighten-4">
      <!-- Modern App Bar with gradient -->
      <v-app-bar elevation="0" flat class="app-bar">
        <v-container class="d-flex align-center">
          <v-btn 
            icon 
            variant="text" 
            @click="router.push('/')"
            class="back-btn"
          >
            <v-icon>mdi-arrow-left</v-icon>
          </v-btn>
          <v-toolbar-title class="text-h6 font-weight-bold">
            Order Summary
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <v-chip 
            v-if="order" 
            :color="order?.status === 'pending' ? 'warning' : 'success'" 
            variant="flat"
            size="small"
            class="status-chip"
          >
            <v-icon start size="16" :icon="order?.status === 'pending' ? 'mdi-clock-outline' : 'mdi-check-circle'"></v-icon>
            {{ order?.status?.toUpperCase() || 'UNKNOWN' }}
          </v-chip>
        </v-container>
      </v-app-bar>

      <v-container class="py-6">
        <!-- Loading State with skeleton -->
        <div v-if="loading" class="text-center py-8">
          <v-progress-circular 
            indeterminate 
            color="primary" 
            size="64"
            :width="4"
          ></v-progress-circular>
          <p class="mt-4 text-grey">Loading your order details...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-8">
          <v-alert 
            type="error" 
            variant="tonal"
            class="mb-4 mx-auto" 
            max-width="500"
          >
            {{ error }}
          </v-alert>
          <v-btn color="primary" size="large" @click="router.push('/')">Go to Home</v-btn>
        </div>

        <!-- Success State -->
        <div v-else class="order-container">
          <!-- Thank You Banner -->
          <div class="thank-you-banner text-center mb-6">
            <v-icon size="56" color="success" class="mb-3">mdi-check-circle</v-icon>
            <h2 class="text-h4 font-weight-bold mb-2">Thank you for your order!</h2>
            <p class="text-body-1 text-grey-darken-1">Your order has been confirmed and is being processed</p>
          </div>

          <v-row>
            <!-- Left Column - Order Items -->
            <v-col cols="12" md="7">
              <v-card class="rounded-xl order-card" elevation="0" variant="outlined">
                <v-card-title class="pa-4 border-bottom">
                  <div class="d-flex align-center">
                    <v-icon class="mr-2" color="primary">mdi-shopping</v-icon>
                    <span class="font-weight-bold">Order Items</span>
                    <v-spacer></v-spacer>
                    <span class="text-caption text-grey">{{ items.length }} item{{ items.length !== 1 ? 's' : '' }}</span>
                  </div>
                </v-card-title>

                <v-list class="py-0" lines="three">
                  <v-list-item 
                    v-for="(item, index) in items" 
                    :key="index"
                    class="item-list"
                  >
                    <template #prepend>
                      <v-avatar size="70" rounded="lg" class="mr-4">
                        <v-img :src="item.image" :alt="item.name" cover>
                          <template v-slot:placeholder>
                            <v-icon size="32" color="grey-lighten-1">mdi-image</v-icon>
                          </template>
                        </v-img>
                      </v-avatar>
                    </template>

                    <v-list-item-title class="font-weight-medium text-body-1">
                      {{ item.name }}
                    </v-list-item-title>

                    <v-list-item-subtitle class="mt-1">
                      <div class="d-flex align-center justify-space-between">
                        <span class="text-primary font-weight-medium">
                          ₱{{ item.price?.toFixed(2) }}
                        </span>
                        <span class="text-caption mx-2">×</span>
                        <span class="text-grey">Qty: {{ item.quantity }}</span>
                        <v-divider vertical class="mx-3" length="20"></v-divider>
                        <strong class="text-h6">₱{{ (item.price * item.quantity).toFixed(2) }}</strong>
                      </div>
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>

                <v-divider></v-divider>

                <v-card-text class="pa-4 bg-grey-lighten-5">
                  <div class="d-flex justify-space-between align-center">
                    <span class="text-subtitle-1 font-weight-bold">Total Amount</span>
                    <span class="text-h5 font-weight-bold text-primary">
                      ₱{{ order?.total_amount?.toFixed(2) || '0.00' }}
                    </span>
                  </div>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Right Column - Order Details -->
            <v-col cols="12" md="5">
              <v-card class="rounded-xl order-card" elevation="0" variant="outlined">
                <v-card-title class="pa-4 border-bottom">
                  <div class="d-flex align-center">
                    <v-icon class="mr-2" color="primary">mdi-information</v-icon>
                    <span class="font-weight-bold">Order Details</span>
                  </div>
                </v-card-title>

                <v-card-text class="pa-4">
                  <!-- Transaction Number -->
                  <div class="detail-item mb-4">
                    <div class="detail-label">
                      <v-icon size="16" class="mr-1" color="grey">mdi-receipt-text</v-icon>
                      Transaction Number
                    </div>
                    <div class="detail-value font-mono font-weight-medium">
                      {{ order?.transaction_number || 'N/A' }}
                    </div>
                  </div>

                  <!-- Buyer Info -->
                  <div class="detail-item mb-4">
                    <div class="detail-label">
                      <v-icon size="16" class="mr-1" color="grey">mdi-account</v-icon>
                      Buyer Information
                    </div>
                    <div class="detail-value">
                      {{ buyer?.first_name }} {{ buyer?.last_name }}
                    </div>
                  </div>

                  <!-- Delivery Option -->
                  <div v-if="order?.delivery_option" class="detail-item mb-4">
                    <div class="detail-label">
                      <v-icon size="16" class="mr-1" color="grey">mdi-truck-fast</v-icon>
                      Delivery Option
                    </div>
                    <div class="detail-value">
                      <v-chip size="small" variant="light" color="info">
                        {{ order.delivery_option }}
                      </v-chip>
                    </div>
                  </div>

                  <!-- Delivery Date -->
                  <div v-if="order?.delivery_date" class="detail-item mb-4">
                    <div class="detail-label">
                      <v-icon size="16" class="mr-1" color="grey">mdi-calendar</v-icon>
                      Delivery Date
                    </div>
                    <div class="detail-value">
                      {{ formatDate(order.delivery_date) }}
                    </div>
                  </div>

                  <!-- Order Date -->
                  <div class="detail-item">
                    <div class="detail-label">
                      <v-icon size="16" class="mr-1" color="grey">mdi-clock-outline</v-icon>
                      Order Date
                    </div>
                    <div class="detail-value">
                      {{ formatDate(order?.created_at) }}
                    </div>
                  </div>
                </v-card-text>
              </v-card>

              <!-- Action Buttons -->
              <div class="action-buttons mt-4">
                <v-btn 
                  color="primary" 
                  size="large"
                  block
                  rounded="lg"
                  @click="router.push('/')"
                  class="mb-3"
                  elevation="0"
                >
                  <v-icon start>mdi-home</v-icon>
                  Continue Shopping
                </v-btn>
                <v-btn 
                  variant="outlined"
                  size="large"
                  block
                  rounded="lg"
                  @click="router.push({ name: 'order-details', params: { id: orderId } })"
                >
                  <v-icon start>mdi-eye</v-icon>
                  View Purchase Details
                </v-btn>
              </div>
            </v-col>
          </v-row>
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>

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

// Helper function to format dates
const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A'
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return dateString
  }
}

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
    items.value =
      orderItems?.map((oi: any) => {
        let imageUrl = '/no-image.png'

        try {
          if (oi.product?.main_img_urls) {
            if (typeof oi.product.main_img_urls === 'string') {
              const parsed = JSON.parse(oi.product.main_img_urls)
              imageUrl = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : '/no-image.png'
            } else if (
              Array.isArray(oi.product.main_img_urls) &&
              oi.product.main_img_urls.length > 0
            ) {
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

<style scoped>
.app-bar {
  background: linear-gradient(135deg, #438fda 0%, #2c6ea5 100%);
}

.back-btn {
  opacity: 0.9;
  transition: opacity 0.2s;
}

.back-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

.status-chip {
  font-weight: 500;
  letter-spacing: 0.5px;
}

.order-container {
  max-width: 1400px;
  margin: 0 auto;
}

.thank-you-banner {
  background: linear-gradient(135deg, #f0f9ff 0%, #e8f4f8 100%);
  border-radius: 20px;
  padding: 32px 24px;
}

.order-card {
  border: 1px solid #e2e8f0;
  transition: box-shadow 0.2s ease;
}

.order-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.border-bottom {
  border-bottom: 1px solid #e2e8f0;
}

.item-list {
  border-bottom: 1px solid #f0f0f0;
  transition: background-color 0.2s ease;
}

.item-list:hover {
  background-color: #fafafa;
}

.detail-item {
  padding-bottom: 12px;
  border-bottom: 1px dashed #e2e8f0;
}

.detail-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.detail-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
  color: #64748b;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
}

.detail-value {
  font-size: 0.95rem;
  color: #1e293b;
  padding-left: 24px;
  word-break: break-word;
}

.font-mono {
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.85rem;
  letter-spacing: 0.3px;
}

.action-buttons {
  position: sticky;
  bottom: 20px;
}

@media (max-width: 960px) {
  .thank-you-banner {
    padding: 24px 16px;
  }
  
  .thank-you-banner h2 {
    font-size: 1.75rem;
  }
  
  .action-buttons {
    position: static;
    margin-top: 16px;
  }
}
</style>