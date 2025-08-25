<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const username = ref('')
const password = ref('')
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
        <div class="circle"></div>
        <h1>Login</h1>
        <h2>Sign in to your account</h2>
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
            label="Password"
            type="password"
            required
            prepend-inner-icon="mdi-key-variant"
            class="pass-input"
          />
          <div class="form-actions">
            <v-btn type="submit" color="primary" class="center-btn">Login</v-btn>
            <v-spacer />
            <v-btn text @click="goToRegister" class="bottom-btn">Register</v-btn>
          </div>
        </v-form>
      </div>
    </div>
  </v-app>
</template>
<style scoped>
.login-divider-1 {
  background: #3d79b6;
}
.circle {
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: #deeff5;
  position: relative; /* stays in place while scrolling */
  top: -100px;
  right: 10px;
  left: 300px;
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
  height: 120px; /* adjust as needed */
  position: relative;
}
.center-btn {
  margin-top: 16px;
}
.bottom-btn {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}
</style>
