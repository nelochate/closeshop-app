<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const route = useRoute()

// 🧾 STATE
const buyer = ref<any>(null)
const address = ref<any>(null)
const items = ref<any[]>([])
const deliveryOption = ref('meetup')
const paymentMethod = ref('cash')
const note = ref('')
const deliveryDate = ref<string>('')
const deliveryTime = ref<string>('')
const showDateTimePicker = ref(false) //combine date/time picker
const showDialog = ref(false)
const countdown = ref(300)
const currentOrderId = ref<string>('')
const transactionNumber = ref('')
const order = ref<any>(null)

// 🔢 COMPUTED: total price
const totalPrice = computed(() =>
  items.value.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0),
)

// ⏱ COUNTDOWN LOGIC
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
const increaseQty = (item: any) => item.quantity++
const decreaseQty = (item: any) => {
  if (item.quantity > 1) item.quantity--
}

// 🏪 SHOP SCHEDULE DEFAULTS
const shopSchedule = ref({
  openDays: [1, 2, 3, 4, 5, 6],
  openHour: 9,
  closeHour: 19,
  meetupDetails: '',
})
const scheduleError = ref('')
const shopId = ref('your_shop_id_here')

// 📦 FETCH USER + SHOP DATA
onMounted(async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    buyer.value = profile

    const { data: addresses } = await supabase.from('addresses').select('*').eq('user_id', user.id)
    address.value = addresses?.[0] || null

    const { data: cartItems, error: cartError } = await supabase
      .from('cart_items')
      .select(`quantity, product:product_id (id, shop_id, prod_name, price, main_img_urls)`)
      .eq('user_id', user.id)

    if (cartError) console.error('Error fetching cart items:', cartError)
    else if (cartItems && cartItems.length > 0) {
      items.value = cartItems.map((c) => ({
        id: c.product.id,
        name: c.product.prod_name,
        price: Number(c.product.price),
        quantity: c.quantity,
        image: Array.isArray(c.product.main_img_urls) ? c.product.main_img_urls[0] : null,
      }))
      shopId.value = cartItems[0].product.shop_id
    }

    if (shopId.value) {
      const { data: shop, error } = await supabase
        .from('shops')
        .select('open_time, close_time, meetup_details')
        .eq('id', shopId.value)
        .single()

      if (!error && shop) {
        const [openHour] = shop.open_time?.split(':').map(Number) || [9]
        const [closeHour] = shop.close_time?.split(':').map(Number) || [19]
        shopSchedule.value.openHour = openHour
        shopSchedule.value.closeHour = closeHour
        shopSchedule.value.meetupDetails = shop.meetup_details || 'No meetup details provided'
      }
    }
  } catch (err) {
    console.error('Unexpected error in onMounted:', err)
  }
})

// 🕒 VALIDATION
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

// ✅ DATE/TIME PICKER ACTIONS
const openDatePicker = () => (showDatePicker.value = true)
const confirmDate = () => {
  showDatePicker.value = false
  openTimePicker()
}
const confirmTime = () => {
  if (!isWithinShopHours(deliveryDate.value, deliveryTime.value)) {
    alert(scheduleError.value)
    return
  }
  showTimePicker.value = false
}

// 💳 CHECKOUT
const handleCheckout = async () => {
  if (!buyer.value || !address.value) return alert('Missing user/address info');

  try {
    // 1️⃣ Create the order first (without transaction number)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: buyer.value.id,
        address_id: address.value.id,
        total_amount: totalPrice.value,
        status: 'pending',
        payment_method: paymentMethod.value,
        delivery_date: deliveryDate.value || null,
        delivery_time: deliveryTime.value || null,
        note: note.value || null,
      })
      .select()
      .single();

    if (orderError || !order) return alert('Failed to create order');

    // 2️⃣ Store order ID
    currentOrderId.value = order.id;

    // 3️⃣ Generate transaction number
    transactionNumber.value = `TX-${order.id.slice(0, 8).toUpperCase()}`;

    // 4️⃣ Update order with transaction number
    const { error: txError } = await supabase
      .from('orders')
      .update({ transaction_number: transactionNumber.value })
      .eq('id', order.id);

    if (txError) console.error('Failed to update transaction number:', txError);

    // 5️⃣ Save order items
    const orderItems = items.value.map((item) => ({
      order_id: order.id,
      product_id: item.id,
      quantity: item.quantity || 1,
      price: item.price,
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) return alert('Failed to save order items');

    // 6️⃣ Create payment record
    const { error: paymentError } = await supabase.from('payments').insert({
      order_id: order.id,
      amount: totalPrice.value,
      status: 'pending',
    });
    if (paymentError) console.error('Failed to create payment:', paymentError);

    // 7️⃣ Show confirmation dialog and start countdown
    showDialog.value = true;
    countdown.value = 300;
    startCountdown();
  } catch (err) {
    console.error('Error during checkout:', err);
    alert('Something went wrong during checkout.');
  }
};

