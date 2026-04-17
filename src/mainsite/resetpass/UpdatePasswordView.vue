<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Capacitor } from '@capacitor/core'

const router = useRouter()

let isProcessingReset = false

const newPassword = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const isProcessing = ref(true)
const isValidLink = ref(false)
const errorDetails = ref('')

const isCheckingSession = ref(true)

// Password visibility toggles
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

// Fix: Computed properties for snackbar visibility
const showSuccessSnackbar = computed({
  get: () => !!successMessage.value,
  set: (val) => { if (!val) successMessage.value = '' }
})

const showErrorSnackbar = computed({
  get: () => !!errorMessage.value,
  set: (val) => { if (!val) errorMessage.value = '' }
})

const isMobile = Capacitor.isNativePlatform()

// Parse URL error parameters
const parseUrlError = () => {
  const hash = window.location.hash
  const search = window.location.search

  if (hash && hash.includes('error=')) {
    const params = new URLSearchParams(hash.substring(1))
    const error = params.get('error')
    const errorCode = params.get('error_code')
    const errorDescription = params.get('error_description')
    return { error, errorCode, errorDescription }
  }

  if (search && search.includes('error=')) {
    const params = new URLSearchParams(search)
    const error = params.get('error')
    const errorCode = params.get('error_code')
    const errorDescription = params.get('error_description')
    return { error, errorCode, errorDescription }
  }

  return null
}

// Alternative: Use fetch API directly to avoid lock issues
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
    throw {
      status: response.status,
      message: error.msg || error.message || 'Failed to update password',
      code: error.code
    }
  }

  return await response.json()
}

// Handle the password reset flow
const handlePasswordResetFlow = async () => {
  try {
    const urlError = parseUrlError()

    if (urlError) {
      if (urlError.errorCode === 'otp_expired' || urlError.errorDescription?.includes('expired')) {
        errorMessage.value = 'This password reset link has expired. Please request a new one.'
        errorDetails.value = 'expired'
      } else if (urlError.errorCode === 'access_denied') {
        errorMessage.value = 'This reset link is invalid or has already been used.'
        errorDetails.value = 'invalid'
      } else {
        errorMessage.value = urlError.errorDescription || 'Invalid or expired reset link.'
        errorDetails.value = 'error'
      }
      isProcessing.value = false
      isValidLink.value = false
      return
    }

    const hash = window.location.hash
    const hasTokens = hash && (hash.includes('access_token') || hash.includes('#access_token'))

    if (!hasTokens && !isMobile) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        errorMessage.value = 'No reset link detected. Please request a password reset first.'
        errorDetails.value = 'no_link'
        isProcessing.value = false
        isValidLink.value = false
        return
      }
    }

    if (isMobile && hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })

        if (error) {
          if (error.message?.includes('expired')) {
            errorMessage.value = 'This reset link has expired. Please request a new one.'
          } else {
            errorMessage.value = 'Invalid reset link. Please request a new one.'
          }
          isProcessing.value = false
          isValidLink.value = false
          return
        }
      }
    } else if (!isMobile) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        errorMessage.value = 'Unable to verify your reset link. It may have expired.'
        isProcessing.value = false
        isValidLink.value = false
        return
      }
    }

    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
      isValidLink.value = true
      isProcessing.value = false
    } else {
      errorMessage.value = 'Unable to validate your reset link. Please request a new password reset.'
      isProcessing.value = false
      isValidLink.value = false
    }

  } catch (error: any) {
    console.error('Error handling password reset:', error)
    errorMessage.value = error.message || 'Unable to process reset link. Please request a new one.'
    isProcessing.value = false
    isValidLink.value = false
  }
}

