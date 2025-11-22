<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()
const items = ref<any[]>([])
const fromCart = ref(false) // Track if coming from cart
const cartItemIds = ref<string[]>([]) // Store cart item IDs for cleanup

// 🧾 STATE (your existing state remains the same)
const buyer = ref<any>(null)
const address = ref<any>(null)
const deliveryOption = ref('meetup')
const paymentMethod = ref('cash')
const note = ref('')
const showDateTimePicker = ref(false)
const showDialog = ref(false)
const countdown = ref(300)
const currentOrderId = ref<string>('')
const transactionNumber = ref('')

// 🕒 Initialize with current LOCAL date and time
const now = new Date()
const year = now.getFullYear()
const month = (now.getMonth() + 1).toString().padStart(2, '0')
const day = now.getDate().toString().padStart(2, '0')
const deliveryDate = ref<string>(`${year}-${month}-${day}`)

const hours = now.getHours().toString().padStart(2, '0')
const currentMinutes = now.getMinutes().toString().padStart(2, '0')
const deliveryTime = ref<string>(`${hours}:${currentMinutes}`)

const currentHour12 = now.getHours() % 12 || 12
const selectedHour = ref(currentHour12.toString().padStart(2, '0'))
const selectedMinute = ref(currentMinutes)
const selectedPeriod = ref<'AM' | 'PM'>(now.getHours() >= 12 ? 'PM' : 'AM')

// Load transaction number on mount
onMounted(() => {
  transactionNumber.value = generateTransactionNumber()
  loadItemsFromNavigation()
})

// ✅ NEW: Load items from navigation state or cart
const loadItemsFromNavigation = async () => {
  // Check if items were passed via navigation
  if (history.state?.items) {
    items.value = history.state.items
    fromCart.value = history.state.fromCart || false

    // Extract cart item IDs if coming from cart
    if (fromCart.value) {
      cartItemIds.value = items.value.map((item) => item.cart_item_id).filter(Boolean)
    }
  } else {
    // Fallback: fetch from cart
    await fetchCartItems()
  }
}

// ✅ NEW: Fetch cart items as fallback
const fetchCartItems = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

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

    // Transform cart items to match expected format
    items.value = (data || []).map((item) => ({
      id: item.product_id,
      product_id: item.product_id,
      name: item.product?.prod_name || 'Unnamed Product',
      price: item.product?.price || 0,
      quantity: item.quantity,
      image:
        (typeof item.product?.main_img_urls === 'string'
          ? JSON.parse(item.product.main_img_urls)[0]
          : item.product?.main_img_urls?.[0]) || '/placeholder.png',
      cart_item_id: item.id,
    }))

    fromCart.value = true
    cartItemIds.value = items.value.map((item) => item.cart_item_id).filter(Boolean)
  } catch (err) {
    console.error('Error fetching cart items:', err)
  }
}

const shopSchedule = ref({
  openDays: [1, 2, 3, 4, 5, 6],
  openHour: 9,
  closeHour: 19,
  meetupDetails: '',
})
const scheduleError = ref('')

// 🔢 COMPUTED: total price
const totalPrice = computed(() =>
  items.value.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0),
)

// ⏱ COUNTDOWN LOGIC (your existing code)
let countdownInterval: number | null = null
const formatTime = (seconds: number) => {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}
const startCountdown = () => {
  if (countdownInterval) clearInterval(countdownInterval)
  countdownInterval = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0 && countdownInterval) clearInterval(countdownInterval)
  }, 1000)
}

// ➕ / ➖ Quantity
const increaseQty = (item: any) => (item.quantity = (item.quantity || 1) + 1)
const decreaseQty = (item: any) => {
  if ((item.quantity || 1) > 1) item.quantity--
}

// 📦 FETCH USER + SHOP DATA (your existing code)
onMounted(async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    // Fetch profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    buyer.value = profile

    // Fetch all addresses of user
    const { data: allAddresses } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (!allAddresses || allAddresses.length === 0) {
      address.value = null
      return
    }

    // CASE 1: User only has ONE address → auto set as default
    if (allAddresses.length === 1) {
      const single = allAddresses[0]
      if (!single.is_default) {
        await supabase.from('addresses').update({ is_default: true }).eq('id', single.id)
      }
      address.value = { ...single, is_default: true }
      return
    }

    // CASE 2: User has multiple → pick the one set as default
    const defaultAddress = allAddresses.find((a) => a.is_default === true)
    if (defaultAddress) {
      address.value = defaultAddress
      return
    }

    // CASE 3: No default among multiple → fallback to last updated
    address.value = allAddresses[0]
  } catch (err) {
    console.error('Error loading address:', err)
  }
})