// ❌ CANCEL ORDER
const handleCancel = async () => {
  if (countdownInterval) clearInterval(countdownInterval)
  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', currentOrderId.value)
    .eq('status', 'pending')

  if (error) return alert('Failed to cancel order')
  await supabase.from('payments').update({ status: 'failed' }).eq('order_id', currentOrderId.value)
  showDialog.value = false
  alert('Order canceled successfully.')
}

// 🚚 DELIVERY OPTIONS
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

/* 🕓 ---------------- 12-HOUR TIME PICKER LOGIC ---------------- */
// hours (1–12) + minutes (00–59)
const hours12 = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

// currently selected values
const selectedHour = ref('09')
const selectedMinute = ref('00')
const selectedPeriod = ref<'AM' | 'PM'>('AM')

// Update deliveryTime → converts to 24-hour format before saving
const updateTime = () => {
  let hourNum = parseInt(selectedHour.value)
  if (selectedPeriod.value === 'PM' && hourNum < 12) hourNum += 12
  if (selectedPeriod.value === 'AM' && hourNum === 12) hourNum = 0
  deliveryTime.value = `${hourNum.toString().padStart(2, '0')}:${selectedMinute.value}`
}

// User selects an hour or minute
const selectHour = (hour: string) => {
  selectedHour.value = hour
  updateTime()
}
const selectMinute = (minute: string) => {
  selectedMinute.value = minute
  updateTime()
}

// Whenever AM/PM toggles, also update time
watch(selectedPeriod, updateTime)

// Open picker
const openTimePicker = () => {
  selectedHour.value = deliveryTime.value ? deliveryTime.value.split(':')[0] : '09'
  selectedMinute.value = deliveryTime.value ? deliveryTime.value.split(':')[1] : '00'
  showTimePicker.value = true
}

// Confirm combined date & time picker
const confirmDateTime = () => {
  updateTime() // convert selectedHour + selectedMinute + AM/PM → 24h format
  if (!isWithinShopHours(deliveryDate.value, deliveryTime.value)) {
    alert(scheduleError.value)
    return
  }
  showDateTimePicker.value = false
}
</script>

