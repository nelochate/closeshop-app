<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar class="app-bar" flat color="#3f83c7" dark density="comfortable">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title><strong>Notification Settings</strong></v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-list density="comfortable" class="settings-list">
        <!-- Push Notifications -->
        <div class="settings-container">
          <br>
          <p class="category">Notifications</p>
          <v-divider />

          <v-list-item>
            <template v-slot:prepend>
              <v-icon>mdi-bell-ring</v-icon>
            </template>
            <v-list-item-title>Enable Notifications</v-list-item-title>
            <v-list-item-subtitle>Receive notifications on your device</v-list-item-subtitle>
            <template v-slot:append>
              <v-switch v-model="notifications.enabled" color="#3f83c7" hide-details></v-switch>
            </template>
          </v-list-item>
        </div>

        <!-- Order Notifications -->
        <div class="settings-container">
          <p class="category">Order Updates</p>
          <v-divider />

          <v-list-item>
            <template v-slot:prepend>
              <v-icon>mdi-cart</v-icon>
            </template>
            <v-list-item-title>Order Status</v-list-item-title>
            <v-list-item-subtitle>Get notified when your order status changes</v-list-item-subtitle>
            <template v-slot:append>
              <v-switch v-model="notifications.orderStatus" color="#3f83c7" hide-details></v-switch>
            </template>
          </v-list-item>
          <v-divider />

          <v-list-item>
            <template v-slot:prepend>
              <v-icon>mdi-truck-fast</v-icon>
            </template>
            <v-list-item-title>Delivery Updates</v-list-item-title>
            <v-list-item-subtitle>Get notified when your order is out for delivery</v-list-item-subtitle>
            <template v-slot:append>
              <v-switch v-model="notifications.delivery" color="#3f83c7" hide-details></v-switch>
            </template>
          </v-list-item>
        </div>

        <!-- Promotional Notifications -->
        <div class="settings-container">
          <p class="category">Promotions</p>
          <v-divider />

          <v-list-item>
            <template v-slot:prepend>
              <v-icon>mdi-sale</v-icon>
            </template>
            <v-list-item-title>Offers & Deals</v-list-item-title>
            <v-list-item-subtitle>Receive notifications about discounts and promotions</v-list-item-subtitle>
            <template v-slot:append>
              <v-switch v-model="notifications.promotions" color="#3f83c7" hide-details></v-switch>
            </template>
          </v-list-item>
        </div>

        <!-- Save Button -->
        <div class="save-button-container">
          <v-btn
            class="save-btn"
            color="#3f83c7"
            block
            size="large"
            :loading="saving"
            @click="saveSettings"
          >
            Save Changes
          </v-btn>
        </div>
      </v-list>
    </v-main>

    <!-- Snackbar -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">
      {{ snackbar.text }}
      <template v-slot:actions>
        <v-btn variant="text" @click="snackbar.show = false">Close</v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const saving = ref(false)

const notifications = ref({
  enabled: true,
  orderStatus: true,
  delivery: true,
  promotions: false
})

const snackbar = ref({
  show: false,
  text: '',
  color: 'success'
})

onMounted(() => {
  const saved = localStorage.getItem('closeshop_notification_settings')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      notifications.value = { ...notifications.value, ...parsed }
    } catch (e) {
      console.error('Failed to load notification settings', e)
    }
  }
})

const goBack = () => {
  router.back()
}

const saveSettings = async () => {
  saving.value = true
  
  setTimeout(() => {
    localStorage.setItem('closeshop_notification_settings', JSON.stringify(notifications.value))
    
    saving.value = false
    snackbar.value = {
      show: true,
      text: 'Notification settings saved!',
      color: 'success'
    }
  }, 500)
}
</script>

<style scoped>
/* Same styles as Chat Settings */
:root {
  font-family: 'Inter', 'Poppins', 'Roboto', sans-serif;
}

.v-application {
  background: #f5f7fb;
}

v-main,
.v-main {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: max(0px, env(safe-area-inset-left));
  padding-right: max(0px, env(safe-area-inset-right));
  background: #f5f7fb;
  min-height: 100vh;
}

.app-bar {
  padding-top: env(safe-area-inset-top);
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  color: white !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.app-bar :deep(.v-toolbar-title) {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.app-bar :deep(.v-btn) {
  color: white !important;
}

.settings-list {
  margin: 18px 14px 24px;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  padding-bottom: 10px;
}

.settings-container {
  padding: 10px 0;
}

.category {
  margin: 14px 18px 10px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.settings-list :deep(.v-list-item) {
  min-height: 65px;
  padding-left: 18px;
  padding-right: 18px;
  transition: all 0.25s ease;
  border-radius: 0;
}

.settings-list :deep(.v-list-item:hover) {
  background: #f8fafc;
}

.settings-list :deep(.v-list-item-title) {
  font-size: 0.95rem;
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 4px;
}

.settings-list :deep(.v-list-item-subtitle) {
  font-size: 0.75rem;
  color: #6b7280;
}

.settings-list :deep(.v-icon) {
  color: #3f83c7;
  font-size: 22px;
}

.settings-list :deep(.v-divider) {
  opacity: 0.55;
  margin-left: 16px;
  margin-right: 16px;
}

.save-button-container {
  padding: 20px 18px;
}

.save-btn {
  text-transform: none;
  font-weight: 600;
  border-radius: 12px;
}

@media (min-width: 768px) {
  .settings-list {
    max-width: 600px;
    margin: 24px auto;
  }
}

@media (max-width: 600px) {
  .settings-list {
    margin: 12px 10px 20px;
    border-radius: 16px;
  }
  
  .category {
    margin: 12px 16px 8px;
    font-size: 0.75rem;
  }
  
  .settings-list :deep(.v-list-item) {
    min-height: 60px;
    padding-left: 14px;
    padding-right: 14px;
  }
  
  .save-button-container {
    padding: 16px 14px;
  }
}
</style>