// Generate unique transaction number
const generateTransactionNumber = () => {
  const timestamp = Date.now().toString(36)
  const random = Math.floor(Math.random() * 1e6)
    .toString(36)
    .padStart(5, '0')
  return `TX-${timestamp}-${random}`.toUpperCase()
}

// 🕒 VALIDATION (your existing code)
const isWithinShopHours = (date: string, time: string) => {
  if (!date || !time) return false
  const selected = new Date(`${date}T${time}`)
  const day = selected.getDay()
  const hour = selected.getHours()

  if (!shopSchedule.value.openDays.includes(day)) {
    scheduleError.value = 'Shop is closed on that day.'
    return false
  }
  if (hour < shopSchedule.value.openHour || hour >= shopSchedule.value.closeHour) {
    scheduleError.value = `Please select between ${shopSchedule.value.openHour}:00 and ${shopSchedule.value.closeHour}:00.`
    return false
  }
  scheduleError.value = ''
  return true
}

// ✅ ENHANCED CHECKOUT: Handle cart cleanup with debugging
const handleCheckout = async () => {
  if (!buyer.value || !address.value) {
    alert('Missing buyer or address info')
    return
  }
  if (!items.value.length) {
    alert('No items to checkout')
    return
  }

  console.log('🛒 Starting checkout process...')
  console.log('Items:', items.value)
  console.log('Buyer:', buyer.value)
  console.log('Address:', address.value)

  try {
    const txNumber = generateTransactionNumber()
    transactionNumber.value = txNumber

    console.log('📝 Creating order...')
    // Insert order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: buyer.value.id,
        address_id: address.value.id,
        total_amount: totalPrice.value,
        status: 'pending',
        payment_method: paymentMethod.value,
        transaction_number: txNumber,
        delivery_option: deliveryOption.value,
        delivery_date: deliveryDate.value,
        delivery_time: deliveryTime.value,
        note: note.value,
      })
      .select()
      .single()

    if (orderError) {
      console.error('❌ Order creation error:', orderError)
      throw orderError
    }

    console.log('✅ Order created:', order)

    // Insert order items
    const orderItems = items.value.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
    }))

    console.log('📦 Inserting order items...')
    const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
    if (itemsError) {
      console.error('❌ Order items error:', itemsError)
      throw itemsError
    }

    console.log('💰 Creating payment record...')
    // Insert payment record
    const { error: paymentError } = await supabase.from('payments').insert({
      order_id: order.id,
      amount: order.total_amount,
      status: 'pending',
      method: paymentMethod.value,
    })

    if (paymentError) {
      console.error('❌ Payment creation error:', paymentError)
      throw paymentError
    }

    // ✅ NEW: Clean up cart items if coming from cart
    if (fromCart.value && cartItemIds.value.length > 0) {
      console.log('🗑️ Cleaning cart items...')
      const { error: cartError } = await supabase
        .from('cart_items')
        .delete()
        .in('id', cartItemIds.value)

      if (cartError) {
        console.error('⚠️ Cart cleanup error (non-critical):', cartError)
      }
    }

    console.log('🎯 Navigating to success page...')
    // Navigate to success page
    router.push({
      name: 'checkout-success',
      params: { orderId: order.id },
      state: {
        orderNumber: txNumber,
        totalAmount: totalPrice.value,
      },
    })

  } catch (err) {
    console.error('❌ Checkout error:', err)
    alert('Failed to checkout. Please try again.')
  }
}
// ❌ CANCEL ORDER (your existing code)
const handleCancel = async () => {
  if (countdownInterval) clearInterval(countdownInterval)
  await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', currentOrderId.value)
    .eq('status', 'pending')
  await supabase.from('payments').update({ status: 'failed' }).eq('order_id', currentOrderId.value)
  showDialog.value = false
  alert('Order canceled successfully.')
}