<template>
  <v-app>
    <v-main>
      <!-- Top Bar -->
      <v-app-bar color="#438fda" dark flat>
        <v-btn icon @click="router.back()"><v-icon>mdi-arrow-left</v-icon></v-btn>
        <v-toolbar-title>Transaction Process</v-toolbar-title>
      </v-app-bar>

      <v-container class="py-4" fluid>
        <!-- Buyer Info -->
        <v-card class="mb-4" outlined>
          <v-card-title>Delivery Details</v-card-title>
          <v-card-text>
            <div class="buyer-info">
              <p><strong>Name:</strong> {{ buyer?.first_name }} {{ buyer?.last_name }}</p>
              <p><strong>Contact:</strong> {{ buyer?.phone }}</p>
              <p><strong>Address:</strong> {{ address?.street }}, {{ address?.city }}</p>
              <p><strong>Transaction No.:</strong> {{ transactionNumber }}</p>
              <p>
                <strong>Delivery Schedule:</strong>
                {{ deliveryDate || 'Not set' }} {{ deliveryTime ? `at ${deliveryTime}` : '' }}
              </p>

              <!-- Optional warning display -->
              <p v-if="scheduleError" class="text-red-600 mt-1">{{ scheduleError }}</p>

              <!-- Optional warning display -->
              <p v-if="scheduleError" class="text-red-600 mt-1">{{ scheduleError }}</p>

              <div class="mt-2 flex gap-2">
                <v-btn size="small" color="primary" variant="tonal">Change Address</v-btn>
                <v-btn
                  size="small"
                  color="primary"
                  variant="tonal"
                  @click="showDateTimePicker = true"
                >
                  Change Delivery Schedule
                </v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Items -->
        <v-card class="mb-4" outlined>
          <v-card-title>Items to Purchase</v-card-title>
          <v-list-item v-for="item in items" :key="item.id">
            <v-list-item-avatar>
              <v-img :src="item.image" alt="product" />
            </v-list-item-avatar>

            <v-list-item-title>{{ item.name }}</v-list-item-title>
            <v-list-item-subtitle>₱{{ item.price }} each</v-list-item-subtitle>

            <div class="d-flex align-center gap-2 mt-2">
              <v-btn size="small" color="error" variant="tonal" @click="decreaseQty(item)">−</v-btn>
              <span class="mx-2">{{ item.quantity }}</span>
              <v-btn size="small" color="primary" variant="tonal" @click="increaseQty(item)"
                >+</v-btn
              >
            </div>
          </v-list-item>

          <v-divider></v-divider>
          <v-card-text class="text-right font-bold">Total: ₱{{ totalPrice }}</v-card-text>
        </v-card>

        <!-- ✨ Note / Message to Seller -->
        <v-card class="mb-4" outlined>
          <v-card-title>Message to Seller</v-card-title>
          <v-card-text>
            <v-textarea
              v-model="note"
              label="Write something (e.g. request or instruction)"
              auto-grow
              rows="2"
              outlined
            ></v-textarea>
          </v-card-text>
        </v-card>

        <!-- Delivery Options -->
        <v-select
          v-model="deliveryOption"
          :items="deliveryOptionsDisplay"
          item-title="label"
          item-value="value"
          label="Select delivery option"
          outlined
          dense
        ></v-select>

        <!-- Payment Method -->
        <v-card class="mb-4" outlined>
          <v-card-title>Payment Method</v-card-title>
          <v-card-text>
            <v-radio-group v-model="paymentMethod">
              <v-radio label="Cash on Delivery (Default)" value="cash" />
            </v-radio-group>
          </v-card-text>
        </v-card>

        <!-- Checkout -->
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

      <!-- 🗓 Combined Date & Time Picker -->
      <v-dialog v-model="showDateTimePicker" max-width="420" transition="dialog-bottom-transition">
        <v-card class="rounded-xl elevation-10 pa-4">
          <v-card-title class="justify-center text-h6 font-bold text-primary">
            Select Delivery Schedule
          </v-card-title>

          <v-card-text>
            <!-- Date Picker -->
            <v-date-picker
              v-model="deliveryDate"
              color="primary"
              elevation="0"
              show-adjacent-months
              rounded="xl"
            ></v-date-picker>

            <!-- Divider -->
            <v-divider class="my-4"></v-divider>

            <!-- Time Picker Section -->
            <div class="text-center mb-2 text-subtitle-1 font-bold">Select Time</div>
            <div class="d-flex justify-center align-center gap-4">
              <!-- Hour -->
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

              <div class="text-h5 font-bold text-gray-500">:</div>

              <!-- Minute -->
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

            <!-- AM/PM -->
            <div class="text-center mt-3">
              <v-btn-toggle
                v-model="selectedPeriod"
                color="primary"
                rounded="pill"
                divided
                class="mx-auto"
              >
                <v-btn value="AM">AM</v-btn>
                <v-btn value="PM">PM</v-btn>
              </v-btn-toggle>
            </div>

            <!-- Selected Time Preview -->
            <div class="text-center mt-4">
              <div class="text-h6 font-bold">Selected Schedule</div>
              <div class="text-h5 text-primary mt-1">
                {{ deliveryDate || 'Not set' }} — {{ selectedHour }}:{{ selectedMinute }}
                {{ selectedPeriod }}
              </div>
            </div>
          </v-card-text>

          <v-card-actions class="justify-end">
            <v-btn text @click="showDateTimePicker = false">Cancel</v-btn>
            <v-btn color="primary" variant="flat" @click="confirmDateTime">Confirm</v-btn>
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

.digital-time-picker {
  font-size: 1.5rem; /* Bigger numbers */
  font-weight: bold;
}

.digital-time-picker .v-time-picker-clock__item {
  border-radius: 50%;
}

.digital-time-picker .v-time-picker-clock__item--selected {
  background-color: #438fda !important; /* Primary highlight */
  color: white !important;
}
.gap-2 {
  gap: 8px;
}
.mx-2 {
  margin: 0 8px;
}

.time-wheel {
  width: 70px;
  background: #f5f7fa;
  border-radius: 14px;
  border: 1px solid #e0e0e0;
  overflow-y: auto;
  text-align: center;
  scroll-behavior: smooth;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
}

.time-item {
  height: 40px;
  line-height: 40px;
  cursor: pointer;
  font-weight: 500;
  color: #555;
  transition: all 0.25s ease;
  border-radius: 8px;
  margin: 2px;
}

.time-item:hover {
  background-color: #e3f2fd;
  color: #1976d2;
}

.time-item.active {
  background-color: #438fda;
  color: white;
  font-weight: bold;
  transform: scale(1.05);
}

.v-btn-toggle {
  border: 1px solid #ddd;
  background: #f9fafb;
}

.v-btn-toggle .v-btn {
  font-weight: bold;
  text-transform: none;
}
</style>
