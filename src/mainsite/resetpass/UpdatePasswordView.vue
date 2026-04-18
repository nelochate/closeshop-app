<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Capacitor } from '@capacitor/core'

const router = useRouter()

const newPassword = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const isValidLink = ref(false)
const isProcessing = ref(true)

// Password visibility toggles
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

// Computed properties for snackbar visibility
const showSuccessSnackbar = computed({
  get: () => !!successMessage.value,
  set: (val) => { if (!val) successMessage.value = '' }
})

const showErrorSnackbar = computed({
  get: () => !!errorMessage.value,
  set: (val) => { if (!val) errorMessage.value = '' }
})

// Clear error after timeout
const clearErrorAfterTimeout = () => {
  setTimeout(() => {
    errorMessage.value = ''
  }, 5000)
}

// Password strength checker
const getPasswordStrength = (password: string): 'weak' | 'medium' | 'strong' => {
  if (password.length < 8) return 'weak'

  let strength = 0
  if (password.length >= 10) strength++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++
  if (/[0-9]/.test(password)) strength++
  if (/[^a-zA-Z0-9]/.test(password)) strength++

  if (strength >= 3) return 'strong'
  if (strength >= 2) return 'medium'
  return 'weak'
}

const getPasswordStrengthColor = (password: string) => {
  const strength = getPasswordStrength(password)
  if (!password) return 'grey'
  if (strength === 'weak') return 'error'
  if (strength === 'medium') return 'warning'
  return 'success'
}

const getPasswordStrengthText = (password: string) => {
  const strength = getPasswordStrength(password)
  if (!password) return ''
  if (strength === 'weak') return 'Weak password'
  if (strength === 'medium') return 'Medium password'
  return 'Strong password'
}

const isPasswordValid = (password: string): boolean => {
  return password.length >= 8 &&
         /[A-Z]/.test(password) &&
         /[a-z]/.test(password) &&
         /[0-9]/.test(password) &&
         /[^a-zA-Z0-9]/.test(password)
}

// Direct fetch API to update password (bypasses Supabase lock issues)
const updatePasswordWithFetch = async (accessToken: string, newPassword: string): Promise<any> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      password: newPassword
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.msg || error.message || 'Failed to update password')
  }

  return await response.json()
}

const updatePassword = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  // Validation
  if (!newPassword.value || !confirmPassword.value) {
    errorMessage.value = 'Please fill in all fields.'
    clearErrorAfterTimeout()
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    clearErrorAfterTimeout()
    return
  }

  if (!isPasswordValid(newPassword.value)) {
    errorMessage.value = 'Password does not meet all requirements.'
    clearErrorAfterTimeout()
    return
  }

  try {
    isLoading.value = true

    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      throw new Error('No active session found. Please request a new reset link.')
    }

    // Method 1: Try fetch API first (avoids Supabase lock issues)
    let updateSuccess = false
    let updateError = null

    try {
      console.log('Attempting password update with fetch API...')
      await updatePasswordWithFetch(session.access_token, newPassword.value)
      updateSuccess = true
      console.log('Password updated successfully with fetch API')
    } catch (fetchError: any) {
      console.warn('Fetch API failed:', fetchError)
      updateError = fetchError

      // Method 2: Try supabase client as fallback with lock handling
      try {
        console.log('Attempting password update with Supabase client...')
        const { error } = await supabase.auth.updateUser({
          password: newPassword.value,
        })

        if (error) {
          throw error
        }
        updateSuccess = true
        console.log('Password updated successfully with Supabase client')
      } catch (supabaseError: any) {
        console.error('Supabase client also failed:', supabaseError)
        updateError = supabaseError
      }
    }

    if (updateSuccess) {
      // Sign out to ensure user needs to login with new password
      await supabase.auth.signOut()

      // Clear form
      newPassword.value = ''
      confirmPassword.value = ''

      // Navigate to success page
      await router.push('/reset-success')
    } else {
      throw updateError || new Error('Password update failed')
    }

  } catch (error: any) {
    console.error('Update password error:', error)

    let userMessage = ''
    const errorMessageText = error.message || ''

    // Handle specific error types
    if (errorMessageText.toLowerCase().includes('same as the old password') ||
        errorMessageText.toLowerCase().includes('should be different from the old password')) {
      userMessage = 'Please choose a different password than your current one.'
    } else if (errorMessageText.toLowerCase().includes('expired')) {
      userMessage = 'Your reset link has expired. Please request a new one.'
      setTimeout(() => router.push('/forgot-password'), 3000)
    } else if (errorMessageText.toLowerCase().includes('lock')) {
      // Handle lock error - try to refresh session
      console.log('Lock error detected, refreshing session...')
      try {
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()
        if (!refreshError && session) {
          // Retry password update with new session
          await updatePasswordWithFetch(session.access_token, newPassword.value)
          await supabase.auth.signOut()
          await router.push('/reset-success')
          return
        }
      } catch (refreshErr) {
        console.error('Session refresh failed:', refreshErr)
      }
      userMessage = 'Session issue detected. Please request a new reset link.'
      setTimeout(() => router.push('/forgot-password'), 3000)
    } else {
      userMessage = errorMessageText || 'Failed to update password. Please try again or request a new reset link.'
    }

    errorMessage.value = userMessage
    clearErrorAfterTimeout()
  } finally {
    isLoading.value = false
  }
}

