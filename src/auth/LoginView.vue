<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { requiredValidator, emailValidator } from '@/utils/validators'

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
        <v-img src="/images/closeshopbg.png" cover class="logo"> </v-img>

        <div class="text-div">
          <h1 id="login">Login</h1>
          <h2 id="sign-in">Sign in to your account</h2>
        </div>
      </div>
      <v-spacer />
      <div class="login-divider-2">
        <v-form @submit.prevent="login" class="login-form">
          <v-text-field v-model="username" label="Email" required prepend-inner-icon="mdi-email-outline"
            class="email-input" :rules="[requiredValidator, emailValidator]" />

          <v-text-field v-model="password" :type="showPassword ? 'text' : 'password'" label="Password" required
            prepend-inner-icon="mdi-key-variant" :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword" class="pass-input" :rules="[requiredValidator]" />
          <div class="form-actions">
            <v-btn type="submit" color="primary" class="center-btn mb-5" to="homepage">Login</v-btn>

            <span class="forgot-link">Forgot password? Click here</span>
            <h4 class="text-center" text @click="goToRegister" >
              Don't have an account?<RouterLink to="/register" class="text-primary">
                Register</RouterLink>
            </h4>

          </div>
        </v-form>
      </div>
    </div>
  </v-app>
</template>

<style scoped>
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
  padding-top: .1rem;  /* keeps spacing inside */
  border-radius: 12px; /* optional: for smoother transition */
}
.email-input,
.pass-input {
  width: 350px;
  max-width: 100%;
  margin: auto;
}
.email-input {
  margin-top: 3%;
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
