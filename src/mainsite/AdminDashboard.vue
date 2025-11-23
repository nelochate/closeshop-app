<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/utils/supabase'
import { useRouter } from 'vue-router'

const router = useRouter()

const pendingShops = ref<any[]>([])
const approvedShops = ref<any[]>([])
const revokedShops = ref<any[]>([])
const loadingShops = ref(false)
const activeTab = ref('pending')
const errorMessage = ref('')
const isAdmin = ref(false)
const logoutDialog = ref(false)
const idPreviewDialog = ref(false)
const selectedShopForId = ref<any>(null)
const selectedIdType = ref<'front' | 'back' | null>(null)

// Check if current user is admin
const checkAdminStatus = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, first_name, last_name')
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

    // Fetch revoked shops
    const { data: revokedData, error: revokedError } = await supabase
      .from('shops')
      .select('*')
      .eq('status', 'declined')
      .order('updated_at', { ascending: false })

    if (revokedError) throw revokedError
    revokedShops.value = revokedData || []

  } catch (err: any) {
    console.error('Error fetching shops:', err)
    errorMessage.value = `Failed to fetch shops: ${err.message}`
  } finally {
    loadingShops.value = false
  }
}

// Check ID status for a shop
const getIdStatus = (shop: any) => {
  const hasFrontId = !!shop.valid_id_front
  const hasBackId = !!shop.valid_id_back
  const hasBothIds = hasFrontId && hasBackId

  if (!hasFrontId && !hasBackId) {
    return {
      status: 'missing',
      color: 'red',
      text: 'No IDs Uploaded',
      icon: 'mdi-alert-circle',
      description: 'Both front and back IDs are missing'
    }
  } else if (!hasFrontId) {
    return {
      status: 'incomplete',
      color: 'orange',
      text: 'Front ID Missing',
      icon: 'mdi-alert',
      description: 'Front ID is required'
    }
  } else if (!hasBackId) {
    return {
      status: 'incomplete',
      color: 'orange',
      text: 'Back ID Missing',
      icon: 'mdi-alert',
      description: 'Back ID is required'
    }
  } else {
    return {
      status: 'complete',
      color: 'green',
      text: 'IDs Complete',
      icon: 'mdi-check-circle',
      description: 'Both IDs are uploaded'
    }
  }
}

// Preview ID images
const previewId = (shop: any, type: 'front' | 'back') => {
  const hasId = type === 'front' ? !!shop.valid_id_front : !!shop.valid_id_back

  if (!hasId) {
    alert(`No ${type} ID uploaded for this shop.`)
    return
  }

  selectedShopForId.value = shop
  selectedIdType.value = type
  idPreviewDialog.value = true
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
      pendingShops.value = pendingShops.value.filter(shop => shop.id !== id)
    } else if (status === 'declined') {
      const shop = approvedShops.value.find(s => s.id === id)
      if (shop) {
        revokedShops.value.unshift({
          ...shop,
          status: 'declined',
          updated_at: new Date().toISOString()
        })
      }
      approvedShops.value = approvedShops.value.filter(shop => shop.id !== id)
    }

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

    // Move from approved to revoked
    const shop = approvedShops.value.find(s => s.id === id)
    if (shop) {
      revokedShops.value.unshift({
        ...shop,
        status: 'declined',
        updated_at: new Date().toISOString()
      })
    }
    approvedShops.value = approvedShops.value.filter(shop => shop.id !== id)

    alert('Shop approval revoked successfully!')
  } catch (err: any) {
    console.error('Revoke error:', err)
    errorMessage.value = `Failed to revoke approval: ${err.message}`
    alert(errorMessage.value)
  }
}

