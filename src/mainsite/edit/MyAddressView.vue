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
        <!-- Saved Addresses List -->
        <div v-if="addresses.length > 0">
          <div class="text-h6 font-weight-bold mb-3">Your Saved Addresses</div>
          
          <v-row>
            <v-col cols="12" v-for="addr in addresses" :key="addr.id">
              <v-card class="mb-3" :class="{ 'border-primary': addr.is_default }" variant="outlined">
                <v-card-text>
                  <div class="d-flex justify-space-between align-start">
                    <div class="flex-grow-1">
                      <!-- Default Badge -->
                      <div v-if="addr.is_default" class="d-flex align-center mb-2">
                        <v-icon color="primary" small class="me-1">mdi-star</v-icon>
                        <span class="text-primary font-weight-bold text-caption">DEFAULT ADDRESS</span>
                      </div>
                      
                      <!-- Recipient Info -->
                      <div class="font-weight-medium text-body-1 mb-1">
                        {{ addr.recipient_name || 'No name provided' }} 
                        <span v-if="addr.phone">| {{ addr.phone }}</span>
                      </div>
                      
                      <!-- Address Details - Display exactly what was saved -->
                      <div class="text-body-2 mb-1">
                        <span v-if="addr.house_no">{{ addr.house_no }}, </span>
                        <span v-if="addr.building">{{ addr.building }}, </span>
                        <span v-if="addr.street">{{ addr.street }}, </span>
                        <span v-if="addr.purok">Purok {{ addr.purok }}, </span>
                        <span class="font-weight-medium">{{ addr.barangay }}, </span>
                        {{ addr.city }}
                      </div>
                      <div class="text-caption text-grey">
                        {{ addr.province }}, {{ addr.postal_code }}
                      </div>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div class="d-flex flex-column align-end" style="gap: 8px;">
                      <v-btn 
                        icon 
                        size="small" 
                        color="primary" 
                        variant="text"
                        @click="editAddress(addr.id)"
                      >
                        <v-icon>mdi-pencil</v-icon>
                      </v-btn>
                      <v-btn 
                        icon 
                        size="small" 
                        color="red" 
                        variant="text"
                        @click="deleteAddress(addr.id)"
                      >
                        <v-icon>mdi-delete</v-icon>
                      </v-btn>
                      <v-btn
                        v-if="!addr.is_default"
                        size="small"
                        color="secondary"
                        variant="text"
                        @click="setDefaultAddress(addr.id)"
                      >
                        Set Default
                      </v-btn>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-8">
          <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-map-marker-off</v-icon>
          <div class="text-h6 text-grey mb-2">No addresses saved yet</div>
          <div class="text-body-2 text-grey mb-4">Add your first address to get started</div>
        </div>

        <!-- Add New Address Button -->
        <v-col cols="12" class="mt-4">
          <v-btn
            block
            color="primary"
            class="rounded-lg text-white"
            @click="router.push({ name: 'edit-address' })"
            size="large"
          >
            <v-icon class="me-2">mdi-plus</v-icon>
            Add New Address
          </v-btn>
        </v-col>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.border-primary {
  border: 2px solid rgb(63, 131, 199) !important;
}

.font-medium {
  font-weight: 500;
}

.v-card {
  transition: all 0.3s ease;
}

.v-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>