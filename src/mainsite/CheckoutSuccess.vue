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

onMounted(async () => {
  if (!orderId) return

  // Fetch order
  const { data: orderData } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()
  order.value = orderData

  // Fetch order items
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('*, product:product_id(*)')
    .eq('order_id', orderId)
  items.value = orderItems?.map((oi: any) => ({
    name: oi.product.prod_name,
    price: oi.price,
    quantity: oi.quantity,
    image: JSON.parse(oi.product.main_img_urls)[0] || '/no-image.png',
  })) || []

  // Fetch buyer info
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', orderData.user_id)
    .single()
  buyer.value = profile
})
</script>

<template>
  <v-app>
    <v-main>
      <v-app-bar color="#438fda" dark flat>
        <v-btn icon @click="router.push('/')"><v-icon>mdi-arrow-left</v-icon></v-btn>
        <v-toolbar-title>Order Summary</v-toolbar-title>
      </v-app-bar>

      <v-container class="py-4">
        <v-card outlined class="mb-4">
          <v-card-title>Thank you for your order!</v-card-title>
          <v-card-text>
            <p><strong>Transaction Number:</strong> {{ order?.transaction_number }}</p>
            <p><strong>Buyer:</strong> {{ buyer?.first_name }} {{ buyer?.last_name }}</p>
            <p><strong>Total:</strong> ₱{{ order?.total_amount }}</p>
          </v-card-text>
        </v-card>

        <v-card outlined>
          <v-card-title>Items</v-card-title>
          <v-list>
            <v-list-item v-for="item in items" :key="item.name">
              <v-list-item-avatar>
                <v-img :src="item.image"></v-img>
              </v-list-item-avatar>
              <v-list-item-content>
                <v-list-item-title>{{ item.name }}</v-list-item-title>
                <v-list-item-subtitle>₱{{ item.price }} x {{ item.quantity }}</v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-card>

        <div class="text-center mt-6">
          <v-btn color="primary" @click="router.push('/')">Go to Home</v-btn>
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>
