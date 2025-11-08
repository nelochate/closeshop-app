<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// Mock buyer data (replace with actual Supabase data)
const buyerName = ref('John Doe')
const buyerContact = ref('09123456789')
const buyerAddress = ref('123 Example Street, Butuan City')

// Example cart items
const items = ref([
  { id: 1, name: 'Shoes', price: 899 },
  { id: 2, name: 'T-shirt', price: 499 },
])

// Delivery & payment selections
const deliveryOption = ref('meetup')
const paymentMethod = ref('cash')

// Dialog & countdown logic
const showDialog = ref(false)
const countdown = ref(300) // 5 minutes
let countdownInterval: any = null

// Total price computation
const totalPrice = computed(() => items.value.reduce((sum, item) => sum + item.price, 0))

// Start countdown
const startCountdown = () => {
  clearInterval(countdownInterval)
  countdownInterval = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownInterval)
    }
  }, 1000)
}

// Checkout handler
const handleCheckout = () => {
  showDialog.value = true
  countdown.value = 300
  startCountdown()
}

// Cancel order handler
const handleCancel = () => {
  clearInterval(countdownInterval)
  showDialog.value = false
  alert('Order canceled successfully.')
}

const formatTime = (seconds: number) => {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}
</script>

<template>
  <v-app>
    <v-main>
      <!-- Top Bar -->
      <v-app-bar color="#438fda" dark flat>
        <v-btn icon @click="router.back()">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title>Transaction Process</v-toolbar-title>
      </v-app-bar>

      <v-container class="py-4" fluid>
        <!-- Buyer Info -->
        <v-card class="mb-4" outlined>
          <v-card-title>Delivery Details</v-card-title>
          <v-card-text>
            <div class="buyer-info">
              <p><strong>Name:</strong> {{ buyerName }}</p>
              <p><strong>Contact:</strong> {{ buyerContact }}</p>
              <p><strong>Address:</strong> {{ buyerAddress }}</p>
              <p><strong>Transaction No.:</strong> #{{ Math.floor(Math.random() * 1000000) }}</p>
              <div class="mt-2 flex gap-2">
                <v-btn size="small" color="primary" variant="tonal">Change Address</v-btn>
                <v-btn size="small" color="primary" variant="tonal">Change Date & Time</v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Items to Purchase -->
        <v-card class="mb-4" outlined>
          <v-card-title>Items to Purchase</v-card-title>
          <v-list>
            <v-list-item v-for="item in items" :key="item.id">
              <v-list-item-title>{{ item.name }}</v-list-item-title>
              <v-list-item-subtitle>₱{{ item.price }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
          <v-divider></v-divider>
          <v-card-text class="text-right font-bold"> Total: ₱{{ totalPrice }} </v-card-text>
        </v-card>

        <!-- Delivery Options -->
        <v-card class="mb-4" outlined>
          <v-card-title>Delivery Option</v-card-title>
          <v-card-text>
            <v-radio-group v-model="deliveryOption">
              <v-radio label="Meet Up" value="meetup" />
              <v-radio label="Pickup" value="pickup" />
              <v-radio label="Call a Rider" value="rider" />
            </v-radio-group>
          </v-card-text>
        </v-card>

        <!-- Payment Method -->
        <v-card class="mb-4" outlined>
          <v-card-title>Payment Method</v-card-title>
          <v-card-text>
            <v-radio-group v-model="paymentMethod">
              <v-radio label="Cash on Delivery (Default)" value="cash" />
            </v-radio-group>
          </v-card-text>
        </v-card>

        <!-- Checkout Button -->
        <div class="text-center mt-6">
          <v-btn color="primary" size="large" @click="handleCheckout">Checkout</v-btn>
        </div>
      </v-container>

      <!-- Confirmation Dialog -->
      <v-dialog v-model="showDialog" max-width="500">
        <v-card>
          <v-card-title class="text-center">Checkout Successful</v-card-title>
          <v-card-text>
            <p>
              Note: You have <strong>5 minutes</strong> to cancel this order. After that, it cannot
              be canceled anymore.
            </p>
            <p class="text-center text-red-600 font-bold text-lg mt-3">
              Time Remaining: {{ formatTime(countdown) }}
            </p>
          </v-card-text>
          <v-card-actions class="justify-center">
            <v-btn
              color="error"
              variant="outlined"
              :disabled="countdown <= 0"
              @click="handleCancel"
            >
              Cancel Order
            </v-btn>
            <v-btn color="primary" @click="showDialog = false">OK</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
.buyer-info p {
  margin: 4px 0;
}
.text-center {
  text-align: center;
}
.text-red-600 {
  color: #dc2626;
}
.mt-3 {
  margin-top: 1rem;
}
.mt-6 {
  margin-top: 1.5rem;
}
.flex {
  display: flex;
}
.gap-2 {
  gap: 8px;
}
.font-bold {
  font-weight: bold;
}
.text-right {
  text-align: right;
}
</style>
