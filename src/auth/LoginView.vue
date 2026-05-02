<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { requiredValidator, emailValidator } from '@/utils/validators'
import { Capacitor } from '@capacitor/core'
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in'
import { syncProfileFromAuthUser } from '@/utils/profileSync'

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const router = useRouter()

const errorMessage = ref('')
const showError = ref(false)
const successMessage = ref('')
const showSuccess = ref(false)
const isLoading = ref(false)
const isLoading2 = ref(false)

const isNative = Capacitor.isNativePlatform()
const isWeb = Capacitor.getPlatform() === 'web'

// Store initialization promise to ensure it's only done once
let initPromise: Promise<boolean> | null = null

const getRedirectPathForUser = async (user: any) => {
  const profile = await syncProfileFromAuthUser({
    user,
    defaultRole: 'customer',
  })

  return profile?.role === 'admin' ? '/admin-dashboard' : '/homepage'
}

// Initialize Google Sign-In
const initializeGoogleSignIn = async (): Promise<boolean> => {
  if (!isNative) return true
  
  // Return existing promise if already initializing
  if (initPromise) {
    return initPromise
  }
  
  initPromise = (async () => {
    try {
      console.log('Initializing Google Sign-In...')
      const clientId = '618681645336-0fqba348n7kfcc65qkvh90lsioo7l3ti.apps.googleusercontent.com'
      
      await GoogleSignIn.initialize({
        clientId: clientId,
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      })
      
      console.log('Google Sign-In initialized successfully')
      return true
    } catch (err: any) {
      console.error('Failed to initialize Google Sign-In:', err)
      errorMessage.value = 'Failed to initialize Google Sign-In'
      showError.value = true
      setTimeout(() => {
        showError.value = false
      }, 3000)
      return false
    }
  })()
  
  return initPromise
}

// Regular email login
const login = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: username.value,
      password: password.value,
    })

    if (error) {
      console.error('Login error:', error.message)
      errorMessage.value = error.message
      showError.value = true
      setTimeout(() => {
        showError.value = false
      }, 3000)
      return
    }

    const user = data.user
    console.log('Login success:', user)
    const redirectPath = await getRedirectPathForUser(user)

    successMessage.value = 'Redirecting...'
    showSuccess.value = true

    setTimeout(() => {
      showSuccess.value = false
      router.push(redirectPath)
    }, 2000)
  } catch (err) {
    console.error('Unexpected error:', err)
    errorMessage.value = 'Something went wrong, please try again.'
    showError.value = true
    setTimeout(() => {
      showError.value = false
    }, 3000)
  } finally {
    isLoading.value = false
  }
}

// Process Google sign-in result
const processGoogleSignInResult = async (result: any) => {
  const idToken = result.idToken
  
  if (!idToken) {
    throw new Error('No ID token received from Google')
  }

  console.log('ID token received, signing in to Supabase...')

  const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken
  })

  if (supabaseError) throw supabaseError

  console.log('Supabase login success:', data.user)
  const redirectPath = await getRedirectPathForUser(data.user)

  successMessage.value = 'Redirecting...'
  showSuccess.value = true

  setTimeout(() => {
    showSuccess.value = false
    router.push(redirectPath)
  }, 2000)
}

// Google Sign-In handler
const signInWithGoogle = async () => {
  isLoading2.value = true
  
  try {
    if (isNative) {
      console.log('=== Google Sign-In Flow Started ===')
      
      // IMPORTANT: Initialize first and wait for completion
      console.log('Step 1: Initializing...')
      const initialized = await initializeGoogleSignIn()
      console.log('Step 1: Initialization result:', initialized)
      
      if (!initialized) {
        throw new Error('Google Sign-In could not be initialized')
      }
      
      // Give the native side a moment to process
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Now sign in
      console.log('Step 2: Calling signIn()...')
      const result = await GoogleSignIn.signIn()
      console.log('Step 2: Sign-in result received')
      
      // Process the result
      await processGoogleSignInResult(result)
      
    } else {
      // Web platform
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      })
      
      if (error) throw error
      
      if (data?.url) {
        window.location.href = data.url
      }
    }
  } catch (err: any) {
    console.error('Google Sign-In error:', err)
    
    if (err.message?.includes('canceled')) {
      errorMessage.value = 'Sign-in was cancelled'
    } else if (err.message?.includes('network')) {
      errorMessage.value = 'Network error. Please check your connection'
    } else {
      errorMessage.value = err.message || 'Failed to sign in with Google'
    }
    
    showError.value = true
    setTimeout(() => {
      showError.value = false
    }, 3000)
  } finally {
    isLoading2.value = false
  }
}

// Handle web redirect callback
const handleRedirectCallback = async () => {
  if (!isWeb) return
  
  try {
    const result = await GoogleSignIn.handleRedirectCallback()
    if (result) {
      console.log('Redirect callback result:', result)
      await processGoogleSignInResult(result)
    }
  } catch (err) {
    console.error('Redirect callback error:', err)
  }
}

