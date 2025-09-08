<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  requiredValidator,
  emailValidator,
  passwordValidator,
  confirmedValidator,
} from '@/utils/validators'
import { supabase, formActionDefault } from '@/utils/supabase'

const router = useRouter()

// Default form data
const formDataDefault = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
}

const formData = ref({ ...formDataDefault })
const formAction = ref({ ...formActionDefault })
const refVform = ref()

// Password visibility states
const showPassword = ref(false)
const showConfirmPassword = ref(false)

// Register function
// Register function
const onSubmit = async () => {
  formAction.value = { ...formActionDefault, formProcess: true }

  // 1. Sign up user in Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email: formData.value.email,
    password: formData.value.password,
    options: {
      emailRedirectTo: `${window.location.origin}/`,
      data: {
        first_name: formData.value.firstName,
        last_name: formData.value.lastName,
      },
    },
  })

  if (error) {
    console.error(error)
    formAction.value.formErrorMessage = error.message
    formAction.value.formStatus = error.status
    setTimeout(() => {
      formAction.value.formErrorMessage = ''
    }, 3000)
  } else if (data?.user) {
    // 2. Insert into profiles table
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id, // link to auth.users.id
      first_name: formData.value.firstName,
      last_name: formData.value.lastName,
    })

    if (profileError) {
      console.error('Profile insert error:', profileError.message)
    }

    // 3. Redirect to success page
    router.push('/register-success')
  }

  refVform.value?.reset()
  formAction.value.formProcess = false
}


//
const onFormSubmit = () => {
  refVform.value.validate().then(({ valid }) => {
    if (valid) onSubmit()
  })
}

</script>

<template>
  <v-app class="main-bg">
    <div class="login-container">
      <!-- Header -->
      <div class="login-header d-flex flex-column align-center">
        <div class="circle-deco"></div>

        <!-- Logo -->
        <v-img
          src="/images/logo.png"
          max-width="100"
          class="logo"
        ></v-img>

        <!-- Title + Subtitle -->
        <h2 class="login-title">Create Account</h2>
        <p class="login-subtitle">Fill in the details to register</p>
      </div>

      <!-- Error & Success Messages -->
      <div v-if="formAction.formErrorMessage" class="error-message">
        {{ formAction.formErrorMessage }}
      </div>
      <div v-if="formAction.formSuccessMessage" class="success-message">
        {{ formAction.formSuccessMessage }}
      </div>

      <!-- Form Card -->
      <div class="login-card">
        <v-form ref="refVform" @submit.prevent="onFormSubmit">
          <v-text-field
            v-model="formData.firstName"
            placeholder="First Name"
            prepend-inner-icon="mdi-account"
            class="login-input"
            :rules="[requiredValidator]"
            density="comfortable"
          />
          <v-text-field
            v-model="formData.lastName"
            placeholder="Last Name"
            prepend-inner-icon="mdi-account"
            class="login-input"
            :rules="[requiredValidator]"
            density="comfortable"
          />
          <v-text-field
            v-model="formData.email"
            placeholder="Email"
            prepend-inner-icon="mdi-email"
            class="login-input"
            :rules="[requiredValidator, emailValidator]"
            density="comfortable"
          />
          <v-text-field
            v-model="formData.password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Password"
            prepend-inner-icon="mdi-key-variant"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
            class="login-input"
            :rules="[requiredValidator, passwordValidator]"
            density="comfortable"
          />
          <v-text-field
            v-model="formData.confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            placeholder="Confirm Password"
            prepend-inner-icon="mdi-key-variant"
            :append-inner-icon="showConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showConfirmPassword = !showConfirmPassword"
            class="login-input"
            :rules="[
              requiredValidator,
              () => confirmedValidator(formData.confirmPassword, formData.password),
            ]"
            density="comfortable"
          />

          <v-btn
            type="submit"
            color="primary"
            block
            class="login-btn"
            prepend-icon="mdi-account-plus"
            :loading="formAction.formProcess"
            :disabled="formAction.formProcess"
          >
            Register
          </v-btn>

          <p class="register-link">
            Already have an account? <RouterLink to="/">Login</RouterLink>
          </p>
        </v-form>
      </div>
    </div>
  </v-app>
</template>

<style scoped>
/* 🔹 Reuse styles from login */
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

.register-link {
  margin: 1rem 0;
  font-size: 14px;
  text-align: center;
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
