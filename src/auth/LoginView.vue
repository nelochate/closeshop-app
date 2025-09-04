
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

// 🔹 Login function using Supabase
const login = async () => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: username.value,
      password: password.value,
    })

    if (error) {
      console.error('Login failed:', error.message)
      alert('Invalid credentials: ' + error.message)
      return
    }

    console.log('Login success:', data.user)

    // Redirect to homepage after successful login
    router.push('/homepage')
  } catch (err) {
    console.error('Unexpected error:', err)
    alert('Something went wrong, please try again.')
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

      <!-- Login Form -->
      <div class="login-divider-2">
        <v-form @submit.prevent="login" class="login-form">
          <v-text-field
            v-model="username"
            label="Email"
            required
            prepend-inner-icon="mdi-email-outline"
            class="email-input"
            :rules="[requiredValidator, emailValidator]"
          />

          <v-text-field
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            label="Password"
            required
            prepend-inner-icon="mdi-key-variant"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
            class="pass-input"
            :rules="[requiredValidator]"
          />

          <div class="form-actions">
            <v-btn type="submit" color="primary" class="center-btn mb-5">
              Login
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
