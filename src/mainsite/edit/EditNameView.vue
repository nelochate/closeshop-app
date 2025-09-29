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
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('No logged-in user')

    // Update Supabase auth metadata
    const { error: authError } = await supabase.auth.updateUser({
      data: { first_name: firstName.value, last_name: lastName.value }
    })
    if (authError) throw authError

    // Update profiles table (make sure RLS policy exists!)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        first_name: firstName.value,
        last_name: lastName.value,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (profileError) throw profileError

    await authStore.hydrateFromSession()

    successMessage.value = 'Name updated successfully!'
    showSuccess.value = true
    setTimeout(() => router.replace({ name: 'profileview', query: { refreshed: Date.now() } }), 2000)
  } catch (e) {
    console.error('Save name failed:', e)
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