const requestNewLink = () => {
  router.push('/forgot-password')
}

// Initialize - handle the reset link
onMounted(async () => {
  console.log('=== UpdatePasswordView mounted ===')
  console.log('Full URL:', window.location.href)
  console.log('Search params:', window.location.search)

  // Get token from URL query parameter
  const urlParams = new URLSearchParams(window.location.search)
  const token = urlParams.get('token')

  if (!token) {
    // Check for existing session (for web)
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      console.log('Existing session found')
      isValidLink.value = true
      isProcessing.value = false
      return
    }

    console.error('❌ No token found in URL')
    errorMessage.value = 'Invalid reset link. No token found. Please request a new password reset.'
    isValidLink.value = false
    isProcessing.value = false
    return
  }

  console.log('✅ Token found:', token.substring(0, 20) + '...')
  console.log('Verifying token with Supabase...')

  try {
    // Verify the token with Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'recovery'
    })

    if (error) {
      console.error('Error verifying token:', error)
      errorMessage.value = error.message || 'Invalid or expired reset link.'
      isValidLink.value = false
      isProcessing.value = false
      return
    }

    console.log('✅ Token verified successfully')

    // Small delay to ensure session is established
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Get the session
    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
      console.log('✅ Session established for:', session.user?.email)
      isValidLink.value = true
      isProcessing.value = false

      // Clean URL (remove token parameter for security)
      window.history.replaceState({}, document.title, window.location.pathname)
    } else {
      console.error('❌ No session after verification')
      errorMessage.value = 'Unable to establish session. Please request a new reset link.'
      isValidLink.value = false
      isProcessing.value = false
    }

  } catch (error: any) {
    console.error('Exception verifying token:', error)
    errorMessage.value = error.message || 'Failed to verify reset link. Please request a new one.'
    isValidLink.value = false
    isProcessing.value = false
  }
})
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
        <!-- Loading State -->
        <v-row align="center" justify="center" v-if="isProcessing">
          <v-col cols="12" sm="8" md="6" lg="4" class="text-center">
            <v-progress-circular indeterminate color="white" size="64"></v-progress-circular>
            <p class="mt-4 text-white">Verifying your reset link...</p>
          </v-col>
        </v-row>

        <!-- Error State -->
        <v-row align="center" justify="center" v-else-if="!isValidLink && errorMessage">
          <v-col cols="12" sm="8" md="6" lg="4">
            <v-card class="pa-6 elevation-10">
              <div class="text-center mb-6">
                <v-icon color="error" size="64" class="mb-3">mdi-link-off</v-icon>
                <v-card-title class="text-h5 font-weight-bold justify-center pa-0">
                  Invalid Reset Link
                </v-card-title>
                <p class="text-medium-emphasis mt-2">{{ errorMessage }}</p>
              </div>
              <v-btn color="primary" block @click="requestNewLink" size="large">
                <v-icon start>mdi-email</v-icon>
                Request New Reset Link
              </v-btn>
            </v-card>
          </v-col>
        </v-row>

        <!-- Password Update Form -->
        <template v-else-if="isValidLink">
          <v-snackbar
            v-model="showSuccessSnackbar"
            color="success"
            timeout="3000"
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

          <v-row align="center" justify="center">
            <v-col cols="12" sm="8" md="6" lg="4">
              <v-card class="pa-6 elevation-10" :loading="isLoading">
                <div class="text-center mb-6">
                  <v-icon color="primary" size="64" class="mb-3">mdi-key</v-icon>
                  <v-card-title class="text-h5 font-weight-bold justify-center pa-0">
                    Create New Password
                  </v-card-title>
                  <p class="text-medium-emphasis mt-2">Please enter your new password below</p>
                </div>

                <v-form @submit.prevent="updatePassword">
                  <v-text-field
                    v-model="newPassword"
                    :type="showNewPassword ? 'text' : 'password'"
                    label="New Password"
                    variant="outlined"
                    prepend-inner-icon="mdi-lock-outline"
                    :append-inner-icon="showNewPassword ? 'mdi-eye-off' : 'mdi-eye'"
                    @click:append-inner="showNewPassword = !showNewPassword"
                    required
                    :disabled="isLoading"
                    :rules="[
                      (v: string) => !!v || 'Password is required',
                      (v: string) => (v && v.length >= 8) || 'Password must be at least 8 characters',
                      (v: string) => (v && /[A-Z]/.test(v)) || 'Password must contain at least one uppercase letter',
                      (v: string) => (v && /[a-z]/.test(v)) || 'Password must contain at least one lowercase letter',
                      (v: string) => (v && /[0-9]/.test(v)) || 'Password must contain at least one number',
                      (v: string) => (v && /[^a-zA-Z0-9]/.test(v)) || 'Password must contain at least one special character'
                    ]"
                  />

                  <v-progress-linear
                    v-if="newPassword"
                    :model-value="getPasswordStrength(newPassword) === 'strong' ? 100 : getPasswordStrength(newPassword) === 'medium' ? 60 : 30"
                    :color="getPasswordStrengthColor(newPassword)"
                    height="4"
                    class="mb-2 mt-0"
                    rounded
                  />
                  <p
                    v-if="newPassword"
                    class="text-caption mb-4"
                    :class="{
                      'text-error': getPasswordStrength(newPassword) === 'weak',
                      'text-warning': getPasswordStrength(newPassword) === 'medium',
                      'text-success': getPasswordStrength(newPassword) === 'strong'
                    }"
                  >
                    {{ getPasswordStrengthText(newPassword) }}
                  </p>

                  <v-text-field
                    v-model="confirmPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    label="Confirm Password"
                    variant="outlined"
                    prepend-inner-icon="mdi-lock-check-outline"
                    :append-inner-icon="showConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
                    @click:append-inner="showConfirmPassword = !showConfirmPassword"
                    required
                    :disabled="isLoading"
                    :rules="[
                      (v: string) => !!v || 'Please confirm your password',
                      (v: string) => v === newPassword || 'Passwords must match'
                    ]"
                  />

                  <v-alert type="info" variant="tonal" density="compact" class="mt-2 mb-4">
                    <div class="text-caption">
                      <strong>Password requirements:</strong>
                      <ul class="mt-1 mb-0 pl-3">
                        <li :class="{ 'text-success': newPassword && newPassword.length >= 8 }">✓ At least 8 characters</li>
                        <li :class="{ 'text-success': newPassword && /[A-Z]/.test(newPassword) }">✓ One uppercase letter</li>
                        <li :class="{ 'text-success': newPassword && /[a-z]/.test(newPassword) }">✓ One lowercase letter</li>
                        <li :class="{ 'text-success': newPassword && /[0-9]/.test(newPassword) }">✓ One number</li>
                        <li :class="{ 'text-success': newPassword && /[^a-zA-Z0-9]/.test(newPassword) }">✓ One special character</li>
                      </ul>
                    </div>
                  </v-alert>

                  <v-btn
                    type="submit"
                    color="primary"
                    block
                    :loading="isLoading"
                    class="mt-2"
                    size="large"
                  >
                    <v-icon start>{{ isLoading ? 'mdi-loading' : 'mdi-check-circle' }}</v-icon>
                    {{ isLoading ? 'Updating...' : 'Update Password' }}
                  </v-btn>
                </v-form>
              </v-card>
            </v-col>
          </v-row>
        </template>
      </v-container>
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

