
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { requiredValidator, emailValidator } from '@/utils/validators'
import { onMounted } from 'vue'

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const router = useRouter()

// Reactive variable for error/success message
const errorMessage = ref('') // Stores the error message
const showError = ref(false) // Controls the visibility of the error message
const successMessage = ref('') // Stores the success message
const showSuccess = ref(false) // Controls the visibility of the success message

const isLoading = ref()

// Login function using Supabase
const login = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: username.value,
      password: password.value,
    })

    if (error) {
      console.error('Login failed:', error.message)
      errorMessage.value = 'Invalid credentials: ' + error.message
      showError.value = true

      setTimeout(() => {
        showError.value = false
      }, 3000)
      return
    }

    const user = data.user
    console.log('Login success:', user)

    // ✅ Check profile role
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single()

    if (profileError && profileError.code === 'PGRST116') {
      // No profile found → create one
      const { error: insertError } = await supabase.from('profiles').insert([
        {
          id: user.id,
          role: 'customer', // default role
        },
      ])
      if (insertError) {
        console.error('Failed to auto-create profile:', insertError.message)
      }
      profile = { id: user.id, role: 'customer' } // fallback
    }

    // ✅ Redirect based on role
    let redirectPath = '/homepage'
    if (profile?.role === 'admin') {
      redirectPath = '/admin-dashboard'
    }

    // Show success message
    successMessage.value = 'Login successful! Redirecting...'
    showSuccess.value = true

    setTimeout(() => {
      showSuccess.value = false
      router.push(redirectPath)
    }, 2000) // quicker redirect
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


/*
const goToRegister = () => {
  router.push('/register')
}*/

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    router.push('/homepage') // auto redirect if already logged in
  }
})
</script>

<template>
  <v-app class="main-bg">
    <div class="login-container">
      <!-- Logo + Title -->
      <div class="login-header d-flex flex-column align-center">
        <div class="circle-deco"></div>

        <!-- Logo -->
        <v-img
          src="/images/logo.png"
          max-width="100"
          class="logo"

        ></v-img>

        <!-- Title + Subtitle -->
        <h2 class="login-title">CloseShop</h2>
        <p class="login-subtitle">Use the account below to sign in</p>
      </div>


      <!-- Error & Success Messages -->
      <div v-if="showError" class="error-message">{{ errorMessage }}</div>
      <div v-if="showSuccess" class="success-message">{{ successMessage }}</div>

      <!-- Form Card -->
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

          <p class="forgot-link">Forgot Password</p>

          <p class="register-link">
            Don’t have an account? <RouterLink to="/register">Register</RouterLink>
          </p>

          <!-- Divider -->
          <div class="divider">
            <span></span>
            <p>Or sign up with</p>
            <span></span>
          </div>

          <!-- Social Buttons -->
          <v-btn block outlined class="social-btn">
            <v-icon start>mdi-google</v-icon> Continue with Google
          </v-btn>
          <v-btn block outlined class="social-btn">
            <v-icon start>mdi-apple</v-icon> Continue with Apple
          </v-btn>
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
  background: #f5f5f5; /* light background */
  padding: 0;
}

.login-header {
  background-color: #2e73b8; /* solid blue like your screenshot */
  color: #fff;
  width: 100%;
  height: 30%;
  padding: 3rem 2rem 5rem 2rem;
  position: relative;
  border-bottom-left-radius: 40px; /* smooth curve if you want */
  overflow: hidden;
  margin-bottom: 50px; /* pulls the header down */
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
  margin-top: -60px; /* pulls card upward into header */
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

.forgot-link {
  margin-top: 0.8rem;
  font-size: 13px;
  color: #666;
  text-align: center;
  cursor: pointer;
}

.register-link {
  margin: 1rem 0;
  font-size: 14px;
  text-align: center;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 1.5rem 0;
}

.divider span {
  flex: 1;
  height: 1px;
  background: #ddd;
}

.divider p {
  margin: 0 10px;
  font-size: 13px;
  color: #777;
}

.social-btn {
  margin-top: 0.6rem;
  border-radius: 10px;
  font-weight: 500;
  text-transform: none;
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

