<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar class="app-bar" flat color="#3f83c7" dark density="comfortable">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title><strong>Chat Settings</strong></v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-list density="comfortable" class="settings-list">
        <!-- Chat Preferences -->
        <div class="settings-container">
          <br>
          <p class="category">Chat Preferences</p>
          <v-divider />

          <v-list-item>
            <template v-slot:prepend>
              <v-icon>mdi-bell-outline</v-icon>
            </template>
            <v-list-item-title>Message Notifications</v-list-item-title>
            <v-list-item-subtitle>Get notified when you receive new messages</v-list-item-subtitle>
            <template v-slot:append>
              <v-switch v-model="chatSettings.notifications" color="#3f83c7" hide-details></v-switch>
            </template>
          </v-list-item>
          <v-divider />

          <v-list-item>
            <template v-slot:prepend>
              <v-icon>mdi-volume-off</v-icon>
            </template>
            <v-list-item-title>Mute All Chats</v-list-item-title>
            <v-list-item-subtitle>Temporarily silence all chat notifications</v-list-item-subtitle>
            <template v-slot:append>
              <v-switch v-model="chatSettings.muteAll" color="#3f83c7" hide-details></v-switch>
            </template>
          </v-list-item>
        </div>

        <!-- Privacy Settings -->
        <div class="settings-container">
          <p class="category">Privacy</p>
          <v-divider />

          <v-list-item>
            <template v-slot:prepend>
              <v-icon>mdi-eye-off</v-icon>
            </template>
            <v-list-item-title>Read Receipts</v-list-item-title>
            <v-list-item-subtitle>Let others know when you've read their messages</v-list-item-subtitle>
            <template v-slot:append>
              <v-switch v-model="chatSettings.readReceipts" color="#3f83c7" hide-details></v-switch>
            </template>
          </v-list-item>
          <v-divider />

          <v-list-item>
            <template v-slot:prepend>
              <v-icon>mdi-account</v-icon>
            </template>
            <v-list-item-title>Show Online Status</v-list-item-title>
            <v-list-item-subtitle>Let shop owners see when you're online</v-list-item-subtitle>
            <template v-slot:append>
              <v-switch v-model="chatSettings.onlineStatus" color="#3f83c7" hide-details></v-switch>
            </template>
          </v-list-item>
        </div>

        <!-- Blocked Shops/Users -->
        <div class="settings-container">
          <p class="category">Blocked Contacts</p>
          <v-divider />

          <v-list-item v-if="blockedUsers.length === 0">
            <template v-slot:prepend>
              <v-icon>mdi-account-off</v-icon>
            </template>
            <v-list-item-title>No blocked contacts</v-list-item-title>
            <v-list-item-subtitle>Shops or users you block will appear here</v-list-item-subtitle>
          </v-list-item>

          <v-list-item v-for="user in blockedUsers" :key="user.id" class="blocked-user">
            <template v-slot:prepend>
              <v-avatar size="36" color="#e2e8f0">
                <v-icon color="#3f83c7">mdi-store</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title>{{ user.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ user.type }}</v-list-item-subtitle>
            <template v-slot:append>
              <v-btn
                variant="text"
                color="primary"
                size="small"
                @click="unblockUser(user)"
              >
                Unblock
              </v-btn>
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

    <!-- Confirmation Dialog -->
    <v-dialog v-model="confirmDialog.show" max-width="320">
      <v-card>
        <v-card-title class="text-h6">Confirm</v-card-title>
        <v-card-text>{{ confirmDialog.message }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="confirmDialog.show = false">Cancel</v-btn>
          <v-btn color="primary" variant="text" @click="confirmDialog.action">Confirm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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

// Simplified chat settings
const chatSettings = ref({
  notifications: true,
  muteAll: false,
  readReceipts: true,
  onlineStatus: true
})

const blockedUsers = ref([])

const confirmDialog = ref({
  show: false,
  message: '',
  action: null
})

const snackbar = ref({
  show: false,
  text: '',
  color: 'success'
})

// Load saved settings
onMounted(() => {
  const savedSettings = localStorage.getItem('closeshop_chat_settings')
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings)
      chatSettings.value = { ...chatSettings.value, ...parsed }
    } catch (e) {
      console.error('Failed to load chat settings', e)
    }
  }
  
  // Load blocked users
  const savedBlocked = localStorage.getItem('closeshop_blocked_users')
  if (savedBlocked) {
    try {
      blockedUsers.value = JSON.parse(savedBlocked)
    } catch (e) {
      console.error('Failed to load blocked users', e)
    }
  }
})

const goBack = () => {
  router.back()
}

const saveSettings = async () => {
  saving.value = true
  
  // Simulate save delay
  setTimeout(() => {
    localStorage.setItem('closeshop_chat_settings', JSON.stringify(chatSettings.value))
    
    saving.value = false
    snackbar.value = {
      show: true,
      text: 'Chat settings saved successfully!',
      color: 'success'
    }
  }, 500)
}

const unblockUser = (user) => {
  confirmDialog.value = {
    show: true,
    message: `Unblock ${user.name}?`,
    action: () => {
      const index = blockedUsers.value.findIndex(u => u.id === user.id)
      if (index !== -1) {
        blockedUsers.value.splice(index, 1)
        localStorage.setItem('closeshop_blocked_users', JSON.stringify(blockedUsers.value))
        snackbar.value = {
          show: true,
          text: `${user.name} has been unblocked`,
          color: 'success'
        }
      }
      confirmDialog.value.show = false
    }
  }
}

// Example function to block a shop (called from chat screen)
const blockShop = (shopId, shopName) => {
  if (!blockedUsers.value.find(u => u.id === shopId)) {
    blockedUsers.value.push({
      id: shopId,
      name: shopName,
      type: 'Shop'
    })
    localStorage.setItem('closeshop_blocked_users', JSON.stringify(blockedUsers.value))
    snackbar.value = {
      show: true,
      text: `${shopName} has been blocked`,
      color: 'success'
    }
  }
}

// Expose for use in other components
defineExpose({
  blockShop
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

.blocked-user :deep(.v-list-item-title) {
  margin-bottom: 0;
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