const clearErrorMessages = () => {
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

const getPasswordErrors = (password: string): string[] => {
  const errors: string[] = []

  if (!password) return errors

  if (password.length < 8) {
    errors.push('At least 8 characters long')
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('At least one uppercase letter (A-Z)')
  }
  if (!/[a-z]/.test(password)) {
    errors.push('At least one lowercase letter (a-z)')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('At least one number (0-9)')
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push('At least one special character (!@#$%^&*)')
  }

  return errors
}

// Check if password meets all requirements
const isPasswordValid = (password: string): boolean => {
  return password.length >= 8 &&
         /[A-Z]/.test(password) &&
         /[a-z]/.test(password) &&
         /[0-9]/.test(password) &&
         /[^a-zA-Z0-9]/.test(password)
}

const updatePassword = async () => {
  // Clear previous messages
  errorMessage.value = ''
  successMessage.value = ''

  // Validation
  if (!newPassword.value || !confirmPassword.value) {
    errorMessage.value = 'Please fill in all fields.'
    clearErrorMessages()
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    clearErrorMessages()
    return
  }

  if (newPassword.value.length < 8) {
    errorMessage.value = 'Password must be at least 8 characters long.'
    clearErrorMessages()
    return
  }

   // Check for uppercase letter
  if (!/[A-Z]/.test(newPassword.value)) {
    errorMessage.value = 'Password must contain at least one uppercase letter (A-Z).'
    clearErrorMessages()
    return
  }

    // Check for lowercase letter
  if (!/[a-z]/.test(newPassword.value)) {
    errorMessage.value = 'Password must contain at least one lowercase letter (a-z).'
    clearErrorMessages()
    return
  }

  // Check for number
  if (!/[0-9]/.test(newPassword.value)) {
    errorMessage.value = 'Password must contain at least one number (0-9).'
    clearErrorMessages()
    return
  }

  // Check for special character
  if (!/[^a-zA-Z0-9]/.test(newPassword.value)) {
    errorMessage.value = 'Password must contain at least one special character (!@#$%^&* etc.).'
    clearErrorMessages()
    return
  }


    // Add password strength check
  if (getPasswordStrength(newPassword.value) === 'weak') {
    errorMessage.value = 'Password is too weak. Please use at least 8 characters with a mix of letters, numbers, and symbols.'
    clearErrorMessages()
    return
  }

  try {
    isLoading.value = true

    // Get current session
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      throw new Error('No active session found. Please request a new reset link.')
    }

    let updateSuccess = false
    let updateError = null

    // Method 1: Try fetch API first (more reliable for password reset)
    try {
      console.log('Attempting password update with fetch API...')
      await updatePasswordWithFetch(session.access_token, newPassword.value)
      updateSuccess = true
      console.log('Password updated successfully with fetch API')
    } catch (fetchError: any) {
      console.warn('Fetch API failed:', fetchError)
      updateError = fetchError

      // Method 2: Try supabase client as fallback
      try {
        const { error } = await supabase.auth.updateUser({
          password: newPassword.value,
        })

        if (error) {
          throw error
        }
        updateSuccess = true
        console.log('Password updated successfully with supabase client')
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

    // Extract the actual error message
    let userMessage = ''
    const errorMessageText = error.message || error.msg || ''

    // Handle specific error types with proper user-friendly messages
    if (errorMessageText.toLowerCase().includes('should be different from the old password') ||
        errorMessageText.toLowerCase().includes('same as the old password')) {
      userMessage = 'You cannot use your current password. Please choose a different password that you haven\'t used before.'
    }
    else if (errorMessageText.toLowerCase().includes('at least 8 characters')) {
      userMessage = 'Password must be at least 8 characters long.'
    }
    else if (errorMessageText.toLowerCase().includes('expired')) {
      userMessage = 'Your reset link has expired. Please request a new password reset.'
      setTimeout(() => {
        router.push('/forgot-password')
      }, 3000)
    }
    else if (errorMessageText.toLowerCase().includes('session') || errorMessageText.toLowerCase().includes('not found')) {
      userMessage = 'Your session has expired. Please request a new reset link.'
      setTimeout(() => {
        router.push('/forgot-password')
      }, 3000)
    }
    else if (errorMessageText.toLowerCase().includes('weak password')) {
      userMessage = 'Password is too weak. Please use a stronger password with at least 8 characters, including uppercase, lowercase, numbers, and symbols.'
    }
    else {
      userMessage = errorMessageText || 'Failed to update password. Please try again or request a new reset link.'
    }

    errorMessage.value = userMessage
    clearErrorMessages()

  } finally {
    isLoading.value = false
  }
}



// Request new reset link
const requestNewLink = () => {
  router.push('/forgot-password')
}

onMounted(async () => {
 console.log('=== UpdatePasswordView START ===')

  // Prevent duplicate processing
  if (isProcessingReset) {
    console.log('Already processing reset, skipping...')
    return
  }
  isProcessingReset = true

  // ============================================
  // CRITICAL: Process tokens FIRST
  // ============================================
  const hash = window.location.hash
  let sessionSet = false

  if (hash && hash.includes('access_token')) {
    console.log('🔐 Tokens found in URL hash, processing...')
    const params = new URLSearchParams(hash.substring(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    console.log('Extracted tokens:', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      type,
      accessTokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : null
    })

    if (accessToken && refreshToken) {
      try {
        console.log('Calling supabase.auth.setSession()...')
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })

        if (error) {
          console.error('Error setting session:', error)
          errorMessage.value = error.message || 'Failed to set session'
        } else {
          console.log('✅ Session set successfully from URL tokens')
          console.log('Session user:', data.session?.user?.email)
          sessionSet = true
        }
      } catch (err) {
        console.error('Exception setting session:', err)
      }
    }
  } else {
    console.log('No access_token found in URL hash')
    console.log('Full hash:', hash)
  }

  // Set a timeout to prevent infinite loading
  const timeoutId = setTimeout(() => {
    if (isCheckingSession.value) {
      console.log('Session check timeout, redirecting to forgot password')
      errorMessage.value = 'Session check timed out. Please request a new reset link.'
      errorDetails.value = 'timeout'
      isProcessing.value = false
      isValidLink.value = false
      isCheckingSession.value = false
    }
  }, 10000)

  // Check for existing session with retries
  let retryCount = 0
  const maxRetries = 10

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    console.log(`Session check ${retryCount + 1}/${maxRetries}:`, session ? `✅ EXISTS (${session.user?.email})` : '❌ NOT FOUND')

    if (session) {
      console.log('✅ Session verified, allowing password update')
      isValidLink.value = true
      isProcessing.value = false
      isCheckingSession.value = false
      clearTimeout(timeoutId)
      return true
    } else if (retryCount < maxRetries) {
      retryCount++
      const delay = retryCount * 500
      console.log(`⏳ No session yet, retrying in ${delay}ms...`)
      setTimeout(checkSession, delay)
      return false
    } else {
      console.log('❌ No session found after all retries')

      // Provide specific error message based on what happened
      if (hash && hash.includes('access_token') && !sessionSet) {
        errorMessage.value = 'Unable to establish session from reset link. The link may be invalid or expired. Please request a new reset link.'
        errorDetails.value = 'session_failed'
      } else if (!hash || !hash.includes('access_token')) {
        errorMessage.value = 'No reset tokens found in URL. Please use the link from your email exactly as provided.'
        errorDetails.value = 'no_tokens'
      } else {
        errorMessage.value = 'No valid reset session found. Please request a new reset link.'
        errorDetails.value = 'no_session'
      }

      isProcessing.value = false
      isValidLink.value = false
      isCheckingSession.value = false
      clearTimeout(timeoutId)

      setTimeout(() => {
        router.push('/forgot-password')
      }, 4000)
      return false
    }
  }

  // Small delay to ensure setSession has completed
  setTimeout(checkSession, 500)
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
        <v-row align="center" justify="center" v-if="isProcessing || isCheckingSession">
          <v-col cols="12" sm="8" md="6" lg="4" class="text-center">
            <v-progress-circular indeterminate color="white" size="64"></v-progress-circular>
            <p class="mt-4 text-white">Verifying your reset link...</p>
            <p class="text-caption text-white">Please wait, this may take a moment</p>
          </v-col>
        </v-row>

        <!-- Error State (Invalid/Expired Link) -->
        <v-row align="center" justify="center" v-else-if="!isValidLink && errorMessage">
          <v-col cols="12" sm="8" md="6" lg="4">
            <v-card class="pa-6 elevation-10">
              <div class="text-center mb-6">
                <v-icon color="error" size="64" class="mb-3">
                  mdi-link-off
                </v-icon>
                <v-card-title class="text-h5 font-weight-bold justify-center pa-0">
                  Invalid Reset Link
                </v-card-title>
                <p class="text-medium-emphasis mt-2">
                  {{ errorMessage }}
                </p>
              </div>

              <v-alert
                v-if="errorDetails === 'expired'"
                type="warning"
                variant="tonal"
                class="mb-4"
              >
                <v-icon start>mdi-alert</v-icon>
                Password reset links expire after 24 hours for security reasons.
              </v-alert>

              <v-btn
                color="primary"
                block
                @click="requestNewLink"
                class="mb-3"
                size="large"
              >
                <v-icon start>mdi-email</v-icon>
                Request New Reset Link
              </v-btn>
            </v-card>
          </v-col>
        </v-row>

        <!-- Password Update Form (Valid Link) -->
        <template v-else-if="isValidLink">
          <!-- Success Snackbar - FIXED: using computed property -->
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

          <!-- Error Snackbar - FIXED: using computed property -->
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
                  <v-icon color="primary" size="64" class="mb-3">
                    mdi-key
                  </v-icon>
                  <v-card-title class="text-h5 font-weight-bold justify-center pa-0">
                    Create New Password
                  </v-card-title>
                  <p class="text-medium-emphasis mt-2">
                    Please enter your new password below
                  </p>
                </div>

                <v-form @submit.prevent="updatePassword">

              <!-- New Password Field with Eye Icon -->
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

                  <!-- Password Strength Indicator -->
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

                  <!-- Confirm Password Field with Eye Icon -->
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

                  <!-- Password Requirements Hint -->
              <v-alert type="info" variant="tonal" density="compact" class="mt-2 mb-4">
                  <div class="text-caption">
                    <strong>Password requirements:</strong>
                    <ul class="mt-1 mb-0 pl-3" style="list-style: none; padding-left: 0;">
                      <li :class="{ 'text-success': newPassword && newPassword.length >= 8, 'text-error': newPassword && newPassword.length < 8 }">
                        <v-icon :icon="newPassword && newPassword.length >= 8 ? 'mdi-check-circle' : 'mdi-close-circle'" size="16" class="mr-1" />
                        At least 8 characters long
                      </li>
                      <li :class="{ 'text-success': newPassword && /[A-Z]/.test(newPassword), 'text-error': newPassword && !/[A-Z]/.test(newPassword) }">
                        <v-icon :icon="newPassword && /[A-Z]/.test(newPassword) ? 'mdi-check-circle' : 'mdi-close-circle'" size="16" class="mr-1" />
                        At least one uppercase letter (A-Z)
                      </li>
                      <li :class="{ 'text-success': newPassword && /[a-z]/.test(newPassword), 'text-error': newPassword && !/[a-z]/.test(newPassword) }">
                        <v-icon :icon="newPassword && /[a-z]/.test(newPassword) ? 'mdi-check-circle' : 'mdi-close-circle'" size="16" class="mr-1" />
                        At least one lowercase letter (a-z)
                      </li>
                      <li :class="{ 'text-success': newPassword && /[0-9]/.test(newPassword), 'text-error': newPassword && !/[0-9]/.test(newPassword) }">
                        <v-icon :icon="newPassword && /[0-9]/.test(newPassword) ? 'mdi-check-circle' : 'mdi-close-circle'" size="16" class="mr-1" />
                        At least one number (0-9)
                      </li>
                      <li :class="{ 'text-success': newPassword && /[^a-zA-Z0-9]/.test(newPassword), 'text-error': newPassword && !/[^a-zA-Z0-9]/.test(newPassword) }">
                        <v-icon :icon="newPassword && /[^a-zA-Z0-9]/.test(newPassword) ? 'mdi-check-circle' : 'mdi-close-circle'" size="16" class="mr-1" />
                        At least one special character (!@#$%^&*)
                      </li>
                    </ul>
                    <div v-if="newPassword && isPasswordValid(newPassword)" class="text-success mt-2">
                      <v-icon icon="mdi-check-circle" size="16" class="mr-1" />
                      Password meets all requirements!
                    </div>
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
                    <v-icon start>
                      {{ isLoading ? 'mdi-loading' : 'mdi-check-circle' }}
                    </v-icon>
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

.v-card {
  border-radius: 16px;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.95);
}

/* Snackbar styling with safe area support */
:deep(.v-snackbar) {
  z-index: 9999;
}

:deep(.v-snackbar__content) {
  font-weight: 500;
}

/* Password strength colors */
.text-error {
  color: rgb(255, 82, 82);
}
.text-warning {
  color: rgb(255, 193, 7);
}
.text-success {
  color: rgb(76, 175, 80);
}

.text-white {
  color: white;
}

/* Mobile Responsive with Notch/Camera Support */
@media (max-width: 600px) {
  .circle-2 {
    width: 150px;
    height: 150px;
    bottom: -40px;
    left: -40px;
  }

  .circle-3 {
    width: 120px;
    height: 120px;
    left: -50px;
  }

  .circle-4 {
    width: 80px;
    height: 80px;
  }
}

/* Safe area support for notches and camera cutouts */
@supports (padding: max(0px)) {
  .v-container {
    padding-top: max(12px, env(safe-area-inset-top));
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }
}
</style>