<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

const email = ref(authStore.profile?.email || '')
const isLoading = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')

const saveEmail = async () => {
  try {
    isLoading.value = true
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')

    const { error } = await supabase.auth.updateUser({ email: email.value })
    if (error) throw error

    successMessage.value = 'Email updated! Please verify your new email.'
    showSuccess.value = true
    await authStore.hydrateFromSession()

    setTimeout(() => router.replace({ name: 'profileview', query: { refreshed: Date.now() } }), 2000)
  } catch (e) {
    successMessage.value = 'Failed: ' + e.message
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <v-app>
    <v-app-bar flat color="#3f83c7">
      <v-btn icon @click="router.back()"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title>Change Email</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success">{{ successMessage }}</v-snackbar>
      <v-container>
        <v-card>
          <v-card-title>Update Email</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="saveEmail">
              <v-text-field v-model="email" label="New Email" type="email" variant="outlined" required />
              <v-btn type="submit" color="primary" block :loading="isLoading">
                <v-icon class="me-2">mdi-check</v-icon>
                Save Email
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>
