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

// Register function
const onSubmit = async () => {
  formAction.value = { ...formActionDefault, formProcess: true }

  const { data, error } = await supabase.auth.signUp({
    email: formData.value.email,
    password: formData.value.password,
    options: {
      data: {
        firstName: formData.value.firstName,
        lastName: formData.value.lastName,
        is_admin: false,
      },
    },
  })

  if (error) {
    console.error(error)
    formAction.value.formErrorMessage = error.message
    formAction.value.formStatus = error.status
  } else if (data) {
    formAction.value.formSuccessMessage = 'Registration successful'
    router.replace('/dashboard')
  }

  refVform.value?.reset()
  formAction.value.formProcess = false
}

const onFormSubmit = () => {
  refVform.value.validate().then(({ valid }) => {
    if (valid) onSubmit()
  })
}

// Password visibility states
const showPassword = ref(false)
const showConfirmPassword = ref(false)

// Redirect to login
const goToLogin = () => {
  router.push('/')
}
</script>

<template>
  <v-app class="main-bg">
    <div class="responsive-container">
      <!-- Banner -->
      <div class="login-divider-1">
        <v-img src="/images/closeshopbg.png" cover class="logo" />
        <div class="text-div">
          <h1 id="login">Register Now!</h1>
          <h2 id="sign-in">Sign up for a new account</h2>
        </div>
      </div>

      <!-- Form -->
      <div class="login-divider-2">
        <v-form ref="refVform" @submit.prevent="onFormSubmit">
          <v-text-field
            v-model="formData.firstName"
            label="First Name"
            prepend-inner-icon="mdi-account"
            class="input-field"
            :rules="[requiredValidator]"
            density="comfortable"
          />

          <v-text-field
            v-model="formData.lastName"
            label="Last Name"
            prepend-inner-icon="mdi-account"
            class="input-field"
            :rules="[requiredValidator]"
            density="comfortable"
          />

          <v-text-field
            v-model="formData.email"
            label="Email"
            type="email"
            prepend-inner-icon="mdi-email"
            class="input-field"
            :rules="[requiredValidator, emailValidator]"
            density="comfortable"
          />

          <v-text-field
            v-model="formData.password"
            :type="showPassword ? 'text' : 'password'"
            label="Password"
            prepend-inner-icon="mdi-key-variant"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
            class="input-field"
            :rules="[requiredValidator, passwordValidator]"
            density="comfortable"
          />

          <v-text-field
            v-model="formData.confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            label="Confirm Password"
            prepend-inner-icon="mdi-key-variant"
            :append-inner-icon="showConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showConfirmPassword = !showConfirmPassword"
            class="input-field"
            :rules="[
              requiredValidator,
              () => confirmedValidator(formData.confirmPassword, formData.password),
            ]"
            density="comfortable"
          />

          <div class="form-actions">
            <v-btn type="submit" color="primary" class="center-btn mb-3" block :loading="formAction.formProcess">
              Register
            </v-btn>
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
/* Base responsive styles */
.responsive-container {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 0;
  box-sizing: border-box;
}

/* Banner section */
.login-divider-1 {
  width: 100%;
  text-align: center;
  padding: 1rem;
  box-sizing: border-box;
}

.logo {
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.text-div {
  padding: 0.5rem;
}

#login {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

#sign-in {
  font-size: 1rem;
  font-weight: normal;
  margin-top: 0;
}

/* Form section */
.login-divider-2 {
  width: 100%;
  padding: 1rem;
  box-sizing: border-box;
}

.input-field {
  margin-bottom: 1rem;
}

.form-actions {
  margin-top: 1.5rem;
}

.center-btn, .bottom-btn {
  min-height: 48px; /* Better touch target for mobile */
}

/* Media queries for different screen sizes */
@media (max-width: 600px) {
  .responsive-container {
    padding: 0.5rem;
  }

  .login-divider-1, .login-divider-2 {
    padding: 0.75rem;
  }

  #login {
    font-size: 1.25rem;
  }

  #sign-in {
    font-size: 0.9rem;
  }

  .input-field {
    margin-bottom: 0.75rem;
  }
}

@media (min-width: 601px) and (max-width: 960px) {
  .responsive-container {
    max-width: 80%;
  }
}

@media (min-width: 961px) {
  .responsive-container {
    max-width: 50%;
  }
}

/* Ensure Vuetify components are mobile-friendly */
:deep(.v-input__control) {
  min-height: 56px; /* Standard mobile form field height */
}

:deep(.v-field) {
  font-size: 16px; /* Prevents zoom on iOS */
}

:deep(.v-field__input) {
  padding-top: 12px;
  padding-bottom: 12px;
}

/* Improve touch targets for mobile */
:deep(.v-btn) {
  min-height: 48px;
}

/* Loading state for better mobile UX */
:deep(.v-btn__loader) {
  align-items: center;
}
</style>
