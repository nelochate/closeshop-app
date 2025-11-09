<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const addresses = ref<any[]>([])
const showSuccess = ref(false)
const successMessage = ref('')
const isLoading = ref(false)

// Load addresses
const loadAddresses = async () => {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return router.push({ name: 'login' })

  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })

  if (error) console.error('Error loading addresses:', error)
  else addresses.value = data
}

// Delete
const deleteAddress = async (id: string) => {
  if (!confirm('Delete this address?')) return
  const { error } = await supabase.from('addresses').delete().eq('id', id)
  if (!error) {
    addresses.value = addresses.value.filter(a => a.id !== id)
    successMessage.value = 'Address deleted successfully'
    showSuccess.value = true
  }
}

// Set default
const setDefaultAddress = async (id: string) => {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return
  await supabase
    .from('addresses')
    .update({ is_default: false })
    .eq('user_id', userData.user.id)
  await supabase
    .from('addresses')
    .update({ is_default: true })
    .eq('id', id)
  await loadAddresses()
  successMessage.value = 'Default address updated'
  showSuccess.value = true
}

// Edit navigation
const editAddress = (id: string) => {
  router.push({ name: 'edit-address', params: { id } })
}

onMounted(loadAddresses)
</script>

<template>
  <v-app>
    <v-app-bar flat color="#3f83c7">
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
          <v-col cols="12" v-for="addr in addresses" :key="addr.id">
            <v-card class="mb-3" outlined>
              <v-card-text>
                <div class="d-flex justify-space-between align-center">
                  <div>
                    <div class="font-medium">{{ addr.recipient_name }} | {{ addr.phone }}</div>
                    <div>
                      {{ addr.purok }}, {{ addr.barangay }}, {{ addr.street }},
                      {{ addr.building }}, {{ addr.house_no }}, {{ addr.city }}
                    </div>
                    <div>{{ addr.province }}, {{ addr.postal_code }}</div>
                    <div v-if="addr.is_default" class="text-primary font-medium">Default Address</div>
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
.font-medium {
  font-weight: 500;
}
</style>
