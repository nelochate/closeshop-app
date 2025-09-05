
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

       // Hide the error message after 3 seconds
      setTimeout(() => {
        showError.value = false
      }, 3000)

      return
    }

    console.log('Login success:', data.user)

    // Show success message
    successMessage.value = 'Login successful! Redirecting to homepage...'
    showSuccess.value = true

    // Hide the success message after 3 seconds and redirect
    setTimeout(() => {
      showSuccess.value = false
      router.push('/homepage') // Redirect to homepage
    }, 3000)
  } catch (err) {
    console.error('Unexpected error:', err)
    errorMessage.value = 'Something went wrong, please try again.'
    showError.value = true

    // Hide the error message after 3 seconds
    setTimeout(() => {
      showError.value = false
    }, 3000)
  } finally {
    isLoading.value = false
  }
}

const goToRegister = () => {
  router.push('/register')
}

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    router.push('/homepage') // auto redirect if already logged in
  }
})
</script>

<template>
  <v-app class="main-bg">
    <div>
      <!-- Header / Banner -->
      <div class="login-divider-1">
        <v-img src="/images/closeshopbg.png" cover class="logo"> </v-img>

        <div class="text-div">
          <h1 id="login">Login</h1>
          <h2 id="sign-in">Sign in to your account</h2>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="showError" class="error-message">
        {{ errorMessage }}
      </div>

      <!-- Success Message -->
      <div v-if="showSuccess" class="success-message">
        {{ successMessage }}
      </div>

      <!-- Login Form -->
      <div class="login-divider-2">
        <v-form @submit.prevent="login" class="login-form">
          <v-text-field v-model="username" label="Email" required prepend-inner-icon="mdi-email-outline"
            class="email-input" :rules="[requiredValidator, emailValidator]" />

          <v-text-field v-model="password" :type="showPassword ? 'text' : 'password'" label="Password" required
            prepend-inner-icon="mdi-key-variant" :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword" class="pass-input" :rules="[requiredValidator]" />

          <div class="form-actions">
            <v-btn type="submit" color="primary" class="center-btn mb-5" prepend-icon="mdi-login" :loading="isLoading"
              :disabled="isLoading">
              <template v-slot:default>
                <span v-if="!isLoading">Login</span>
                <v-progress-circular v-else indeterminate color="white" size="20" />
              </template>
            </v-btn>


            <span class="forgot-link">Forgot password? Click here</span>

            <h4 class="text-center" text @click="goToRegister">
              Don't have an account?
              <RouterLink to="/register" class="text-primary">
                Register
              </RouterLink>
            </h4>
          </div>
        </v-form>
      </div>
    </div>
  </v-app>
</template>

<style scoped>
/* Banner section */
.login-divider-1 {
  background-image: linear-gradient(to bottom, #5ca3eb 0%, #ffffff 100%);
  min-height: 300px;
  text-align: center;
  padding: 1rem;
}

/* Form container */
.login-divider-2 {
  background: #ffffff;
  padding: 2rem 1rem;
  border-radius: 12px;
  margin: -100px auto 0 auto;
  max-width: 400px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Inputs */
.email-input,
.pass-input {
  width: 100%;
  margin: 10px 0;
}

/* Form actions */
.form-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.center-btn {
  padding: 10px 40px;
  font-weight: 500;
  width: 100%;
}

#sign-in {
  color: #ffffff;
  font-family: 'Roboto', sans-serif;
}

#login {
  font-size: 2rem;
  color: #ffffff;
  font-family: 'Roboto', sans-serif;
}

.forgot-link {
  font-size: 14px;
  margin-bottom: 5px;
  color: #555;
  cursor: pointer;
}

.text-div {
  text-align: center;
  margin-top: 1rem;
}

.logo {
  width: 200px;
  max-width: 100%;
  display: block;
  margin: 0 auto;
}
.error-message {
  position: absolute; /* Ensures it appears above other elements */
  top: 20px; /* Adjust the position as needed */
  left: 50%;
  transform: translateX(-50%);
  z-index: 10; /* Higher than the form container */
  color: #ff4d4f;
  background-color: #fff1f0c8;
  border: 1px solid #ffa39ed1;
  padding: 10px;
  margin: 10px 0;
  text-align: center;
  border-radius: 5px;
  width: 90%; /* Optional: Adjust width */
  max-width: 400px; /* Optional: Limit max width */
}

.success-message {
  position: absolute; /* Ensures it appears above other elements */
  top: 20px; /* Adjust the position as needed */
  left: 50%;
  transform: translateX(-50%);
  z-index: 10; /* Higher than the form container */
  color: #52c41a;
  background-color: #f6ffed;
  border: 1px solid #b7eb8f;
  padding: 10px;
  margin: 10px 0;
  text-align: center;
  border-radius: 5px;
  width: 90%; /* Optional: Adjust width */
  max-width: 400px; /* Optional: Limit max width */
}

/* 🔹 Responsive */
@media (max-width: 600px) {
  .login-divider-2 {
    margin: -80px 10px 0 10px;
    padding: 1.5rem;
  }

  #login {
    font-size: 1.8rem;
  }

  #sign-in {
    font-size: 1rem;
  }

  .center-btn {
    padding: 8px 20px;
  }


}
</style>