const restoreShop = async (id: string) => {
  if (!isAdmin.value) {
    errorMessage.value = 'Admin privileges required.'
    return
  }

  try {
    errorMessage.value = ''

    const { error } = await supabase
      .from('shops')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    // Move from revoked to approved
    const shop = revokedShops.value.find(s => s.id === id)
    if (shop) {
      approvedShops.value.unshift({
        ...shop,
        status: 'approved',
        updated_at: new Date().toISOString()
      })
    }
    revokedShops.value = revokedShops.value.filter(shop => shop.id !== id)

    alert('Shop restored successfully!')
  } catch (err: any) {
    console.error('Restore error:', err)
    errorMessage.value = `Failed to restore shop: ${err.message}`
    alert(errorMessage.value)
  }
}

const handleLogout = async () => {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error

    router.push('/login')
  } catch (err: any) {
    console.error('Logout error:', err)
    errorMessage.value = 'Failed to logout. Please try again.'
  } finally {
    logoutDialog.value = false
  }
}

const openLogoutDialog = () => {
  logoutDialog.value = true
}

onMounted(async () => {
  await checkAdminStatus()
  if (isAdmin.value) {
    await fetchShops()
  }
})
</script>

<template>
  <v-container fluid class="pa-0">
    <!-- Header Section -->
    <v-card flat class="mb-4 admin-header">
      <v-card-text class="pa-6">
        <div class="d-flex align-center flex-wrap">
          <div class="d-flex align-center mr-4 mb-2">
            <v-icon color="white" size="32" class="mr-3">mdi-store-check</v-icon>
            <div>
              <h1 class="text-h4 font-weight-bold text-white">Shop Management</h1>
            </div>
          </div>
          <v-spacer></v-spacer>
          <div class="d-flex align-center gap-2 mb-2">
            <v-chip v-if="isAdmin" color="white" size="large" class="text-primary">
              <v-icon start size="20">mdi-shield-account</v-icon>
              Administrator
            </v-chip>
            <v-btn
              color="white"
              variant="outlined"
              @click="openLogoutDialog"
              class="logout-btn"
            >
              <v-icon start>mdi-logout</v-icon>
              Logout
            </v-btn>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- Error Message -->
    <v-alert
      v-if="errorMessage"
      type="error"
      class="mb-4 mx-3"
      variant="tonal"
      dismissible
      @click:close="errorMessage = ''"
    >
      <v-icon start>mdi-alert-circle</v-icon>
      {{ errorMessage }}
    </v-alert>

    <!-- Access Denied State -->
    <div v-if="!isAdmin" class="text-center py-16 px-3">
      <v-icon color="warning" size="96" class="mb-4">mdi-shield-account-outline</v-icon>
      <h2 class="text-h4 font-weight-bold mb-4">Access Denied</h2>
      <p class="text-body-1 text-medium-emphasis mb-6">Admin privileges required to access this page.</p>
      <v-btn color="primary" size="large" rounded="lg" to="/">
        <v-icon start>mdi-home</v-icon>
        Return to Home
      </v-btn>
    </div>

    <!-- Admin Content -->
    <div v-else>
      <!-- Stats Cards -->
      <v-row class="px-3 mb-6" dense>
        <v-col cols="12" sm="6" lg="3">
          <v-card class="stat-card" variant="flat" color="orange" rounded="lg">
            <v-card-text class="pa-4 text-white">
              <div class="d-flex align-center">
                <v-icon size="40" class="mr-3">mdi-store-clock</v-icon>
                <div>
                  <div class="text-h4 font-weight-bold">{{ pendingShops.length }}</div>
                  <div class="text-body-2">Pending Shops</div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <v-card class="stat-card" variant="flat" color="success" rounded="lg">
            <v-card-text class="pa-4 text-white">
              <div class="d-flex align-center">
                <v-icon size="40" class="mr-3">mdi-store-check</v-icon>
                <div>
                  <div class="text-h4 font-weight-bold">{{ approvedShops.length }}</div>
                  <div class="text-body-2">Approved Shops</div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <v-card class="stat-card" variant="flat" color="error" rounded="lg">
            <v-card-text class="pa-4 text-white">
              <div class="d-flex align-center">
                <v-icon size="40" class="mr-3">mdi-store-remove</v-icon>
                <div>
                  <div class="text-h4 font-weight-bold">{{ revokedShops.length }}</div>
                  <div class="text-body-2">Revoked Shops</div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <v-card class="stat-card" variant="flat" color="indigo" rounded="lg">
            <v-card-text class="pa-4 text-white">
              <div class="d-flex align-center">
                <v-icon size="40" class="mr-3">mdi-account-card-details</v-icon>
                <div>
                  <div class="text-h4 font-weight-bold">{{ pendingShops.filter(s => getIdStatus(s).status !== 'complete').length }}</div>
                  <div class="text-body-2">Need ID Review</div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Tabs Section -->
      <v-card class="mx-3" rounded="lg" elevation="2">
        <v-card-text class="pa-0">
          <v-tabs v-model="activeTab" color="primary" grow>
            <v-tab value="pending" class="text-body-1 font-weight-medium">
              <v-icon start>mdi-clock-outline</v-icon>
              Pending
              <v-badge
                v-if="pendingShops.length > 0"
                color="orange"
                :content="pendingShops.length"
                inline
                class="ml-2"
              />
            </v-tab>
            <v-tab value="approved" class="text-body-1 font-weight-medium">
              <v-icon start>mdi-check-circle</v-icon>
              Approved
              <v-badge
                v-if="approvedShops.length > 0"
                color="green"
                :content="approvedShops.length"
                inline
                class="ml-2"
              />
            </v-tab>
            <v-tab value="revoked" class="text-body-1 font-weight-medium">
              <v-icon start>mdi-cancel</v-icon>
              Revoked
              <v-badge
                v-if="revokedShops.length > 0"
                color="red"
                :content="revokedShops.length"
                inline
                class="ml-2"
              />
            </v-tab>
          </v-tabs>

          <v-window v-model="activeTab">
            <!-- Pending Shops Tab -->
            <v-window-item value="pending">
              <div class="pa-4">
                <v-progress-circular
                  v-if="loadingShops"
                  indeterminate
                  color="primary"
                  size="48"
                  class="d-flex mx-auto my-12"
                />

                <!-- Mobile Cards View -->
                <div v-else-if="pendingShops.length > 0" class="d-block d-md-none">
                  <v-card
                    v-for="shop in pendingShops"
                    :key="shop.id"
                    class="mb-4"
                    variant="outlined"
                    rounded="lg"
                  >
                    <v-card-text class="pa-4">
                      <div class="mb-3">
                        <div class="text-h6 font-weight-bold text-primary">{{ shop.business_name }}</div>
                        <div class="text-caption text-medium-emphasis">{{ shop.business_type }}</div>
                      </div>

                      <!-- ID Status with Warning -->
                      <div class="mb-3">
                        <v-chip :color="getIdStatus(shop).color" size="small" variant="flat" class="mb-1">
                          <v-icon start size="16">{{ getIdStatus(shop).icon }}</v-icon>
                          {{ getIdStatus(shop).text }}
                        </v-chip>
                        <div v-if="getIdStatus(shop).status !== 'complete'" class="text-caption text-warning">
                          <v-icon size="14" color="warning" class="mr-1">mdi-alert</v-icon>
                          {{ getIdStatus(shop).description }}
                        </div>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <div class="mb-2">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Owner ID</div>
                        <div class="text-body-2">{{ shop.owner_id }}</div>
                      </div>

                      <div class="mb-2">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Address</div>
                        <div class="text-body-2">
                          {{ shop.detected_address || (shop.street && shop.barangay ? shop.street + ', ' + shop.barangay : 'No address') }}
                        </div>
                        <div class="text-caption text-medium-emphasis">{{ shop.city }}, {{ shop.province }}</div>
                      </div>

                      <div class="mb-2">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Contact</div>
                        <div v-if="shop.contact_number" class="text-body-2">{{ shop.contact_number }}</div>
                        <div v-if="shop.email" class="text-caption text-medium-emphasis">{{ shop.email }}</div>
                      </div>

                      <!-- ID Preview Buttons -->
                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis mb-2">Valid ID:</div>
                        <div class="d-flex gap-2">
                          <v-btn
                            size="small"
                            variant="outlined"
                            color="primary"
                            :disabled="!shop.valid_id_front"
                            @click="previewId(shop, 'front')"
                          >
                            <v-icon start size="16">mdi-card-account-details</v-icon>
                            Front
                            <v-icon v-if="!shop.valid_id_front" end size="14" color="error">mdi-close-circle</v-icon>
                          </v-btn>
                          <v-btn
                            size="small"
                            variant="outlined"
                            color="primary"
                            :disabled="!shop.valid_id_back"
                            @click="previewId(shop, 'back')"
                          >
                            <v-icon start size="16">mdi-card-bulleted</v-icon>
                            Back
                            <v-icon v-if="!shop.valid_id_back" end size="14" color="error">mdi-close-circle</v-icon>
                          </v-btn>
                        </div>
                      </div>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Registered</div>
                        <div class="text-body-2">{{ new Date(shop.created_at).toLocaleDateString() }}</div>
                        <div class="text-caption text-medium-emphasis">{{ new Date(shop.created_at).toLocaleTimeString() }}</div>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <div class="d-flex gap-2">
                        <v-btn
                          color="success"
                          variant="flat"
                          block
                          :disabled="getIdStatus(shop).status !== 'complete'"
                          @click="updateShopStatus(shop.id, 'approved')"
                        >
                          <v-icon start size="18">mdi-check</v-icon>
                          Approve
                        </v-btn>
                        <v-btn
                          color="error"
                          variant="outlined"
                          block
                          @click="updateShopStatus(shop.id, 'declined')"
                        >
                          <v-icon start size="18">mdi-close</v-icon>
                          Decline
                        </v-btn>
                      </div>
                    </v-card-text>
                  </v-card>
                </div>

                <!-- Desktop Table View -->
                <v-data-table
                  v-else-if="pendingShops.length > 0"
                  :headers="[
                    { title: 'Shop Name', key: 'business_name', sortable: true },
                    { title: 'ID Status', key: 'id_status', sortable: true },
                    { title: 'Owner ID', key: 'owner_id', sortable: true },
                    { title: 'Address', key: 'address', sortable: false },
                    { title: 'Contact Info', key: 'contact', sortable: false },
                    { title: 'Registration Date', key: 'created_at', sortable: true },
                    { title: 'Actions', key: 'actions', sortable: false, align: 'center' }
                  ]"
                  :items="pendingShops"
                  :items-per-page="10"
                  class="elevation-1 rounded-lg"
                  hide-default-footer
                >
                  <template #item.business_name="{ item }">
                    <div>
                      <div class="font-weight-bold text-primary">{{ item.columns.business_name }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.raw.business_type }}</div>
                    </div>
                  </template>

                  <template #item.id_status="{ item }">
                    <div>
                      <v-chip :color="getIdStatus(item.raw).color" size="small" variant="flat" class="mb-1">
                        <v-icon start size="16">{{ getIdStatus(item.raw).icon }}</v-icon>
                        {{ getIdStatus(item.raw).text }}
                      </v-chip>
                      <div v-if="getIdStatus(item.raw).status !== 'complete'" class="text-caption text-warning">
                        <v-icon size="12" color="warning" class="mr-1">mdi-alert</v-icon>
                        {{ getIdStatus(item.raw).description }}
                      </div>
                    </div>
                  </template>

                  <template #item.address="{ item }">
                    <div>
                      <div class="text-body-2">{{ item.raw.detected_address || (item.raw.street && item.raw.barangay ? item.raw.street + ', ' + item.raw.barangay : 'No address') }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.raw.city }}, {{ item.raw.province }}</div>
                    </div>
                  </template>

                  <template #item.contact="{ item }">
                    <div>
                      <div v-if="item.raw.contact_number" class="text-body-2">{{ item.raw.contact_number }}</div>
                      <div v-if="item.raw.email" class="text-caption text-medium-emphasis">{{ item.raw.email }}</div>
                    </div>
                  </template>

                  <template #item.created_at="{ item }">
                    <div>
                      <div class="text-body-2">{{ new Date(item.raw.created_at).toLocaleDateString() }}</div>
                      <div class="text-caption text-medium-emphasis">{{ new Date(item.raw.created_at).toLocaleTimeString() }}</div>
                    </div>
                  </template>

                  <template #item.actions="{ item }">
                    <div class="d-flex flex-column gap-2">
                      <div class="d-flex gap-1 justify-center">
                        <v-btn
                          size="x-small"
                          variant="outlined"
                          color="primary"
                          :disabled="!item.raw.valid_id_front"
                          @click="previewId(item.raw, 'front')"
                          class="id-preview-btn"
                        >
                          <v-icon size="14">mdi-card-account-details</v-icon>
                          <v-tooltip activator="parent" location="top">
                            {{ item.raw.valid_id_front ? 'View Front ID' : 'Front ID Missing' }}
                          </v-tooltip>
                        </v-btn>
                        <v-btn
                          size="x-small"
                          variant="outlined"
                          color="primary"
                          :disabled="!item.raw.valid_id_back"
                          @click="previewId(item.raw, 'back')"
                          class="id-preview-btn"
                        >
                          <v-icon size="14">mdi-card-bulleted</v-icon>
                          <v-tooltip activator="parent" location="top">
                            {{ item.raw.valid_id_back ? 'View Back ID' : 'Back ID Missing' }}
                          </v-tooltip>
                        </v-btn>
                      </div>
                      <div class="d-flex gap-1">
                        <v-btn
                          color="success"
                          size="small"
                          variant="flat"
                          :disabled="getIdStatus(item.raw).status !== 'complete'"
                          @click="updateShopStatus(item.raw.id, 'approved')"
                        >
                          <v-icon start size="16">mdi-check</v-icon>
                          Approve
                        </v-btn>
                        <v-btn
                          color="error"
                          size="small"
                          variant="outlined"
                          @click="updateShopStatus(item.raw.id, 'declined')"
                        >
                          <v-icon start size="16">mdi-close</v-icon>
                          Decline
                        </v-btn>
                      </div>
                    </div>
                  </template>
                </v-data-table>

                <v-alert
                  v-else
                  type="info"
                  variant="tonal"
                  class="mt-4 text-center"
                >
                  <v-icon start>mdi-information</v-icon>
                  No pending shop registrations at the moment.
                </v-alert>
              </div>
            </v-window-item>

