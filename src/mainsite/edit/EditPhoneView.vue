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

    // 1️⃣ Get authenticated user
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')
    const userId = userData.user.id

    // 2️⃣ Get latest address for the user
    const { data: latestAddress, error: addressError } = await supabase
      .from('addresses')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (addressError && addressError.code !== 'PGRST116') throw addressError

    if (latestAddress) {
      // 3️⃣ Update phone in existing address
      const { error: updateAddressError } = await supabase
        .from('addresses')
        .update({
          phone: phone.value,
          updated_at: new Date().toISOString(),
        })
        .eq('id', latestAddress.id)

      if (updateAddressError) throw updateAddressError

      successMessage.value = 'Phone number updated in your address!'
      showSuccess.value = true
    } else {
     
      successMessage.value = 'No address found to update phone.'
      showSuccess.value = true
    }

    // Redirect after 2 seconds
    setTimeout(
      () => router.replace({ name: 'profileview', query: { refreshed: Date.now() } }),
      2000
    )
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
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success">{{
        successMessage
      }}</v-snackbar>
      <v-container>
        <v-card>
          <v-card-title>Update Phone</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="savePhone">
              <v-text-field
                v-model="phone"
                label="New Phone Number"
                variant="outlined"
                placeholder="+63 XXX XXX XXXX"
                required
              />
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
