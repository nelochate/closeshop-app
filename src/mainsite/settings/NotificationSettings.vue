<template>
  <v-app>
    <v-app-bar class="app-bar" flat color="#3f83c7" dark density="comfortable">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title><strong>Notification Settings</strong></v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-list density="comfortable" class="settings-list">
        <div class="settings-header">
          <p class="category">Push Alerts</p>
          <p class="helper-copy">
            Only working notification features appear here. These toggles control native push alerts
            for your device and order-related updates already sent through CloseShop.
          </p>
        </div>

        <v-progress-linear v-if="loading" indeterminate color="#3f83c7" class="mb-2" />

        <div class="settings-container">
          <v-divider />

          <v-list-item>
            <template #prepend>
              <v-icon>mdi-bell-ring</v-icon>
            </template>
            <v-list-item-title>Enable Push Notifications</v-list-item-title>
            <v-list-item-subtitle>
              Allow CloseShop to send native push notifications to this device.
            </v-list-item-subtitle>
            <template #append>
              <v-switch
                v-model="settings.enabled"
                color="#3f83c7"
                hide-details
                :disabled="loading || saving"
              />
            </template>
          </v-list-item>

          <v-divider />

          <v-list-item>
            <template #prepend>
              <v-icon>mdi-truck-delivery-outline</v-icon>
            </template>
            <v-list-item-title>Enable Order Notifications</v-list-item-title>
            <v-list-item-subtitle>
              Receive push alerts for order placement, shipping updates, and delivery events.
            </v-list-item-subtitle>
            <template #append>
              <v-switch
                v-model="settings.orderUpdates"
                color="#3f83c7"
                hide-details
                :disabled="loading || saving"
              />
            </template>
          </v-list-item>
        </div>

        <div class="save-button-container">
          <v-btn
            class="save-btn"
            color="#3f83c7"
            block
            size="large"
            :loading="saving"
            :disabled="loading"
            @click="saveSettings"
          >
            Save Changes
          </v-btn>
        </div>
      </v-list>
    </v-main>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3200">
      {{ snackbar.text }}
      <template #actions>
        <v-btn variant="text" @click="snackbar.show = false">Close</v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthUserStore } from '@/stores/authUser'
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
} from '@/utils/notificationPreferences'
import { syncPushNotificationPreferences } from '@/utils/mobilePushNotifications'

const router = useRouter()
const authStore = useAuthUserStore()

const loading = ref(true)
const saving = ref(false)
const settings = ref({
  enabled: true,
  orderUpdates: true,
})

const snackbar = ref({
  show: false,
  text: '',
  color: 'success',
})

const getCurrentUserId = () => authStore.userData?.id || authStore.userId

const goBack = () => {
  router.back()
}

const loadSettings = async () => {
  const userId = getCurrentUserId()
  if (!userId) {
    loading.value = false
    return
  }

  loading.value = true

  try {
    const preferences = await fetchNotificationPreferences(userId)
    settings.value = {
      enabled: preferences.enabled,
      orderUpdates: preferences.orderUpdates,
    }
  } catch (error) {
    console.error('Failed to load notification settings:', error)
    snackbar.value = {
      show: true,
      text: 'Could not load notification settings.',
      color: 'error',
    }
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  const userId = getCurrentUserId()
  if (!userId) {
    snackbar.value = {
      show: true,
      text: 'Please sign in again to update notification settings.',
      color: 'error',
    }
    return
  }

  saving.value = true

  try {
    const updatedPreferences = await saveNotificationPreferences({
      userId,
      preferences: {
        enabled: settings.value.enabled,
        orderUpdates: settings.value.orderUpdates,
      },
    })

    settings.value = {
      enabled: updatedPreferences.enabled,
      orderUpdates: updatedPreferences.orderUpdates,
    }

    await syncPushNotificationPreferences(userId, updatedPreferences)

    snackbar.value = {
      show: true,
      text: 'Notification settings saved.',
      color: 'success',
    }
  } catch (error) {
    console.error('Failed to save notification settings:', error)
    snackbar.value = {
      show: true,
      text: 'Could not save notification settings.',
      color: 'error',
    }
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
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

.settings-header {
  padding: 18px 18px 12px;
}

.settings-container {
  padding: 4px 0 10px;
}

.category {
  margin: 0 0 10px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.helper-copy {
  margin: 0;
  color: #64748b;
  font-size: 0.84rem;
  line-height: 1.5;
}

.settings-list :deep(.v-list-item) {
  min-height: 68px;
  padding-left: 18px;
  padding-right: 18px;
  transition: all 0.25s ease;
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

  .settings-header {
    padding: 16px 16px 12px;
  }

  .category {
    font-size: 0.75rem;
  }

  .settings-list :deep(.v-list-item) {
    min-height: 62px;
    padding-left: 14px;
    padding-right: 14px;
  }

  .save-button-container {
    padding: 16px 14px;
  }
}
</style>
