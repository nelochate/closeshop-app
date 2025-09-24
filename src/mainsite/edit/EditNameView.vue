<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

const firstName = ref(authStore.profile?.first_name || '')
const lastName = ref(authStore.profile?.last_name || '')
const isLoading = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')

const saveName = async () => {
  try {
    isLoading.value = true
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')

    // Update Supabase auth metadata
    await supabase.auth.updateUser({
      data: { first_name: firstName.value, last_name: lastName.value }
    })

    // Update profile table
    await supabase.from('profiles').update({
      first_name: firstName.value,
      last_name: lastName.value,
      updated_at: new Date().toISOString()
    }).eq('id', userData.user.id)

    await authStore.hydrateFromSession()
    successMessage.value = 'Name updated successfully!'
    showSuccess.value = true
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
      <v-toolbar-title>Edit Name</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success">{{ successMessage }}</v-snackbar>
      <v-container>
        <v-card>
          <v-card-title>Update Name</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="saveName">
              <v-text-field v-model="firstName" label="First Name" variant="outlined" required />
              <v-text-field v-model="lastName" label="Last Name" variant="outlined" required />
              <v-btn type="submit" color="primary" block :loading="isLoading">
                <v-icon class="me-2">mdi-check</v-icon>
                Save Name
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>