// 🚚 DELIVERY OPTIONS (your existing code)
const deliveryOptions = [
  { label: 'Meet Up', value: 'meetup' },
  { label: 'Pickup', value: 'pickup' },
  { label: 'Call a Rider', value: 'rider' },
]
const deliveryOptionsDisplay = computed(() =>
  deliveryOptions.map((opt) =>
    opt.value === 'meetup'
      ? { ...opt, label: `Meet Up (${shopSchedule.value.meetupDetails || 'No location set'})` }
      : opt,
  ),
)

// 🕓 TIME PICKER (12-hour) - your existing code
const hours12 = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

const updateTime = () => {
  let hourNum = parseInt(selectedHour.value)
  if (selectedPeriod.value === 'PM' && hourNum < 12) hourNum += 12
  if (selectedPeriod.value === 'AM' && hourNum === 12) hourNum = 0
  deliveryTime.value = `${hourNum.toString().padStart(2, '0')}:${selectedMinute.value}`
}

const selectHour = (hour: string) => {
  selectedHour.value = hour
  updateTime()
}

const selectMinute = (minute: string) => {
  selectedMinute.value = minute
  updateTime()
}

// Initialize time on component mount and watch for changes
onMounted(() => {
  updateTime()
})

watch(selectedPeriod, updateTime)

const confirmDateTime = () => {
  updateTime()
  if (!isWithinShopHours(deliveryDate.value, deliveryTime.value)) {
    alert(scheduleError.value)
    return
  }
  showDateTimePicker.value = false
}

// Format date for display
const formattedDate = computed(() => {
  if (!deliveryDate.value) return 'Not set'
  const date = new Date(deliveryDate.value)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})
