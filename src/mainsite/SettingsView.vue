<script setup>
import { useRouter } from 'vue-router'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

// Navigation functions
const goBack = () => {
  router.back()
}

const goEditProfile = () => {
  router.push('/edit-profile')
}

const goChangePassword = () => {
  router.push('/change-password')
}

const goHelpSupport = () => {
  router.push('/help-support')
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
    <v-app-bar flat color="#5ca3eb" dark density="comfortable">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title><strong>Settings</strong></v-toolbar-title>
    </v-app-bar>

    <v-main>
      <div class="settings-container">
        <!-- Settings List -->
        <v-list density="comfortable" class="settings-list">

          <v-list-item @click="goEditProfile" prepend-icon="mdi-account-edit-outline">
            <v-list-item-title>Edit Profile</v-list-item-title>
          </v-list-item>

          <v-divider />

          <v-list-item @click="goChangePassword" prepend-icon="mdi-lock-outline">
            <v-list-item-title>Change Password</v-list-item-title>
          </v-list-item>

          <v-divider />

          <v-list-item @click="goHelpSupport" prepend-icon="mdi-help-circle-outline">
            <v-list-item-title>Help & Support</v-list-item-title>
          </v-list-item>

          <v-divider />

          <v-list-item @click="handleLogout" prepend-icon="mdi-logout" class="logout">
            <v-list-item-title>Logout</v-list-item-title>
          </v-list-item>

        </v-list>
      </div>
    </v-main>
  </v-app>
</template>

<style scoped>
.settings-container {
  padding: 24px;
}

.settings-list {
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
}

.logout {
  color: #d32f2f !important;
  font-weight: 600;
}
</style>