<!-- Approved Shops Tab -->
            <v-window-item value="approved">
              <div class="pa-4">
                <v-progress-circular
                  v-if="loadingShops"
                  indeterminate
                  color="primary"
                  size="48"
                  class="d-flex mx-auto my-12"
                />

                <!-- Mobile Cards View -->
                <div v-else-if="approvedShops.length > 0" class="d-block d-md-none">
                  <v-card
                    v-for="shop in approvedShops"
                    :key="shop.id"
                    class="mb-4"
                    variant="outlined"
                    rounded="lg"
                  >
                    <v-card-text class="pa-4">
                      <div class="mb-3">
                        <div class="text-h6 font-weight-bold text-primary">{{ shop.business_name }}</div>
                        <div class="text-caption text-medium-emphasis">{{ shop.business_type }}</div>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <div class="mb-2">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Owner ID</div>
                        <div class="text-body-2">{{ shop.owner_id }}</div>
                      </div>

                      <div class="mb-2">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Address</div>
                        <div class="text-body-2">
                          {{ shop.detected_address || (shop.street && shop.barangay ? shop.street + ', ' + shop.barangay : 'No address') }}
                        </div>
                        <div class="text-caption text-medium-emphasis">{{ shop.city }}, {{ shop.province }}</div>
                      </div>

                      <div class="mb-2">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Contact</div>
                        <div v-if="shop.contact_number" class="text-body-2">{{ shop.contact_number }}</div>
                        <div v-if="shop.email" class="text-caption text-medium-emphasis">{{ shop.email }}</div>
                      </div>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Approved</div>
                        <div class="text-body-2">{{ new Date(shop.updated_at || shop.created_at).toLocaleDateString() }}</div>
                        <div class="text-caption text-medium-emphasis">{{ new Date(shop.updated_at || shop.created_at).toLocaleTimeString() }}</div>
                      </div>

                      <div class="mb-3">
                        <v-chip color="green" size="small" variant="flat">
                          <v-icon start size="16">mdi-check-circle</v-icon>
                          Approved
                        </v-chip>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <v-btn
                        color="error"
                        variant="outlined"
                        block
                        @click="revokeApproval(shop.id)"
                      >
                        <v-icon start size="18">mdi-cancel</v-icon>
                        Revoke Approval
                      </v-btn>
                    </v-card-text>
                  </v-card>
                </div>

                <!-- Desktop Table View -->
                <v-data-table
                  v-else-if="approvedShops.length > 0"
                  :headers="[
                    { title: 'Shop Name', key: 'business_name', sortable: true },
                    { title: 'Owner ID', key: 'owner_id', sortable: true },
                    { title: 'Address', key: 'address', sortable: false },
                    { title: 'Contact Info', key: 'contact', sortable: false },
                    { title: 'Approval Date', key: 'updated_at', sortable: true },
                    { title: 'Status', key: 'status', sortable: false },
                    { title: 'Actions', key: 'actions', sortable: false, align: 'center' }
                  ]"
                  :items="approvedShops"
                  :items-per-page="10"
                  class="elevation-1 rounded-lg"
                  hide-default-footer
                >
                  <template #item.business_name="{ item }">
                    <div>
                      <div class="font-weight-bold text-primary">{{ item.columns.business_name }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.raw.business_type }}</div>
                    </div>
                  </template>

                  <template #item.address="{ item }">
                    <div>
                      <div class="text-body-2">{{ item.raw.detected_address || (item.raw.street && item.raw.barangay ? item.raw.street + ', ' + item.raw.barangay : 'No address') }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.raw.city }}, {{ item.raw.province }}</div>
                    </div>
                  </template>

                  <template #item.contact="{ item }">
                    <div>
                      <div v-if="item.raw.contact_number" class="text-body-2">{{ item.raw.contact_number }}</div>
                      <div v-if="item.raw.email" class="text-caption text-medium-emphasis">{{ item.raw.email }}</div>
                    </div>
                  </template>

                  <template #item.updated_at="{ item }">
                    <div>
                      <div class="text-body-2">{{ new Date(item.raw.updated_at || item.raw.created_at).toLocaleDateString() }}</div>
                      <div class="text-caption text-medium-emphasis">{{ new Date(item.raw.updated_at || item.raw.created_at).toLocaleTimeString() }}</div>
                    </div>
                  </template>

                  <template #item.status="{ item }">
                    <v-chip color="green" size="small" variant="flat">
                      <v-icon start size="16">mdi-check-circle</v-icon>
                      Approved
                    </v-chip>
                  </template>

                  <template #item.actions="{ item }">
                    <v-btn
                      color="error"
                      size="small"
                      variant="outlined"
                      @click="revokeApproval(item.raw.id)"
                    >
                      <v-icon start size="18">mdi-cancel</v-icon>
                      Revoke
                    </v-btn>
                  </template>
                </v-data-table>

                <v-alert
                  v-else
                  type="info"
                  variant="tonal"
                  class="mt-4 text-center"
                >
                  <v-icon start>mdi-information</v-icon>
                  No approved shops yet. Start by approving some pending registrations!
                </v-alert>
              </div>
            </v-window-item>

            <!-- Revoked Shops Tab -->
            <v-window-item value="revoked">
              <div class="pa-4">
                <v-progress-circular
                  v-if="loadingShops"
                  indeterminate
                  color="primary"
                  size="48"
                  class="d-flex mx-auto my-12"
                />

                <!-- Mobile Cards View -->
                <div v-else-if="revokedShops.length > 0" class="d-block d-md-none">
                  <v-card
                    v-for="shop in revokedShops"
                    :key="shop.id"
                    class="mb-4"
                    variant="outlined"
                    rounded="lg"
                  >
                    <v-card-text class="pa-4">
                      <div class="mb-3">
                        <div class="text-h6 font-weight-bold text-primary">{{ shop.business_name }}</div>
                        <div class="text-caption text-medium-emphasis">{{ shop.business_type }}</div>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <div class="mb-2">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Owner ID</div>
                        <div class="text-body-2">{{ shop.owner_id }}</div>
                      </div>

                      <div class="mb-2">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Address</div>
                        <div class="text-body-2">
                          {{ shop.detected_address || (shop.street && shop.barangay ? shop.street + ', ' + shop.barangay : 'No address') }}
                        </div>
                        <div class="text-caption text-medium-emphasis">{{ shop.city }}, {{ shop.province }}</div>
                      </div>

                      <div class="mb-2">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Contact</div>
                        <div v-if="shop.contact_number" class="text-body-2">{{ shop.contact_number }}</div>
                        <div v-if="shop.email" class="text-caption text-medium-emphasis">{{ shop.email }}</div>
                      </div>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Revoked</div>
                        <div class="text-body-2">{{ new Date(shop.updated_at || shop.created_at).toLocaleDateString() }}</div>
                        <div class="text-caption text-medium-emphasis">{{ new Date(shop.updated_at || shop.created_at).toLocaleTimeString() }}</div>
                      </div>

                      <div class="mb-3">
                        <v-chip color="red" size="small" variant="flat">
                          <v-icon start size="16">mdi-cancel</v-icon>
                          Revoked
                        </v-chip>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <v-btn
                        color="success"
                        variant="flat"
                        block
                        @click="restoreShop(shop.id)"
                      >
                        <v-icon start size="18">mdi-restore</v-icon>
                        Restore Shop
                      </v-btn>
                    </v-card-text>
                  </v-card>
                </div>

                <!-- Desktop Table View -->
                <v-data-table
                  v-else-if="revokedShops.length > 0"
                  :headers="[
                    { title: 'Shop Name', key: 'business_name', sortable: true },
                    { title: 'Owner ID', key: 'owner_id', sortable: true },
                    { title: 'Address', key: 'address', sortable: false },
                    { title: 'Contact Info', key: 'contact', sortable: false },
                    { title: 'Revoked Date', key: 'updated_at', sortable: true },
                    { title: 'Status', key: 'status', sortable: false },
                    { title: 'Actions', key: 'actions', sortable: false, align: 'center' }
                  ]"
                  :items="revokedShops"
                  :items-per-page="10"
                  class="elevation-1 rounded-lg"
                  hide-default-footer
                >
                  <template #item.business_name="{ item }">
                    <div>
                      <div class="font-weight-bold text-primary">{{ item.columns.business_name }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.raw.business_type }}</div>
                    </div>
                  </template>

                  <template #item.address="{ item }">
                    <div>
                      <div class="text-body-2">{{ item.raw.detected_address || (item.raw.street && item.raw.barangay ? item.raw.street + ', ' + item.raw.barangay : 'No address') }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.raw.city }}, {{ item.raw.province }}</div>
                    </div>
                  </template>

                  <template #item.contact="{ item }">
                    <div>
                      <div v-if="item.raw.contact_number" class="text-body-2">{{ item.raw.contact_number }}</div>
                      <div v-if="item.raw.email" class="text-caption text-medium-emphasis">{{ item.raw.email }}</div>
                    </div>
                  </template>

                  <template #item.updated_at="{ item }">
                    <div>
                      <div class="text-body-2">{{ new Date(item.raw.updated_at || item.raw.created_at).toLocaleDateString() }}</div>
                      <div class="text-caption text-medium-emphasis">{{ new Date(item.raw.updated_at || item.raw.created_at).toLocaleTimeString() }}</div>
                    </div>
                  </template>

                  <template #item.status="{ item }">
                    <v-chip color="red" size="small" variant="flat">
                      <v-icon start size="16">mdi-cancel</v-icon>
                      Revoked
                    </v-chip>
                  </template>

                  <template #item.actions="{ item }">
                    <v-btn
                      color="success"
                      size="small"
                      variant="flat"
                      @click="restoreShop(item.raw.id)"
                    >
                      <v-icon start size="18">mdi-restore</v-icon>
                      Restore
                    </v-btn>
                  </template>
                </v-data-table>

                <v-alert
                  v-else
                  type="info"
                  variant="tonal"
                  class="mt-4 text-center"
                >
                  <v-icon start>mdi-information</v-icon>
                  No revoked shops. All shops are currently active or pending approval.
                </v-alert>
              </div>
            </v-window-item>
          </v-window>
        </v-card-text>
      </v-card>
    </div>


    <!-- ID Preview Dialog -->
    <v-dialog v-model="idPreviewDialog" max-width="800" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-icon color="primary" class="mr-2">mdi-card-account-details</v-icon>
          Valid ID - {{ selectedIdType === 'front' ? 'Front' : 'Back' }}
          <v-spacer></v-spacer>
          <v-chip v-if="selectedShopForId" :color="getIdStatus(selectedShopForId).color" size="small">
            {{ getIdStatus(selectedShopForId).text }}
          </v-chip>
        </v-card-title>
        <v-card-text class="text-center pa-6">
          <div v-if="selectedShopForId && selectedIdType">
            <v-img
              :src="selectedIdType === 'front' ? selectedShopForId.valid_id_front : selectedShopForId.valid_id_back"
              max-height="500"
              contain
              class="mb-4 rounded-lg elevation-2"
            />
            <div class="text-caption text-medium-emphasis mb-4">
              Shop: <strong>{{ selectedShopForId.business_name }}</strong> |
              Owner ID: <strong>{{ selectedShopForId.owner_id }}</strong>
            </div>
          </div>
        </v-card-text>
        <v-card-actions class="justify-end pa-4">
          <v-btn variant="text" @click="idPreviewDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Logout Confirmation Dialog -->
    <v-dialog v-model="logoutDialog" max-width="400" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-icon color="primary" class="mr-2">mdi-logout</v-icon>
          Confirm Logout
        </v-card-title>
        <v-card-text>
          <p class="text-body-1">Are you sure you want to logout from the admin dashboard?</p>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="logoutDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="handleLogout">
            <v-icon start>mdi-logout</v-icon>
            Logout
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.admin-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding-top: 20px;
}

