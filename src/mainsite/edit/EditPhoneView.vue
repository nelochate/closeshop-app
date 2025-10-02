<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

const phone = ref(authStore.profile?.phone || '')
const isLoading = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')

const savePhone = async () => {
  try {
    isLoading.value = true
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')

    const { error } = await supabase.from('profiles').update({
      phone: phone.value,
      updated_at: new Date().toISOString(),
    }).eq('id', userData.user.id)
    if (error) throw error

    successMessage.value = 'Phone number updated!'
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
      <v-toolbar-title>Change Phone</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success">{{ successMessage }}</v-snackbar>
      <v-container>
        <v-card>
          <v-card-title>Update Phone</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="savePhone">
              <v-text-field v-model="phone" label="New Phone Number" variant="outlined" placeholder="+63 XXX XXX XXXX" required />
              <v-btn type="submit" color="primary" block :loading="isLoading">
                <v-icon class="me-2">mdi-check</v-icon>
                Save Phone
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>
