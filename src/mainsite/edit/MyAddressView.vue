<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router' // <-- import useRoute
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const route = useRoute() // <-- now defined
const authStore = useAuthUserStore()

const addressId = route.params.id as string | undefined // optional param
const addressData = ref<any>(null)
const showSuccess = ref(false)
const successMessage = ref('')
const isLoading = ref(false)

// Load single address if editing
const loadAddress = async () => {
  if (!addressId) return // adding new, no need to load
  try {
    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('id', addressId)
      .single()
    if (error) throw error
    addressData.value = data
  } catch (error) {
    console.error('Failed to load address:', error)
    successMessage.value = 'Failed to load address'
    showSuccess.value = true
  }
}

// Save address (insert or update)
const saveAddress = async (payload: any) => {
  try {
    isLoading.value = true
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')

    if (addressId) {
      // Update
      await supabase.from('addresses').update(payload).eq('id', addressId)
      successMessage.value = 'Address updated successfully'
    } else {
      // Insert
      await supabase.from('addresses').insert([{ ...payload, user_id: userData.user.id }])
      successMessage.value = 'Address added successfully'
    }

    showSuccess.value = true
    router.back()
  } catch (error) {
    console.error('Save address error:', error)
    successMessage.value = 'Failed to save address'
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(loadAddress)
</script>

<template>
  <v-app>
    <v-app-bar class="app-bar" flat density="comfortable" color="#3f83c7">
      <v-btn icon @click="router.back()"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title>My Addresses</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success" location="top">
        {{ successMessage }}
        <template #actions>
          <v-btn color="white" variant="text" @click="showSuccess = false">Close</v-btn>
        </template>
      </v-snackbar>

      <v-container>
        <v-row>
          <!-- Address List -->
          <v-col cols="12" v-for="addr in addresses" :key="addr.id">
            <v-card class="mb-3" outlined>
              <v-card-text>
                <div class="d-flex justify-space-between align-center">
                  <div>
                    <div class="font-medium">{{ addr.recipient_name }}</div>
                    <div>
                      {{ addr.street }}, {{ addr.purok }}, {{ addr.barangay }}, {{ addr.city }}
                    </div>
                    <div>{{ addr.phone }}</div>
                    <div v-if="addr.is_default" class="text-primary font-medium">
                      Default Address
                    </div>
                  </div>
                  <div class="d-flex flex-column align-end">
                    <v-btn icon small color="primary" @click="editAddress(addr.id)">
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                    <v-btn icon small color="red" @click="deleteAddress(addr.id)">
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                    <v-btn
                      v-if="!addr.is_default"
                      text
                      small
                      color="secondary"
                      @click="setDefaultAddress(addr.id)"
                    >
                      Set as Default
                    </v-btn>
                  </div>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Add New Address Button -->
          <v-col cols="12" class="mt-4">
            <v-btn
              block
              color="primary"
              class="rounded-lg text-white"
              @click="router.push({ name: 'edit-address' })"
            >
              <v-icon class="me-2">mdi-plus</v-icon>
              Add New Address
            </v-btn>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.app-bar {
  padding-top: 19px;
}

.font-medium {
  font-weight: 500;
}
</style>