// Check existing session
const checkExistingSession = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    let { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    let redirectPath = '/homepage'
    if (profile?.role === 'admin') {
      redirectPath = '/admin-dashboard'
    }

    router.push(redirectPath)
  }
}

onMounted(async () => {
  console.log('Component mounted, platform:', Capacitor.getPlatform())
  
  if (isNative) {
    // Pre-initialize on mount to save time
    console.log('Pre-initializing Google Sign-In...')
    await initializeGoogleSignIn()
  }
  
  await handleRedirectCallback()
  await checkExistingSession()
})
</script>

<template>
  <v-app class="main-bg">
    <div class="login-container">
      <div class="login-header d-flex flex-column align-center">
        <div class="circle-deco"></div>
        <v-img src="/images/logo.png" max-width="100" class="logo"></v-img>
        <h2 class="login-title">CloseShop</h2>
        <p class="login-subtitle">Use the account below to sign in</p>
      </div>

      <div v-if="showError" class="error-message">{{ errorMessage }}</div>
      <div v-if="showSuccess" class="success-message">{{ successMessage }}</div>

      <div class="login-card">
        <v-form @submit.prevent="login">
          <v-text-field
            v-model="username"
            placeholder="Email"
            variant="outlined"
            density="comfortable"
            class="login-input"
            :rules="[requiredValidator, emailValidator]"
          />

          <v-text-field
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Password"
            variant="outlined"
            density="comfortable"
            class="login-input"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
            :rules="[requiredValidator]"
          />

          <v-btn
            type="submit"
            color="primary"
            block
            class="login-btn"
            :loading="isLoading"
            :disabled="isLoading"
            prepend-icon="mdi-login"
          >
            Sign In
          </v-btn>

          <div class="divider">
            <span class="divider-text">or</span>
          </div>

          <v-btn
            @click="signInWithGoogle"
            block
            class="google-btn mb-3"
            :loading="isLoading2"
            :disabled="isLoading2"
            variant="outlined"
          >
            <template v-slot:prepend>
              <v-icon class="google-icon" size="large">mdi-google</v-icon>
            </template>
            Sign in with Google
          </v-btn>

          <p class="forgot-link" @click="router.push('/forgot-password')">Forgot Password?</p>

          <p class="register-link">
            Don't have an account? <RouterLink to="/register">Register</RouterLink>
          </p>

          <div class="privacy-notice">
            <v-icon color="primary" size="small" class="mr-2">mdi-shield-lock-outline</v-icon>
            <span class="privacy-text">Your data is protected with us. We never share your information with third parties.</span>
          </div>
        </v-form>
      </div>
    </div>
  </v-app>
</template>

<style scoped>
.login-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  background: #f5f5f5;
  padding: 0;
}

.login-header {
  background-color: #2e73b8;
  color: #fff;
  width: 100%;
  height: 30%;
  padding: 3rem 2rem 5rem 2rem;
  position: relative;
  border-bottom-left-radius: 40px;
  overflow: hidden;
  margin-bottom: 50px;
}

.circle-deco {
  position: absolute;
  top: -40px;
  right: -40px;
  width: 155px;
  height: 148px;
  background-color: rgba(255, 255, 255, 0.252);
  border-radius: 50%;
}

.login-title {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.login-subtitle {
  font-size: 14px;
  opacity: 0.9;
}

.login-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  padding: 2rem;
  width: 100%;
  max-width: 400px;
  margin-top: -60px;
}

.login-input {
  margin-bottom: 1rem;
  border-radius: 10px;
}

.login-btn {
  margin-top: 1rem;
  font-weight: 600;
  border-radius: 10px;
  height: 45px;
}

.google-btn {
  font-weight: 600;
  border-radius: 10px;
  height: 45px;
  text-transform: none;
  border-color: #757575;
  color: rgba(0, 0, 0, 0.87);
}

.google-icon {
  background: conic-gradient(from -45deg, #ea4335 110deg, #4285f4 110deg 230deg, #34a853 230deg 310deg, #fbbc05 310deg);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-size: 24px !important;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 1.5rem 0;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #e0e0e0;
}

.divider-text {
  padding: 0 1rem;
  color: #757575;
  font-size: 14px;
}

.forgot-link {
  margin: 1rem 0;
  font-size: 15px;
  text-align: center;
  color: #2e73b8f5;
  font-weight: 580;
  cursor: pointer;
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
  font-weight: 500;
}

.register-link a:hover {
  text-decoration: underline;
}

.privacy-notice {
  margin-top: 2rem;
  padding: 1rem;
  background-color: #f8f9fa;
  border-radius: 10px;
  border-left: 4px solid #2e73b8;
  display: flex;
  align-items: flex-start;
}

.privacy-text {
  font-size: 12px;
  color: #666;
  line-height: 1.4;
}

.logo {
  width: 80px;
}

.error-message,
.success-message {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  z-index: 10;
}

.error-message {
  background: #ffcdd2cf;
  color: #b71c1c;
}

.success-message {
  background: #c8e6c9d4;
  color: #1b5e1fa8;
}
</style>
