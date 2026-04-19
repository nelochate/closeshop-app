<script setup>
import { useRouter } from 'vue-router'
import { useAuthUserStore } from '@/stores/authUser'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

const router = useRouter()
const authStore = useAuthUserStore()
const isNative = Capacitor.isNativePlatform()

// Navigation functions
const goBack = () => {
  router.back()
}

const goEditProfile = () => {
  router.push('/edit-profile')
}

const goMyAddresses = () => {
  router.push('/my-address')
}

const goNotificationSettings = () => {
  router.push('/notification-settings')
}

const goChatSettings = () => {
  router.push('/chat-settings')
}

const goHelpSupport = async () => {
  const helpUrl = 'https://closeshop-webpage.vercel.app'

  if (isNative) {
    await Browser.open({
      url: helpUrl,
      presentationStyle: 'popover',
      toolbarColor: '#3f83c7'
    })
  } else {
    window.open(helpUrl, '_blank')
  }
}
const goRidersPortal  = async () => {
  const helpUrl = 'https://closeshop-webpage.vercel.app'

  if (isNative) {
    await Browser.open({
      url: helpUrl,
      presentationStyle: 'popover',
      toolbarColor: '#3f83c7'
    })
  } else {
    window.open(helpUrl, '_blank')
  }
}


// Logout
const handleLogout = async () => {
  try {
    await authStore.signOut()
    router.push({ name: 'login' })
  } catch (error) {
    console.error('Logout failed:', error)
    alert('Something went wrong while logging out.')
  }
}
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar class="app-bar" flat color="#3f83c7" dark density="comfortable">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title><strong>Account Settings</strong></v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-list density="comfortable" class="settings-list">
        <br>
        <p class="category">My Account</p>
        <v-divider/>

        <div class="settings-container">
          <v-list-item @click="goEditProfile" prepend-icon="mdi-account-edit-outline">
            <v-list-item-title>Edit Profile</v-list-item-title>
          </v-list-item>
          <v-divider />

          <v-list-item @click="goMyAddresses" prepend-icon="mdi-map-outline">
            <v-list-item-title>My Addresses</v-list-item-title>
          </v-list-item>
        </div>

        <div class="settings-container">
          <p class="category">Settings</p>
          <v-divider/>

          <v-list-item @click="goNotificationSettings" prepend-icon="mdi-bell-outline">
            <v-list-item-title>Notification settings</v-list-item-title>
          </v-list-item>

          <v-divider />

          <v-list-item @click="goChatSettings" prepend-icon="mdi-chat-outline">
            <v-list-item-title>Chat Settings</v-list-item-title>
          </v-list-item>
        </div>

        <div class="settings-container">
          <p class="category">Support</p>
          <v-divider/>

          <v-list-item @click="goHelpSupport" prepend-icon="mdi-help-circle-outline">
            <v-list-item-title>Help & Support</v-list-item-title>
          </v-list-item>
          <v-divider/>

          <v-list-item @click="goRidersPortal" prepend-icon="mdi-motorbike">
            <v-list-item-title>Want to be a Rider?</v-list-item-title>
          </v-list-item>
          <v-divider/>
        </div>

        <div class="mt-4">
          <v-list-item @click="handleLogout" prepend-icon="mdi-logout" class="logout">
            <v-list-item-title>Switch Account/Logout</v-list-item-title>
          </v-list-item>
        </div>
      </v-list>
    </v-main>
  </v-app>
</template>

<style scoped>
/* =========================================
   SAFE AREA + GLOBAL MOBILE FRIENDLY LAYOUT
========================================= */
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
  margin-top: 20px;
}

/* =========================================
   APP BAR
========================================= */
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

/* =========================================
   SETTINGS LIST WRAPPER
========================================= */
.settings-list {
  margin: 18px 14px 24px;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  padding-bottom: 10px;
}

/* =========================================
   SECTION CONTAINER
========================================= */
.settings-container {
  padding: 10px 0;
}

/* =========================================
   CATEGORY TITLES
========================================= */
.category {
  margin: 14px 18px 10px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

/* =========================================
   LIST ITEMS
========================================= */
.settings-list :deep(.v-list-item) {
  min-height: 58px;
  padding-left: 18px;
  padding-right: 18px;
  transition: all 0.25s ease;
  border-radius: 0;
}

.settings-list :deep(.v-list-item:hover) {
  background: #f8fafc;
}

.settings-list :deep(.v-list-item-title) {
  font-size: 0.98rem;
  font-weight: 500;
  color: #1f2937;
}

.settings-list :deep(.v-icon) {
  color: #3f83c7;
  font-size: 22px;
}

/* =========================================
   DIVIDERS
========================================= */
.settings-list :deep(.v-divider) {
  opacity: 0.55;
  margin-left: 16px;
  margin-right: 16px;
}

/* =========================================
   LOGOUT BUTTON
========================================= */

.logout {
  border-radius: 14px !important;
  background: #fff5f5;
  color: #72710c !important;
  font-weight: 700;
  border: 1px solid rgba(211, 47, 47, 0.08);
}

.logout :deep(.v-icon),
.logout :deep(.v-list-item-title) {
  color: #e37b1a !important;
}

.logout:hover {
  background: #ffeaea !important;
}

/* =========================================
   TABLET
========================================= */
@media (min-width: 768px) {
  .settings-list {
    max-width: 700px;
    margin: 24px auto;
  }

  .category {
    font-size: 0.85rem;
  }

  .settings-list :deep(.v-list-item-title) {
    font-size: 1rem;
  }
}

/* =========================================
   MOBILE
========================================= */
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
    min-height: 54px;
    padding-left: 14px;
    padding-right: 14px;
  }

  .settings-list :deep(.v-list-item-title) {
    font-size: 0.94rem;
  }

  .settings-list :deep(.v-icon) {
    font-size: 21px;
  }

  .align-center {
    padding: 8px 12px 4px;
  }
}

/* =========================================
   EXTRA SMALL DEVICES / IPHONE MINI / NOTCH
========================================= */
@media (max-width: 390px) {
  .app-bar :deep(.v-toolbar-title) {
    font-size: 0.96rem;
  }

  .settings-list {
    margin: 10px 8px 18px;
  }

  .settings-list :deep(.v-list-item) {
    min-height: 52px;
  }

  .settings-list :deep(.v-list-item-title) {
    font-size: 0.9rem;
  }

  .category {
    font-size: 0.72rem;
  }
}
</style>
