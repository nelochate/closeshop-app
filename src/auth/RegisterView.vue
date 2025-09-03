<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'


const fname = ref('')
const lname = ref('')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const router = useRouter()

const login = () => {
  console.log(
    'Registering with',
    fname.value,
    lname.value,
    username.value,
    password.value,
    confirmPassword.value,
  )
  // TODO: Call API later
}

const goToLogin = () => {
  router.push('/')
}
</script>

<template>
  <v-app class="main-bg">
    <div>
      <!-- Top Banner -->
      <div class="login-divider-1">
        <v-img src="/images/closeshopbg.png" cover class="logo" />
        <div class="text-div">
          <h1 id="login">Register Now!</h1>
          <h2 id="sign-in">Sign up for a new account</h2>
        </div>
      </div>

      <!-- Form Section -->
      <div class="login-divider-2">
        <v-form @submit.prevent="login" class="reg-form">
          <v-text-field
            v-model="fname"
            label="First Name"
            required
            prepend-inner-icon="mdi-account"
            class="input-field"
          />

          <v-text-field
            v-model="lname"
            label="Last Name"
            required
            prepend-inner-icon="mdi-account"
            class="input-field"
          />

          <v-text-field
            v-model="username"
            label="Email"
            type="email"
            required
            prepend-inner-icon="mdi-email"
            class="input-field"
          />

          <v-text-field
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            label="Password"
            required
            prepend-inner-icon="mdi-key-variant"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
            class="input-field"
          />

          <v-text-field
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            label="Confirm Password"
            required
            prepend-inner-icon="mdi-key-variant"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
            class="input-field"
          />

          <div class="form-actions">
            <v-btn type="submit" color="primary" class="center-btn mb-3" block> Register </v-btn>
            <v-btn text @click="goToLogin" class="bottom-btn" block>
              Already have an account? Login
            </v-btn>
          </div>
        </v-form>
      </div>
    </div>
  </v-app>
</template>

<style scoped>
/* Banner */
.login-divider-1 {
background-image: linear-gradient(to bottom, #5ca3eb 0%, #ffffff 100%);
  height: 500px;
  max-height: 100%;
  text-align: center;
}
.login-divider-2 {
  background: #ffffff;
  min-height: 300px;
  margin-top: -200px; /* pulls the form up into the banner space */
  padding-top: 2rem;  /* keeps spacing inside */
  border-radius: 12px; /* optional: for smoother transition */
}
.logo {
  width: 60%;
  max-width: 280px;
  margin: 0 auto;
  display: block;
}
.text-div {
  margin-top: 1rem;
}
#login {
  font-size: 1.8rem;
  font-weight: 600;
  color: #fff;
}
#sign-in {
  font-size: 1rem;
  color: #fff;
}

/* Form */
.login-divider-2 {
  background: #fff;
}
.reg-form {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}
.input-field {
  width: 100%;
}
.form-actions {
  margin-top: 1rem;
}
.center-btn {
  font-weight: 500;
  border-radius: 8px;
}
.bottom-btn {
  font-size: 0.9rem;
  text-transform: none;
}
</style>
