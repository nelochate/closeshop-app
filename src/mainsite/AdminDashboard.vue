<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/utils/supabase'

const pendingShops = ref<any[]>([])
const approvedShops = ref<any[]>([])
const loadingShops = ref(false)
const activeTab = ref('pending')
const errorMessage = ref('')
const isAdmin = ref(false)

// Check if current user is admin
const checkAdminStatus = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (error) throw error

      isAdmin.value = profile?.role === 'admin'

      if (!isAdmin.value) {
        errorMessage.value = 'Access denied. Admin privileges required.'
      }
    } else {
      errorMessage.value = 'Not authenticated. Please log in.'
    }
  } catch (err: any) {
    console.error('Error checking admin status:', err)
    errorMessage.value = 'Error verifying admin privileges.'
  }
}

const fetchShops = async () => {
  if (!isAdmin.value) return

  loadingShops.value = true
  errorMessage.value = ''

  try {
    // Fetch pending shops
    const { data: pendingData, error: pendingError } = await supabase
      .from('shops')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (pendingError) throw pendingError
    pendingShops.value = pendingData || []

    // Fetch approved shops
    const { data: approvedData, error: approvedError } = await supabase
      .from('shops')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })

    if (approvedError) throw approvedError
    approvedShops.value = approvedData || []

  } catch (err: any) {
    console.error('Error fetching shops:', err)
    errorMessage.value = `Failed to fetch shops: ${err.message}`
  } finally {
    loadingShops.value = false
  }
}

const updateShopStatus = async (id: string, status: 'approved' | 'declined') => {
  if (!isAdmin.value) {
    errorMessage.value = 'Admin privileges required.'
    return
  }

  try {
    errorMessage.value = ''

    const { data, error } = await supabase
      .from('shops')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()

    if (error) {
      console.error('Supabase error:', error)

      // More specific error handling
      if (error.message.includes('permission denied')) {
        throw new Error('Permission denied. Check RLS policies or admin status.')
      } else if (error.message.includes('JWT')) {
        throw new Error('Authentication error. Please log in again.')
      } else {
        throw error
      }
    }

    // Update local state
    if (status === 'approved') {
      const shop = pendingShops.value.find(s => s.id === id)
      if (shop) {
        approvedShops.value.unshift({
          ...shop,
          status: 'approved',
          updated_at: new Date().toISOString()
        })
      }
    }

    pendingShops.value = pendingShops.value.filter(shop => shop.id !== id)

    alert(`Shop ${status} successfully!`)
  } catch (err: any) {
    console.error('Update error:', err)
    errorMessage.value = err.message
    alert(`Failed to update shop: ${err.message}`)
  }
}