.admin-header .text-primary {
  color: rgb(51, 153, 11) !important;
  background-color: #f2f2f2 !important;
}

.stat-card {
  transition: transform 0.2s ease-in-out;
}

.stat-card:hover {
  transform: translateY(-4px);
}

.logout-btn {
  border-color: white !important;
  color: white !important;
}

.gap-2 {
  gap: 8px;
}

.id-preview-btn {
  min-width: 36px !important;
  width: 36px !important;
  height: 36px !important;
}

/* Mobile optimizations */
@media (max-width: 960px) {
  .admin-header .text-h4 {
    font-size: 1.75rem !important;
  }

  .stat-card .text-h4 {
    font-size: 1.5rem !important;
  }
}

@media (max-width: 600px) {
  .admin-header {
    text-align: center;
  }

  .admin-header .d-flex {
    justify-content: center;
  }

  .stat-card .text-h4 {
    font-size: 1.25rem !important;
  }

  .stat-card .v-icon {
    font-size: 32px !important;
  }
}

/* Custom scrollbar for tables */
.v-data-table {
  border-radius: 12px;
}

.v-data-table :deep(.v-data-table-header) {
  background-color: rgba(0, 0, 0, 0.02);
}

.v-data-table :deep(th) {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.7);
}

/* Smooth transitions */
.v-window-item {
  transition: all 0.3s ease-in-out;
}

/* Card hover effects */
.v-card {
  transition: all 0.3s ease;
}

.v-card:hover {
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15) !important;
}

/* Warning text styling */
.text-warning {
  color: #ff9800 !important;
}
</style>
