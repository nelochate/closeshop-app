<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Capacitor } from '@capacitor/core'

const router = useRouter()
const email = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const showSuccessSnackbar = ref(false)
const showErrorSnackbar = ref(false)

const isMobile = Capacitor.isNativePlatform()
const isDevelopment = import.meta.env.DEV

// Function to get the correct redirect URL
const getRedirectUrl = () => {
  if (isMobile) {
    // For mobile app - redirect to Vercel web page (opens in browser)
    return 'https://closeshop.vercel.app/update-password'
  } else {
    // For web platform
    if (isDevelopment) {
      return `${window.location.origin}/update-password`
    } else {
      return 'https://closeshop.vercel.app/update-password'
    }
  }
}

const sendResetLink = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!email.value) {
    errorMessage.value = 'Please enter your email address'
    showErrorSnackbar.value = true
    setTimeout(() => {
      errorMessage.value = ''
      showErrorSnackbar.value = false
    }, 4000)
    return
  }

  if (!/\S+@\S+\.\S+/.test(email.value)) {
    errorMessage.value = 'Please enter a valid email address'
    showErrorSnackbar.value = true
    setTimeout(() => {
      errorMessage.value = ''
      showErrorSnackbar.value = false
    }, 4000)
    return
  }

  try {
    isLoading.value = true

    const redirectUrl = getRedirectUrl()
    console.log('Sending reset link with redirect to:', redirectUrl)

    const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
      redirectTo: redirectUrl,
    })

    if (error) {
      console.error('Password reset error:', error)
      throw error
    }

    let successMsg = ''
    if (isMobile) {
      successMsg = 'Password reset link sent! Check your email. The link will open in your browser.'
    } else {
      successMsg = 'Password reset link sent! Check your email inbox.'
    }

    successMessage.value = successMsg
    showSuccessSnackbar.value = true
    setTimeout(() => {
      successMessage.value = ''
      showSuccessSnackbar.value = false
    }, 5000)

  } catch (error) {
    console.error('Full error:', error)
    errorMessage.value = 'Failed to send reset link. Please try again.'
    showErrorSnackbar.value = true
    setTimeout(() => {
      errorMessage.value = ''
      showErrorSnackbar.value = false
    }, 5000)
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
    <v-main class="bg-gradient">
      <!-- Decorative Circles -->
      <div class="circle-deco circle-1"></div>
      <div class="circle-deco circle-2"></div>
      <div class="circle-deco circle-3"></div>
      <div class="circle-deco circle-4"></div>

      <v-container class="fill-height" fluid>
        <v-row align="center" justify="center">
          <!-- Back to Login Button - Mobile Safe -->
          <div class="back-button-container">
            <v-btn
              class="back-to-login-btn"
              variant="text"
              @click="goToLogin"
              :disabled="isLoading"
              size="small"
              icon
            >
              <v-icon size="28" class="back-icon">mdi-arrow-left</v-icon>
            </v-btn>
          </div>

          <v-col cols="12" sm="8" md="6" lg="4">
            <v-card class="pa-4 pa-sm-6 elevation-10">
              <div class="text-center mb-6 mt-2">
                <div class="icon-wrapper">
                  <v-icon color="primary" size="64" class="mb-2">mdi-lock-reset</v-icon>
                </div>
                <h1 class="text-h5 font-weight-bold gradient-text">Forgot Password</h1>
                <p class="text-body-2 text-grey-darken-1 mt-2">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
                <p v-if="isMobile" class="text-caption text-primary mt-1">
                  <v-icon size="14">mdi-open-in-browser</v-icon>
                  The reset link will open in your browser
                </p>
              </div>

              <v-form @submit.prevent="sendResetLink" v-if="!successMessage">
                <v-text-field
                  v-model="email"
                  label="Email Address"
                  type="email"
                  required
                  variant="outlined"
                  class="mb-4"
                  :disabled="isLoading"
                  placeholder="Enter your email address"
                  prepend-inner-icon="mdi-email"
                  :error="!!errorMessage"
                />

                <v-btn
                  type="submit"
                  color="primary"
                  block
                  :loading="isLoading"
                  :disabled="isLoading"
                  class="reset-btn mb-4"
                  size="large"
                >
                  <v-icon left>mdi-send</v-icon>
                  {{ isLoading ? 'Sending...' : 'Send Reset Link' }}
                </v-btn>
              </v-form>

              <div class="text-center">
                <v-divider class="my-3" />
                <p class="register-link">
                  Don't have an account? <RouterLink to="/register">Register</RouterLink>
                </p>
              </div>

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

      <!-- Snackbar Messages -->
      <v-snackbar
        v-model="showSuccessSnackbar"
        color="success"
        timeout="5000"
        location="top"
        variant="flat"
        :style="{ marginTop: 'max(20px, env(safe-area-inset-top))' }"
      >
        <v-icon start>mdi-check-circle</v-icon>
        {{ successMessage }}
      </v-snackbar>

      <v-snackbar
        v-model="showErrorSnackbar"
        color="error"
        timeout="5000"
        location="top"
        variant="flat"
        :style="{ marginTop: 'max(20px, env(safe-area-inset-top))' }"
      >
        <v-icon start>mdi-alert-circle</v-icon>
        {{ errorMessage }}
      </v-snackbar>
    </v-main>
  </v-app>
</template>

<style scoped>
.bg-gradient {
  min-height: 100vh;
  background: linear-gradient(135deg, #2e73b8 0%, #667eea 50%);
  position: relative;
  overflow: hidden;
}

/* Decorative Circles */
.circle-deco {
  position: absolute;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  pointer-events: none;
}

.circle-1 {
  top: -40px;
  right: -40px;
  width: 155px;
  height: 148px;
  background-color: rgba(255, 255, 255, 0.15);
}

.circle-2 {
  bottom: -60px;
  left: -60px;
  width: 200px;
  height: 200px;
  background-color: rgba(255, 255, 255, 0.1);
}

.circle-3 {
  top: 50%;
  left: -80px;
  width: 180px;
  height: 180px;
  background-color: rgba(255, 255, 255, 0.08);
  transform: translateY(-50%);
}

.circle-4 {
  bottom: 20%;
  right: -50px;
  width: 120px;
  height: 120px;
  background-color: rgba(255, 255, 255, 0.06);
}

/* Back Button Container */
.back-button-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  padding: env(safe-area-inset-top) 12px 0 12px;
  z-index: 100;
  pointer-events: none;
}

.back-to-login-btn {
  pointer-events: auto;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  transition: all 0.3s ease;
  margin-top: max(12px, env(safe-area-inset-top));
}

.back-to-login-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

.back-icon {
  font-weight: 900;
  color: white;
}

.v-card {
  position: relative;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  z-index: 1;
}

.gradient-text {
  background: linear-gradient(135deg, #2e73b8 0%, #667eea 50%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.icon-wrapper {
  display: inline-block;
  padding: 12px;
  background: rgba(46, 115, 184, 0.1);
  border-radius: 50%;
}

.register-link {
  margin-top: 0.8rem;
  font-size: 13px;
  color: #666;
  text-align: center;
}

.register-link a {
  color: #2e73b8;
  text-decoration: none;
  font-weight: 600;
}

.reset-btn {
  font-weight: 600;
  border-radius: 10px;
  height: 48px;
  text-transform: none;
  font-size: 16px;
}

:deep(.v-snackbar) {
  z-index: 9999;
}

@media (max-width: 600px) {
  .circle-2, .circle-3, .circle-4 {
    transform: scale(0.8);
  }
  .reset-btn {
    height: 44px;
    font-size: 14px;
  }
  .back-to-login-btn {
    margin-top: max(8px, env(safe-area-inset-top));
  }
}

@supports (padding: max(0px)) {
  .back-button-container {
    padding-left: max(12px, env(safe-area-inset-left));
    padding-right: max(12px, env(safe-area-inset-right));
  }
}
</style> 