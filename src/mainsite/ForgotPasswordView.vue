<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const email = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const sendResetLink = async () => {
  // Reset messages
  errorMessage.value = ''
  successMessage.value = ''

  // Basic email validation
  if (!email.value) {
    errorMessage.value = 'Please enter your email address'
    setTimeout(() => (errorMessage.value = ''), 4000)
    return
  }

  if (!/\S+@\S+\.\S+/.test(email.value)) {
    errorMessage.value = 'Please enter a valid email address'
    setTimeout(() => (errorMessage.value = ''), 4000)
    return
  }

  try {
    isLoading.value = true

    const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
      redirectTo: `${window.location.origin}/update-password`,
    })

    if (error) {
      console.error('Password reset error:', error)
      throw error
    }

    successMessage.value = 'Password reset link sent! Check your email inbox.'
    setTimeout(() => (successMessage.value = ''), 5000)

  } catch (error) {
    console.error('Full error:', error)
    errorMessage.value = 'Failed to send reset link. Please try again.'
    setTimeout(() => (errorMessage.value = ''), 5000)
  } finally {
    isLoading.value = false
  }
}

const goToLogin = () => {
  router.push('/')
}
</script>

<template>
  <v-app>
    <v-main>
      <v-container class="fill-height" fluid>
        <v-row align="center" justify="center">
          <!-- Back to Login (Top Left) -->
          <v-btn class="back-to-login-btn" variant="text" color="primary" @click="goToLogin" :disabled="isLoading"
            size="small">
            <v-icon size="28" class="back-icon">
              mdi-arrow-left
            </v-icon>
          </v-btn>

          <v-col cols="12" sm="8" md="6" lg="4">
            <v-card class="pa-4">

              <!-- Header -->
              <div class="text-center mb-6 mt-6">
                <v-icon color="primary" size="64" class="mb-2">mdi-lock-reset</v-icon>
                <h1 class="text-h6 font-weight-bold">Forgot Password</h1>
                <p class="text-body-2 text-grey-darken-1 mt-2">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </div>

              <!-- Reset Form -->
              <v-form @submit.prevent="sendResetLink" v-if="!successMessage">
                <v-text-field v-model="email" label="Email Address" type="email" required variant="outlined"
                  class="mb-4" :disabled="isLoading" placeholder="Enter your email address"
                  prepend-inner-icon="mdi-email" :error="!!errorMessage" />

                <v-btn type="submit" color="primary" block :loading="isLoading" :disabled="isLoading"
                  class="reset-btn mb-4">
                  <v-icon left>mdi-send</v-icon>
                  {{ isLoading ? 'Sending...' : ' Send Reset Link' }}
                </v-btn>
              </v-form>

              <!-- Action Buttons -->
              <div class="text-center">
                <v-divider class="my-3" />
                <p class="register-link">
                  Don’t have an account? <RouterLink to="/register">Register</RouterLink>
                </p>
              </div>

              <!-- Additional Help -->
              <v-alert v-if="!successMessage" type="info" variant="tonal" class="mt-6" density="compact">
                <template v-slot:prepend>
                  <v-icon color="info">mdi-information</v-icon>
                </template>
                <span class="text-caption">
                  If you don't see the email, check your spam folder or try again in a few minutes.
                </span>
              </v-alert>
            </v-card>
          </v-col>
        </v-row>
      </v-container>

      <!-- Overlay Alerts -->
      <transition name="fade">
        <v-alert v-if="successMessage" type="success" class="overlay-alert" elevation="6">
          {{ successMessage }}
        </v-alert>
      </transition>

      <transition name="fade">
        <v-alert v-if="errorMessage" type="error" class="overlay-alert" elevation="6">
          {{ errorMessage }}
        </v-alert>
      </transition>
    </v-main>
  </v-app>
</template>

<style scoped>
.v-card {
  position: relative;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.v-main {
  min-height: 100vh;
}

.text-h6 {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.back-to-login-btn {
  position: absolute;
  top: 12px;
  left: 12px;
}

.register-link {
  margin-top: 0.8rem;
  font-size: 13px;
  color: #666;
  text-align: center;
  cursor: pointer;
}

.reset-btn {
  margin-top: 1rem;
  font-weight: 600;
  border-radius: 10px;
  height: 45px;
}

/* Overlay Alerts */
.overlay-alert {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 280px;
  max-width: 10%;
  z-index: 9999;
}

/* Fade animation */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.back-icon {
  font-weight: 900;
  text-shadow: 0 0 1px currentColor;
}

</style>