</script>
<template>
  <v-app>
    <v-main>
      <v-app-bar color="#438fda" dark flat>
        <v-btn icon @click="router.back()"><v-icon>mdi-arrow-left</v-icon></v-btn>
        <v-toolbar-title class="app-bar-title">Transaction Process</v-toolbar-title>
      </v-app-bar>

      <v-container fluid class="py-4 px-3 main-content">
        <!-- Buyer Info -->
        <v-card outlined class="mb-4 card-elevated">
          <v-card-title class="card-title">Delivery Details</v-card-title>
          <v-card-text class="card-content">
            <div class="buyer-info">
              <p><strong>Name:</strong> {{ buyer?.first_name }} {{ buyer?.last_name }}</p>
              <p><strong>Contact:</strong> {{ address?.phone }}</p>
              <p class="address-line">
                <strong>Address:</strong> {{ address?.street }}, {{ address?.city_name }}
              </p>
              <p><strong>Transaction No.:</strong> {{ transactionNumber }}</p>
              <p>
                <strong>Delivery Schedule:</strong> {{ formattedDate }}
                {{ deliveryTime ? `at ${deliveryTime}` : '' }}
              </p>
              <p v-if="scheduleError" class="text-red mt-1">{{ scheduleError }}</p>
              <div class="button-group mt-2">
                <v-btn size="small" color="primary" variant="tonal" class="action-btn"
                  >Change Address</v-btn
                >
                <v-btn
                  size="small"
                  color="primary"
                  variant="tonal"
                  @click="showDateTimePicker = true"
                  class="action-btn"
                >
                  Change Schedule
                </v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>
        <!-- Items -->
        <v-card variant="outlined" class="mb-4 card-elevated">
          <v-card-title class="card-title">Items to Purchase</v-card-title>
          <v-list class="item-list">
            <v-list-item v-for="item in items" :key="item.id" class="list-item">
              <!-- ✅ VUETIFY 3 COMPATIBLE -->
              <template #prepend>
                <v-avatar class="item-avatar">
                  <v-img :src="item.image" alt="product" class="product-image" />
                </v-avatar>
              </template>

              <v-list-item-title class="item-name">{{ item.name }}</v-list-item-title>
              <v-list-item-subtitle class="item-price">₱{{ item.price }}</v-list-item-subtitle>

              <template #append>
                <div class="item-actions">
                  <div class="quantity-controls">
                    <v-btn
                      size="x-small"
                      color="error"
                      variant="tonal"
                      @click="decreaseQty(item)"
                      class="qty-btn"
                      >−</v-btn
                    >
                    <span class="quantity-display">{{ item.quantity }}</span>
                    <v-btn
                      size="x-small"
                      color="primary"
                      variant="tonal"
                      @click="increaseQty(item)"
                      class="qty-btn"
                      >+</v-btn
                    >
                  </div>
                </div>
              </template>
            </v-list-item>
          </v-list>
          <v-divider></v-divider>
          <v-card-text class="total-price">Total: ₱{{ totalPrice }}</v-card-text>
        </v-card>

        <!-- Note -->
        <v-card outlined class="mb-4 card-elevated">
          <v-card-title class="card-title">Message to Seller</v-card-title>
          <v-card-text>
            <v-textarea
              v-model="note"
              label="Write something..."
              auto-grow
              rows="2"
              outlined
              dense
              class="note-textarea"
            ></v-textarea>
          </v-card-text>
        </v-card>

        <!-- Delivery Option -->
        <v-select
          v-model="deliveryOption"
          :items="deliveryOptionsDisplay"
          item-title="label"
          item-value="value"
          label="Select delivery option"
          outlined
          dense
          class="delivery-select"
        ></v-select>

        <!-- Payment Method -->
        <v-card outlined class="mb-4 card-elevated">
          <v-card-title class="card-title">Payment Method</v-card-title>
          <v-card-text>
            <v-radio-group v-model="paymentMethod" class="payment-radio-group">
              <v-radio label="Cash on Delivery (Default)" value="cash" />
            </v-radio-group>
          </v-card-text>
        </v-card>
      </v-container>

      <!-- Fixed Bottom Navigation -->
      <div class="bottom-nav-fixed">
        <div class="bottom-nav-content">
          <div class="total-section">
            <div class="total-label">Total Amount:</div>
            <div class="total-amount">₱{{ totalPrice }}</div>
          </div>
          <v-btn
            color="primary"
            size="large"
            @click="handleCheckout"
            class="place-order-btn"
            :disabled="!items.length"
            block
          >
            Place Order
          </v-btn>
        </div>
      </div>

      <!-- Confirmation Dialog -->
      <v-dialog v-model="showDialog" max-width="500" class="confirmation-dialog">
        <v-card>
          <v-card-title class="dialog-title">Checkout Successful</v-card-title>
          <v-card-text class="dialog-content">
            <p>Note: You have <strong>5 minutes</strong> to cancel this order.</p>
            <p class="countdown-timer">Time Remaining: {{ formatTime(countdown) }}</p>
          </v-card-text>
          <v-card-actions class="dialog-actions">
            <v-btn
              color="error"
              variant="outlined"
              :disabled="countdown <= 0"
              @click="handleCancel"
              class="cancel-btn"
              >Cancel Order</v-btn
            >
            <v-btn color="primary" @click="showDialog = false" class="ok-btn">OK</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Date & Time Picker -->
      <v-dialog v-model="showDateTimePicker" max-width="420" class="datetime-dialog">
        <v-card class="datetime-card">
          <v-card-title class="datetime-title">Select Delivery Schedule</v-card-title>
          <v-card-text class="datetime-content">
            <v-date-picker
              v-model="deliveryDate"
              color="primary"
              elevation="0"
              show-adjacent-months
              class="date-picker"
            ></v-date-picker>
            <v-divider class="my-4"></v-divider>
            <div class="time-section">
              <div class="time-label">Select Time</div>
              <div class="time-wheels">
                <div class="time-wheel">
                  <v-virtual-scroll :items="hours12" height="160" item-height="40">
                    <template #default="{ item }">
                      <div
                        class="time-item"
                        :class="{ active: item === selectedHour }"
                        @click="selectHour(item)"
                      >
                        {{ item }}
                      </div>
                    </template>
                  </v-virtual-scroll>
                </div>
                <div class="time-separator">:</div>
                <div class="time-wheel">
                  <v-virtual-scroll :items="minutes" height="160" item-height="40">
                    <template #default="{ item }">
                      <div
                        class="time-item"
                        :class="{ active: item === selectedMinute }"
                        @click="selectMinute(item)"
                      >
                        {{ item }}
                      </div>
                    </template>
                  </v-virtual-scroll>
                </div>
              </div>
              <div class="period-toggle">
                <v-btn-toggle
                  v-model="selectedPeriod"
                  color="primary"
                  rounded="pill"
                  divided
                  class="period-buttons"
                >
                  <v-btn value="AM" class="period-btn">AM</v-btn>
                  <v-btn value="PM" class="period-btn">PM</v-btn>
                </v-btn-toggle>
              </div>
              <div class="selected-schedule">
                <div class="schedule-label">Selected Schedule</div>
                <div class="schedule-display">
                  {{ deliveryDate || 'Not set' }} — {{ selectedHour }}:{{ selectedMinute }}
                  {{ selectedPeriod }}
                </div>
              </div>
            </div>
          </v-card-text>
          <v-card-actions class="datetime-actions">
            <v-btn text @click="showDateTimePicker = false" class="cancel-datetime-btn"
              >Cancel</v-btn
            >
            <v-btn
              color="primary"
              variant="flat"
              @click="confirmDateTime"
              class="confirm-datetime-btn"
              >Confirm</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
