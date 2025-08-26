<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import closeshopbg from '@/image/closeshopbg.png'

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const router = useRouter()

const login = () => {
  console.log('Logging in with', username.value, password.value)
  // TODO: Call API later
}

const goToRegister = () => {
  router.push('/register')
}
</script>

<template>
  <v-app class="main-bg">
    <div>
      <div class="login-divider-1">
        <v-img :src="closeshopbg" cover class="logo"> </v-img>

        <div class="text-div">
          <h1 id="login">Login</h1>
          <h2 id="sign-in">Sign in to your account</h2>
        </div>
      </div>
      <v-spacer />
      <div class="login-divider-2">
        <v-form @submit.prevent="login" class="login-form">
          <v-text-field
            v-model="username"
            label="Email"
            required
            prepend-inner-icon="mdi-account"
            class="email-input"
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
          />
          <div class="form-actions">
            <v-btn type="submit" color="primary" class="center-btn mb-5">Login</v-btn>

            <span class="forgot-link">Forgot password? Click here</span>
            <v-btn text @click="goToRegister" class="bottom-btn">Register New Account</v-btn>
          </div>
        </v-form>
      </div>
    </div>
  </v-app>
</template>
<style scoped>
.login-divider-1 {
  background: #5ca3eb;
  height: 250px;
  position: relative;
}

.login-divider-2 {
  background: #ffffff; /* make the second section visible */
  padding: 2rem 1rem; /* space inside */
  min-height: 300px; /* ensure enough height for the form */
}
.email-input,
.pass-input {
  width: 350px;
  max-width: 100%;
  margin: auto;
}
.email-input {
  margin-top: 5%;
}
.form-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px; /* automatically adds space between children */
  position: relative;
  /* remove height: 120px; */
}
.center-btn {
  padding: 5px 50px 5px 50px;
  font-weight: 500;
}
.bottom-btn {
  position: static; /* let it flow under forgot-link */
  transform: none;
  margin-top: 10px; /* optional spacing */
}

#sign-in {
  color: #ffffff;
  font-family: 'Roboto', sans-serif;
}
#login {
  font-size: 2.5rem;
  color: #ffffff;
  font-family: 'Roboto', sans-serif;
}

.forgot-link {
  font-size: 20px;
  margin-bottom: 5px; /* this now works */
  display: block;
}
.text-div {
  text-align: center;
  margin-top: 1rem; /* adjust spacing below the image */
}
.logo {
  width: 350px;
  max-width: 100%;
  display: block;
  margin: 0 auto; /* centers horizontally */
}
</style>
