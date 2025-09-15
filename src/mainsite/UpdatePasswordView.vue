<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()

// Form state
const newPassword = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)

// Messages
const errorMessage = ref('')
const successMessage = ref('')

// Utility: clear error after a delay
const clearErrorMessages = () => {
  setTimeout(() => {
    errorMessage.value = ''
  }, 4000)
}

const updatePassword = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    clearErrorMessages()
    return
  }

  if (newPassword.value.length < 6) {
    errorMessage.value = 'Password must be at least 6 characters long.'
    clearErrorMessages()
    return
  }

  try {
    isLoading.value = true

    // ✅ Supabase v2 way to update password
    const { error } = await supabase.auth.updateUser({
      password: newPassword.value,
    })

    if (error) throw error

    successMessage.value = 'Password updated successfully!'
    setTimeout(() => {
      router.push('/')
    }, 2000)
  } catch (err) {
    errorMessage.value = err.message || 'Something went wrong.'
    clearErrorMessages()
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <v-app>
    <v-main class="bg-gradient">
      <v-container class="fill-height" fluid>

        <!-- Success Message -->
        <v-alert v-if="successMessage" type="success" variant="tonal" class="overlay-alert" density="comfortable">
          <v-icon color="success" start>mdi-check-circle</v-icon>
          {{ successMessage }}
        </v-alert>

        <!-- Error Message -->
        <v-alert v-if="errorMessage" type="error" variant="tonal" class="overlay-alert" density="comfortable">
          <v-icon color="error" start>mdi-alert-circle</v-icon>
          {{ errorMessage }}
        </v-alert>
        <v-row align="center" justify="center">
          <v-col cols="12" sm="8" md="6" lg="4">
            <v-card class="pa-6 elevation-10" :loading="isLoading">

              <!-- Header -->
              <div class="text-center mb-6">
                <v-icon color="primary" size="64" class="mb-3">
                  mdi-key
                </v-icon>
                <v-card-title class="text-h5 font-weight-bold justify-center pa-0">
                  Update Password
                </v-card-title>
                <p class="text-medium-emphasis mt-2">
                  Enter your new password below
                </p>
              </div>

              <!-- Form -->
              <v-form @submit.prevent="updatePassword">
                <v-text-field v-model="newPassword" label="New Password" type="password" variant="outlined"
                  prepend-inner-icon="mdi-lock-outline" required />
                <v-text-field v-model="confirmPassword" label="Confirm Password" type="password" variant="outlined"
                  prepend-inner-icon="mdi-lock-check-outline" required />

                <v-btn type="submit" color="primary" block :loading="isLoading" class="mt-4">
                  <v-icon start>
                    {{ isLoading ? 'mdi-loading' : 'mdi-check-circle' }}
                  </v-icon>
                  {{ isLoading ? 'Updating...' : 'Update Password' }}
                </v-btn>
              </v-form>

              <!-- Back -->
              <div class="text-center mt-4">
                <v-btn variant="text" color="primary" @click="router.push('/')">
                  <v-icon start>mdi-arrow-left</v-icon>
                  Back to Login
                </v-btn>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.bg-gradient {
  min-height: 100vh;
}

.v-card {
  border-radius: 16px;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.95);
}

/* Overlay alerts (don’t move layout) */
.overlay-alert {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 280px;
  max-width: 10%;
  z-index: 9999;
}
</style>