/* Global Styles */
:root {
  --primary-color: #438fda;
  --error-color: #dc2626;
  --success-color: #10b981;
  --text-primary: #333;
  --text-secondary: #666;
  --border-color: #e0e0e0;
  --card-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Main Content */
.main-content {
  padding-bottom: 100px !important; /* Space for fixed bottom nav */
}

/* Container & Layout */
.px-3 {
  padding-left: 12px;
  padding-right: 12px;
}

.card-elevated {
  box-shadow: var(--card-shadow) !important;
  border-radius: 12px !important;
}

.card-title {
  font-size: 1.1rem !important;
  font-weight: 600 !important;
  padding: 16px 20px 8px !important;
  color: var(--text-primary);
}

.card-content {
  padding: 8px 20px 16px !important;
}

/* Buyer Info */
.buyer-info p {
  margin: 6px 0;
  font-size: 0.9rem;
  line-height: 1.4;
}

.address-line {
  word-break: break-word;
}

.text-red {
  color: var(--error-color);
  font-size: 0.85rem;
}

.button-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  font-size: 0.8rem !important;
  min-width: auto !important;
}

/* Items List */
.item-list {
  padding: 0 !important;
}

.list-item {
  padding: 12px 16px !important;
  border-bottom: 1px solid var(--border-color);
}

.list-item:last-child {
  border-bottom: none;
}

.item-avatar {
  min-width: 50px !important;
  width: 50px !important;
  height: 50px !important;
}

.product-image {
  border-radius: 8px;
  object-fit: cover;
}

.item-content {
  padding: 0 12px !important;
  min-width: 0;
}

.item-name {
  font-size: 0.95rem !important;
  font-weight: 500 !important;
  line-height: 1.3;
  margin-bottom: 4px;
}

.item-price {
  font-size: 0.9rem !important;
  color: var(--primary-color) !important;
  font-weight: 600 !important;
}

.item-actions {
  margin: 0 !important;
  min-width: auto;
}

.quantity-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}

.qty-btn {
  min-width: 32px !important;
  width: 32px !important;
  height: 32px !important;
  font-size: 0.9rem !important;
  font-weight: bold;
}

.quantity-display {
  min-width: 24px;
  text-align: center;
  font-weight: 600;
  font-size: 0.95rem;
}

.total-price {
  text-align: right;
  font-weight: 700 !important;
  font-size: 1.1rem !important;
  color: var(--text-primary);
  padding: 16px 20px !important;
}

/* Note Textarea */
.note-textarea {
  font-size: 0.9rem;
}

/* Delivery Select */
.delivery-select {
  margin-bottom: 16px;
}

/* Payment Method */
.payment-radio-group {
  margin-top: 0;
}

/* Fixed Bottom Navigation */
.bottom-nav-fixed {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  padding: 12px 16px;
}

.bottom-nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 800px;
  margin: 0 auto;
}

.total-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
}

.total-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 500;
  margin-bottom: 2px;
}

.total-amount {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--primary-color);
  line-height: 1.2;
}

.place-order-btn {
  min-width: 140px;
  font-weight: 600;
  text-transform: none;
  border-radius: 8px;
  height: 48px;
  font-size: 1rem;
  flex-shrink: 0;
}

/* Dialog Styles */
.confirmation-dialog .dialog-title {
  text-align: center;
  font-weight: 600;
  font-size: 1.2rem;
}

.dialog-content {
  text-align: center;
  padding: 16px 24px;
}

.countdown-timer {
  color: var(--error-color);
  font-weight: 700;
  font-size: 1.1rem;
  margin: 12px 0 0 0;
}

.dialog-actions {
  justify-content: center;
  gap: 12px;
  padding: 0 24px 16px;
}

.cancel-btn,
.ok-btn {
  min-width: 120px;
}

/* Date Time Picker */
.datetime-dialog {
  max-width: 95vw !important;
}

.datetime-card {
  border-radius: 16px !important;
  overflow: hidden;
}