const revokeApproval = async (id: string) => {
  if (!isAdmin.value) {
    errorMessage.value = 'Admin privileges required.'
    return
  }

  try {
    errorMessage.value = ''

    const { error } = await supabase
      .from('shops')
      .update({
        status: 'declined',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    approvedShops.value = approvedShops.value.filter(shop => shop.id !== id)
    alert('Shop approval revoked successfully!')
  } catch (err: any) {
    console.error('Revoke error:', err)
    errorMessage.value = `Failed to revoke approval: ${err.message}`
    alert(errorMessage.value)
  }
}

onMounted(async () => {
  await checkAdminStatus()
  if (isAdmin.value) {
    await fetchShops()
  }
})
</script>

<template>
  <v-container>
    <v-card>
      <v-card-title>
        <v-icon color="primary" class="mr-2">mdi-store-check</v-icon>
        <span class="text-h5">Shop Management</span>
        <v-chip v-if="isAdmin" color="green" class="ml-2" small>
          <v-icon small class="mr-1">mdi-shield-account</v-icon>
          Admin
        </v-chip>
      </v-card-title>

      <v-card-text>
        <!-- Error Message -->
        <v-alert
          v-if="errorMessage"
          :type="isAdmin ? 'error' : 'warning'"
          class="mb-4"
          dismissible
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>

        <div v-if="!isAdmin" class="text-center py-8">
          <v-icon color="warning" size="64" class="mb-4">mdi-alert-circle</v-icon>
          <div class="text-h6">Access Denied</div>
          <div class="text-body-1 mt-2">Admin privileges required to access this page.</div>
        </div>

        <div v-else>
          <v-tabs v-model="activeTab" color="primary">
            <v-tab value="pending">
              <v-icon class="mr-2">mdi-clock-outline</v-icon>
              Pending Shops
              <v-badge v-if="pendingShops.length > 0" color="red" :content="pendingShops.length" inline class="ml-2" />
            </v-tab>
            <v-tab value="approved">
              <v-icon class="mr-2">mdi-check-circle</v-icon>
              Approved Shops
              <v-badge v-if="approvedShops.length > 0" color="green" :content="approvedShops.length" inline class="ml-2" />
            </v-tab>
          </v-tabs>

          <v-window v-model="activeTab">
            <!-- Pending Shops Tab -->
            <v-window-item value="pending">
              <v-progress-circular
                v-if="loadingShops"
                indeterminate
                color="primary"
                size="40"
                class="d-flex mx-auto my-6"
              />

              <v-simple-table v-else>
                <thead>
                  <tr>
                    <th>Shop Name</th>
                    <th>Owner ID</th>
                    <th>Address</th>
                    <th>Contact Info</th>
                    <th>Registration Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="shop in pendingShops" :key="shop.id">
                    <td>
                      <div class="font-weight-bold">{{ shop.business_name }}</div>
                      <div class="text-caption text-grey">{{ shop.business_type }}</div>
                    </td>
                    <td>{{ shop.owner_id }}</td>
                    <td>
                      <div>{{ shop.detected_address || (shop.street && shop.barangay ? shop.street + ', ' + shop.barangay : 'No address') }}</div>
                      <div class="text-caption">{{ shop.city }}, {{ shop.province }}</div>
                    </td>
                    <td>
                      <div v-if="shop.contact_number">{{ shop.contact_number }}</div>
                      <div v-if="shop.email" class="text-caption">{{ shop.email }}</div>
                    </td>
                    <td>
                      <div>{{ new Date(shop.created_at).toLocaleDateString() }}</div>
                      <div class="text-caption">{{ new Date(shop.created_at).toLocaleTimeString() }}</div>
                    </td>
                    <td>
                      <div class="d-flex flex-column gap-2">
                        <v-btn color="success" small @click="updateShopStatus(shop.id, 'approved')">
                          <v-icon small class="mr-1">mdi-check</v-icon>
                          Approve
                        </v-btn>
                        <v-btn color="error" small @click="updateShopStatus(shop.id, 'declined')">
                          <v-icon small class="mr-1">mdi-close</v-icon>
                          Decline
                        </v-btn>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </v-simple-table>

              <v-alert v-if="!pendingShops.length && !loadingShops" type="info" class="mt-4">
                <v-icon class="mr-2">mdi-information</v-icon>
                No pending shop registrations.
              </v-alert>
            </v-window-item>

            <!-- Approved Shops Tab -->
            <v-window-item value="approved">
              <v-progress-circular
                v-if="loadingShops"
                indeterminate
                color="primary"
                size="40"
                class="d-flex mx-auto my-6"
              />

              <v-simple-table v-else>
                <thead>
                  <tr>
                    <th>Shop Name</th>
                    <th>Owner ID</th>
                    <th>Address</th>
                    <th>Contact Info</th>
                    <th>Approval Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="shop in approvedShops" :key="shop.id">
                    <td>
                      <div class="font-weight-bold">{{ shop.business_name }}</div>
                      <div class="text-caption text-grey">{{ shop.business_type }}</div>
                    </td>
                    <td>{{ shop.owner_id }}</td>
                    <td>
                      <div>{{ shop.detected_address || (shop.street && shop.barangay ? shop.street + ', ' + shop.barangay : 'No address') }}</div>
                      <div class="text-caption">{{ shop.city }}, {{ shop.province }}</div>
                    </td>
                    <td>
                      <div v-if="shop.contact_number">{{ shop.contact_number }}</div>
                      <div v-if="shop.email" class="text-caption">{{ shop.email }}</div>
                    </td>
                    <td>
                      <div>{{ new Date(shop.updated_at || shop.created_at).toLocaleDateString() }}</div>
                      <div class="text-caption">{{ new Date(shop.updated_at || shop.created_at).toLocaleTimeString() }}</div>
                    </td>
                    <td>
                      <v-chip color="green" small>
                        <v-icon small class="mr-1">mdi-check-circle</v-icon>
                        Approved
                      </v-chip>
                    </td>
                    <td>
                      <v-btn color="error" small @click="revokeApproval(shop.id)">
                        <v-icon small class="mr-1">mdi-cancel</v-icon>
                        Revoke
                      </v-btn>
                    </td>
                  </tr>
                </tbody>
              </v-simple-table>

              <v-alert v-if="!approvedShops.length && !loadingShops" type="info" class="mt-4">
                <v-icon class="mr-2">mdi-information</v-icon>
                No approved shops yet.
              </v-alert>
            </v-window-item>
          </v-window>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
.gap-2 {
  gap: 8px;
}
</style>
