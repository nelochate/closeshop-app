<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

const addresses = ref([])
const showSuccess = ref(false)
const successMessage = ref('')
const isLoading = ref(false)

// Load all addresses for the user
const loadAddresses = async () => {
  try {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return router.push({ name: 'login' })

    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('updated_at', { ascending: false })

    if (error) throw error
    addresses.value = data || []
  } catch (error) {
    console.error('Error loading addresses:', error)
    successMessage.value = 'Failed to load addresses'
    showSuccess.value = true
  }
}

// Navigate to edit address page
const editAddress = (id) => {
  router.push({ name: 'edit-address', query: { id } })
}

// Delete address
const deleteAddress = async (id) => {
  if (!confirm('Are you sure you want to delete this address?')) return
  try {
    isLoading.value = true
    await supabase.from('addresses').delete().eq('id', id)
    addresses.value = addresses.value.filter(a => a.id !== id)
    successMessage.value = 'Address deleted successfully'
    showSuccess.value = true
  } catch (error) {
    console.error('Delete address error:', error)
    successMessage.value = 'Failed to delete address'
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

// Set as default address
const setDefaultAddress = async (id) => {
  try {
    isLoading.value = true
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')

    // Reset all to false
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', userData.user.id)
    // Set selected as default
    await supabase.from('addresses').update({ is_default: true }).eq('id', id)

    // Update local state
    addresses.value = addresses.value.map(a => ({ ...a, is_default: a.id === id }))
    successMessage.value = 'Default address updated'
    showSuccess.value = true
  } catch (error) {
    console.error(error)
    successMessage.value = 'Failed to update default address'
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(loadAddresses)
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
                    <div>{{ addr.street }}, {{ addr.purok }}, {{ addr.barangay }}, {{ addr.city }}</div>
                    <div>{{ addr.phone }}</div>
                    <div v-if="addr.is_default" class="text-primary font-medium">Default Address</div>
                  </div>
                  <div class="d-flex flex-column align-end">
                    <v-btn icon small color="primary" @click="editAddress(addr.id)">
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                    <v-btn icon small color="red" @click="deleteAddress(addr.id)">
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                    <v-btn v-if="!addr.is_default" text small color="secondary" @click="setDefaultAddress(addr.id)">
                      Set as Default
                    </v-btn>
                  </div>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Add New Address Button -->
          <v-col cols="12" class="mt-4">
            <v-btn block color="primary" class="rounded-lg text-white" @click="router.push({ name: 'edit-address' })">
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