.datetime-title {
  text-align: center;
  font-weight: 700 !important;
  font-size: 1.1rem !important;
  color: var(--primary-color);
  padding: 20px 20px 0 !important;
}

.datetime-content {
  padding: 16px 20px;
}

.date-picker {
  width: 100%;
}

.time-section {
  text-align: center;
}

.time-label {
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.time-wheels {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.time-wheel {
  width: 60px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  text-align: center;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
}

.time-separator {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.time-item {
  height: 40px;
  line-height: 40px;
  cursor: pointer;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.25s ease;
  border-radius: 6px;
  margin: 2px;
  font-size: 0.95rem;
}

.time-item:hover {
  background-color: #e3f2fd;
  color: var(--primary-color);
}

.time-item.active {
  background-color: var(--primary-color);
  color: white;
  font-weight: 600;
  transform: scale(1.05);
}

.period-toggle {
  margin: 16px 0;
}

.period-buttons {
  border: 1px solid var(--border-color);
  background: #f9fafb;
}

.period-btn {
  font-weight: 600;
  text-transform: none;
  font-size: 0.9rem;
}

.selected-schedule {
  margin-top: 16px;
}

.schedule-label {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.schedule-display {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--primary-color);
  line-height: 1.3;
}

.datetime-actions {
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px 20px;
}

.cancel-datetime-btn,
.confirm-datetime-btn {
  min-width: 80px;
}

/* App Bar */
.app-bar-title {
  font-size: 1.1rem !important;
  font-weight: 600;
}

/* Responsive Design */
@media (max-width: 600px) {
  .px-3 {
    padding-left: 8px;
    padding-right: 8px;
  }

  .card-title {
    font-size: 1rem !important;
    padding: 14px 16px 6px !important;
  }

  .card-content {
    padding: 6px 16px 14px !important;
  }

  .item-avatar {
    min-width: 45px !important;
    width: 45px !important;
    height: 45px !important;
  }

  .item-name {
    font-size: 0.9rem !important;
  }

  .item-price {
    font-size: 0.85rem !important;
  }

  .qty-btn {
    min-width: 28px !important;
    width: 28px !important;
    height: 28px !important;
  }

  .quantity-display {
    font-size: 0.9rem;
  }

  .total-price {
    font-size: 1rem !important;
    padding: 14px 16px !important;
  }

  /* Bottom Nav Mobile */
  .bottom-nav-fixed {
    padding: 10px 12px;
  }

  .bottom-nav-content {
    gap: 12px;
  }

  .total-label {
    font-size: 0.8rem;
  }

  .total-amount {
    font-size: 1.2rem;
  }

  .place-order-btn {
    min-width: 120px;
    height: 44px;
    font-size: 0.95rem;
  }

  .datetime-dialog {
    margin: 8px !important;
  }

  .datetime-title {
    font-size: 1rem !important;
    padding: 16px 16px 0 !important;
  }

  .datetime-content {
    padding: 12px 16px;
  }

  .time-wheel {
    width: 55px;
  }

  .time-item {
    height: 36px;
    line-height: 36px;
    font-size: 0.9rem;
  }

  .schedule-display {
    font-size: 1rem;
  }

  .button-group {
    flex-direction: column;
    align-items: stretch;
  }

  .action-btn {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 400px) {
  .list-item {
    padding: 10px 12px !important;
  }

  .item-avatar {
    min-width: 40px !important;
    width: 40px !important;
    height: 40px !important;
  }

  .item-content {
    padding: 0 8px !important;
  }

  .time-wheels {
    gap: 8px;
  }

  .time-wheel {
    width: 50px;
  }

  .time-separator {
    font-size: 1.1rem;
  }

  .datetime-actions {
    padding: 12px 16px 16px;
  }

  .bottom-nav-content {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }

  .total-section {
    align-items: center;
    text-align: center;
  }

  .place-order-btn {
    min-width: 100%;
  }
}

/* Animation for buttons and interactive elements */
.qty-btn,
.action-btn,
.place-order-btn,
.time-item,
.period-btn,
.cancel-btn,
.ok-btn,
.cancel-datetime-btn,
.confirm-datetime-btn {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Ensure proper spacing and alignment */
.v-main {
  background-color: #f8fafc;
  position: relative;
}

.v-container {
  max-width: 800px;
  margin: 0 auto;
}
</style>