.circle-deco {
  position: absolute;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  pointer-events: none;
}

.circle-1 { top: -40px; right: -40px; width: 155px; height: 148px; background-color: rgba(255, 255, 255, 0.15); }
.circle-2 { bottom: -60px; left: -60px; width: 200px; height: 200px; background-color: rgba(255, 255, 255, 0.1); }
.circle-3 { top: 50%; left: -80px; width: 180px; height: 180px; background-color: rgba(255, 255, 255, 0.08); transform: translateY(-50%); }
.circle-4 { bottom: 20%; right: -50px; width: 120px; height: 120px; background-color: rgba(255, 255, 255, 0.06); }

.v-card {
  border-radius: 16px;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.95);
}

.text-error { color: rgb(255, 82, 82); }
.text-warning { color: rgb(255, 193, 7); }
.text-success { color: rgb(76, 175, 80); }
.text-white { color: white; }

@media (max-width: 600px) {
  .circle-2 { width: 150px; height: 150px; bottom: -40px; left: -40px; }
  .circle-3 { width: 120px; height: 120px; left: -50px; }
  .circle-4 { width: 80px; height: 80px; }
}

@supports (padding: max(0px)) {
  .v-container {
    padding-top: max(12px, env(safe-area-inset-top));
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }
}
</style>
