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
import AlertNotification from '@/common/AlertNotification.vue'

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
    router.replace('/homepage')
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
      <!-- Alert Notification -->
      <AlertNotification :formSuccessMessage="formAction.formSuccessMessage"
        :formErrorMessage="formAction.formErrorMessage">
      </AlertNotification>
        <v-form ref="refVform" @submit.prevent="onFormSubmit">
          <v-text-field v-model="formData.firstName" label="First Name" prepend-inner-icon="mdi-account"
            class="input-field" :rules="[requiredValidator]" density="comfortable" />

          <v-text-field v-model="formData.lastName" label="Last Name" prepend-inner-icon="mdi-account"
            class="input-field" :rules="[requiredValidator]" density="comfortable" />

          <v-text-field v-model="formData.email" label="Email" type="email" prepend-inner-icon="mdi-email"
            class="input-field" :rules="[requiredValidator, emailValidator]" density="comfortable" />

          <v-text-field v-model="formData.password" :type="showPassword ? 'text' : 'password'" label="Password"
            prepend-inner-icon="mdi-key-variant" :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword" class="input-field"
            :rules="[requiredValidator, passwordValidator]" density="comfortable" />

          <v-text-field v-model="formData.confirmPassword" :type="showConfirmPassword ? 'text' : 'password'"
            label="Confirm Password" prepend-inner-icon="mdi-key-variant"
            :append-inner-icon="showConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showConfirmPassword = !showConfirmPassword" class="input-field" :rules="[
              requiredValidator,
              () => confirmedValidator(formData.confirmPassword, formData.password),
            ]" density="comfortable" />

          <div class="form-actions">
            <v-btn type="submit" color="primary" class="center-btn mb-5" prepend-icon="mdi-account-plus"
              :disabled="formAction.formProcess" :loading="formAction.formProcess">
              Register
            </v-btn>
            <h4 class="text-center" text @click="goToLogin">
              Already have an account?<RouterLink to="/" class="text-primary">
                Login</RouterLink>
            </h4>
          </div>
        </v-form>
      </div>
    </div>
  </v-app>
</template>

<style scoped>
/* Base responsive styles */
.login-divider-1 {
  background-image: linear-gradient(to bottom, #5ca3eb 0%, #ffffff 100%);
  height: 500px;
  max-height: 100%;
  text-align: center;
  margin-top: 5;
}

.login-divider-2 {
  background: #ffffff;
  min-height: 300px;
  margin-top: -200px; /* pulls the form up into the banner space */
  padding-top: 1rem; /* consistent with LoginView */
  border-radius: 12px; /* optional: for smoother transition */
}

.input-field {
  width: 350px;
  max-width: 100%;
  margin: auto;
  margin-bottom: 1rem;
}

.form-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px; /* spacing between children */
  position: relative;
}

.center-btn {
  padding: 5px 50px 5px 50px;
  font-weight: 500;
}

.bottom-btn {
  transform: none;
  margin-top: 10px;
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

.text-div {
  text-align: center;
  margin-top: 1rem;
}

.logo {
  width: 350px;
  max-width: 100%;
  display: block;
  margin: 0 auto;
}

</style>
