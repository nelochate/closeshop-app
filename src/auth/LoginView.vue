<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";

const username = ref("");
const password = ref("");
const router = useRouter();

const login = () => {
  console.log("Logging in with:", username.value, password.value);
  // TODO: Add your API call for login
};

const forgotPassword = () => {
  router.push("/forgot-password");
};

const register = () => {
  router.push("/register");
};
</script>

<template>
  <v-app>
    <div class="container">
      <!-- Header Section -->
      <div class="header">
        <div class="circle"></div>
        <h1>Login</h1>
        <p>Sign in to your account</p>
      </div>

      <!-- Form Section -->
      <div class="form">
        <v-form @submit.prevent="login" class="login-form w-100" style="max-width: 320px;">
          <!-- Username -->
          <v-text-field
            v-model="username"
            label="Username"
            prepend-inner-icon="mdi-account"
            required
            variant="outlined"
            class="mb-3"
          />

          <!-- Password -->
          <v-text-field
            v-model="password"
            label="Password"
            type="password"
            prepend-inner-icon="mdi-key-variant"
            required
            variant="outlined"
            class="mb-3"
          />

          <!-- Login Button -->
          <v-btn type="submit" color="primary" block class="mb-3">
            Login
          </v-btn>

          <!-- Forgot password -->
          <p
            class="text-center text-medium-emphasis text-caption mb-3"
            @click="forgotPassword"
            style="cursor: pointer"
          >
            I forgot my password. Click here to reset
          </p>

          <!-- Register Button -->
          <v-btn color="secondary" variant="outlined" block @click="register">
            Register New Account
          </v-btn>
        </v-form>
      </div>
    </div>
  </v-app>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
  font-family: Arial, sans-serif;
}

/* Header */
.header {
  background: #2f6db2;
  height: 200px;
  color: white;
  padding: 20px;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}
.header h1 {
  font-size: 32px;
  font-weight: bold;
  margin: 0;
  margin-top: 6px;
}
.header p {
  font-size: 14px;
  margin-top: 4px;
}
.header .circle {
  width: 215px;
  height: 200px;
  background: #deeff5;
  border-radius: 50%;
  position: absolute;
  top: -40px;
  right: -60px;
}

/* Form */
.form {
  flex: 1;
  display: flex;
  justify-content: center;
  margin-top: 30px;
  padding: 0 20px;
}
</style>
