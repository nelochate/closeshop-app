<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
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
const adminUser = ref<any>(null)

// Check if current user is admin
const checkAdminStatus = async () => {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError) {
      console.error('Error getting user:', userError)
      errorMessage.value = 'Authentication error. Please log in.'
      return
    }
    
    if (user) {
      // First, check if user exists in profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Error fetching profile:', profileError)
        
        // If profile doesn't exist, create one with default role
        if (profileError.code === 'PGRST116') { // Code for no rows returned
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([
              {
                id: user.id,
                email: user.email,
                role: 'user', // Default role
                created_at: new Date().toISOString()
              }
            ])
            .select()
            .single()
            
          if (createError) {
            console.error('Error creating profile:', createError)
            throw createError
          }
          
          adminUser.value = newProfile
          isAdmin.value = false
          errorMessage.value = 'Access denied. Admin privileges required.'
          return
        } else {
          throw profileError
        }
      }

      adminUser.value = profile
      isAdmin.value = profile?.role === 'admin'

      if (!isAdmin.value) {
        errorMessage.value = 'Access denied. Admin privileges required.'
      }
    } else {
      errorMessage.value = 'Not authenticated. Please log in.'
      router.push('/login')
    }
  } catch (err: any) {
    console.error('Error checking admin status:', err)
    errorMessage.value = 'Error verifying admin privileges: ' + err.message
  }
}

// Fetch shops based on status
const fetchShopsByStatus = async (status: string) => {
  try {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (err: any) {
    console.error(`Error fetching ${status} shops:`, err)
    throw err
  }
}

const fetchShops = async () => {
  if (!isAdmin.value) return

  loadingShops.value = true
  errorMessage.value = ''

  try {
    // Fetch all shops in parallel
    const [pendingData, approvedData, revokedData] = await Promise.all([
      fetchShopsByStatus('pending'),
      fetchShopsByStatus('approved'),
      fetchShopsByStatus('declined')
    ])

    pendingShops.value = pendingData
    approvedShops.value = approvedData
    revokedShops.value = revokedData

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

  if (!hasFrontId && !hasBackId) {
    return {
      status: 'missing',
      color: 'red',
      text: 'No IDs Uploaded',
      icon: 'mdi-alert-circle',
      description: 'Both front and back IDs are missing',
      canApprove: false
    }
  } else if (!hasFrontId) {
    return {
      status: 'incomplete',
      color: 'orange',
      text: 'Front ID Missing',
      icon: 'mdi-alert',
      description: 'Front ID is required',
      canApprove: false
    }
  } else if (!hasBackId) {
    return {
      status: 'incomplete',
      color: 'orange',
      text: 'Back ID Missing',
      icon: 'mdi-alert',
      description: 'Back ID is required',
      canApprove: false
    }
  } else {
    return {
      status: 'complete',
      color: 'green',
      text: 'IDs Complete',
      icon: 'mdi-check-circle',
      description: 'Both IDs are uploaded',
      canApprove: true
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

// Update shop status with proper data handling
const updateShopStatus = async (id: string, status: 'approved' | 'declined') => {
  if (!isAdmin.value) {
    errorMessage.value = 'Admin privileges required.'
    return
  }

  if (!confirm(`Are you sure you want to ${status === 'approved' ? 'approve' : 'decline'} this shop?`)) {
    return
  }

  try {
    errorMessage.value = ''

    // First, get the current shop to move it to the correct array
    let shopToMove: any = null
    let sourceArray: any[] = []
    let targetArray: any[] = []

    if (status === 'approved') {
      shopToMove = pendingShops.value.find(s => s.id === id)
      sourceArray = pendingShops
      targetArray = approvedShops
    } else if (status === 'declined') {
      shopToMove = approvedShops.value.find(s => s.id === id)
      sourceArray = approvedShops
      targetArray = revokedShops
    }

    if (!shopToMove) {
      throw new Error('Shop not found')
    }

    const { data, error } = await supabase
      .from('shops')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      throw error
    }

    // Update local state
    if (data) {
      targetArray.value.unshift({
        ...shopToMove,
        status: status,
        updated_at: new Date().toISOString()
      })
      sourceArray.value = sourceArray.value.filter(shop => shop.id !== id)
    }

    alert(`Shop ${status} successfully!`)
  } catch (err: any) {
    console.error('Update error:', err)
    errorMessage.value = `Failed to update shop: ${err.message}`
    alert(`Failed to update shop: ${err.message}`)
  }
}

const revokeApproval = async (id: string) => {
  if (!isAdmin.value) {
    errorMessage.value = 'Admin privileges required.'
    return
  }

  if (!confirm('Are you sure you want to revoke approval for this shop?')) {
    return
  }

  try {
    errorMessage.value = ''

    const shopToMove = approvedShops.value.find(s => s.id === id)
    if (!shopToMove) {
      throw new Error('Shop not found')
    }

    const { error } = await supabase
      .from('shops')
      .update({
        status: 'declined',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    // Update local state
    revokedShops.value.unshift({
      ...shopToMove,
      status: 'declined',
      updated_at: new Date().toISOString()
    })
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

  if (!confirm('Are you sure you want to restore this shop?')) {
    return
  }

  try {
    errorMessage.value = ''

    const shopToMove = revokedShops.value.find(s => s.id === id)
    if (!shopToMove) {
      throw new Error('Shop not found')
    }

    const { error } = await supabase
      .from('shops')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    // Update local state
    approvedShops.value.unshift({
      ...shopToMove,
      status: 'approved',
      updated_at: new Date().toISOString()
    })
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

// Function to handle tab changes
const handleTabChange = (tab: string) => {
  activeTab.value = tab
}

// Computed properties for statistics
const pendingCount = computed(() => pendingShops.value.length)
const approvedCount = computed(() => approvedShops.value.length)
const revokedCount = computed(() => revokedShops.value.length)
const needsIdReviewCount = computed(() => pendingShops.value.filter(s => getIdStatus(s).status !== 'complete').length)

// Format date for display
const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const formatTime = (dateString: string) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Get full address
const getFullAddress = (shop: any) => {
  const parts = []
  if (shop.street) parts.push(shop.street)
  if (shop.barangay) parts.push(shop.barangay)
  if (shop.city) parts.push(shop.city)
  if (shop.province) parts.push(shop.province)
  
  if (parts.length > 0) {
    return parts.join(', ')
  }
  return shop.detected_address || 'No address provided'
}

onMounted(async () => {
  await checkAdminStatus()
  if (isAdmin.value) {
    await fetchShops()
  }
})

// Set up real-time subscription for shop updates
onMounted(() => {
  if (isAdmin.value) {
    const channel = supabase
      .channel('shops-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shops'
        },
        async (payload) => {
          console.log('Shop change detected:', payload)
          // Refresh the shops list
          await fetchShops()
        }
      )
      .subscribe()

    // Clean up subscription
    return () => {
      supabase.removeChannel(channel)
    }
  }
})
</script>

<template>
  <v-container fluid class="pa-0 ma-0" style="max-width: 100vw; overflow-x: hidden;">
    <!-- Header Section -->
    <v-card flat class="mb-4 admin-header" rounded="0">
      <v-card-text class="pa-4">
        <div class="d-flex align-center flex-wrap">
          <div class="d-flex align-center mr-4 mb-2">
            <v-icon color="white" size="32" class="mr-3">mdi-store-check</v-icon>
            <div>
              <h1 class="text-h5 text-md-h4 font-weight-bold text-white">Shop Management</h1>
              <div v-if="adminUser" class="text-caption text-white text-opacity-90">
                Welcome, {{ adminUser.first_name || adminUser.email }}
              </div>
            </div>
          </div>
          <v-spacer></v-spacer>
          <div class="d-flex align-center gap-2 mb-2">
            <v-chip v-if="isAdmin" color="white" size="large" class="text-primary d-none d-sm-flex">
              <v-icon start size="20">mdi-shield-account</v-icon>
              Administrator
            </v-chip>
            <v-chip v-if="isAdmin" color="white" size="small" class="text-primary d-flex d-sm-none">
              <v-icon start size="16">mdi-shield-account</v-icon>
              Admin
            </v-chip>
            <v-btn
              color="white"
              variant="outlined"
              @click="openLogoutDialog"
              class="logout-btn"
              size="small"
              :block="$vuetify.display.xs"
            >
              <v-icon start size="20">mdi-logout</v-icon>
              <span class="d-none d-sm-inline">Logout</span>
            </v-btn>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- Error Message -->
    <v-alert
      v-if="errorMessage"
      type="error"
      class="mb-4 mx-2"
      variant="tonal"
      dismissible
      density="comfortable"
      @click:close="errorMessage = ''"
    >
      <v-icon start>mdi-alert-circle</v-icon>
      {{ errorMessage }}
    </v-alert>

    <!-- Access Denied State -->
    <div v-if="!isAdmin && adminUser" class="text-center py-16 px-3">
      <v-icon color="warning" size="72" class="mb-4">mdi-shield-account-outline</v-icon>
      <h2 class="text-h5 font-weight-bold mb-4">Access Denied</h2>
      <p class="text-body-1 text-medium-emphasis mb-6">Admin privileges required to access this page.</p>
      <v-btn color="primary" size="large" rounded="lg" to="/" block>
        <v-icon start>mdi-home</v-icon>
        Return to Home
      </v-btn>
    </div>

    <!-- Admin Content -->
    <div v-else-if="isAdmin">
      <!-- Stats Cards -->
      <v-row class="px-2 mb-4" dense>
        <v-col cols="6" sm="6" lg="3">
          <v-card class="stat-card" variant="flat" color="orange" rounded="lg" :ripple="false">
            <v-card-text class="pa-3 pa-sm-4 text-white">
              <div class="d-flex align-center">
                <v-icon size="32" class="mr-2 mr-sm-3">mdi-store-clock</v-icon>
                <div>
                  <div class="text-h5 text-sm-h4 font-weight-bold">{{ pendingCount }}</div>
                  <div class="text-caption text-sm-body-2">Pending</div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="6" lg="3">
          <v-card class="stat-card" variant="flat" color="success" rounded="lg" :ripple="false">
            <v-card-text class="pa-3 pa-sm-4 text-white">
              <div class="d-flex align-center">
                <v-icon size="32" class="mr-2 mr-sm-3">mdi-store-check</v-icon>
                <div>
                  <div class="text-h5 text-sm-h4 font-weight-bold">{{ approvedCount }}</div>
                  <div class="text-caption text-sm-body-2">Approved</div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="6" lg="3">
          <v-card class="stat-card" variant="flat" color="error" rounded="lg" :ripple="false">
            <v-card-text class="pa-3 pa-sm-4 text-white">
              <div class="d-flex align-center">
                <v-icon size="32" class="mr-2 mr-sm-3">mdi-store-remove</v-icon>
                <div>
                  <div class="text-h5 text-sm-h4 font-weight-bold">{{ revokedCount }}</div>
                  <div class="text-caption text-sm-body-2">Revoked</div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="6" lg="3">
          <v-card class="stat-card" variant="flat" color="indigo" rounded="lg" :ripple="false">
            <v-card-text class="pa-3 pa-sm-4 text-white">
              <div class="d-flex align-center">
                <v-icon size="32" class="mr-2 mr-sm-3">mdi-account-card-details</v-icon>
                <div>
                  <div class="text-h5 text-sm-h4 font-weight-bold">{{ needsIdReviewCount }}</div>
                  <div class="text-caption text-sm-body-2">Need ID Review</div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Tabs Section -->
      <v-card class="mx-2" rounded="lg" elevation="1" :flat="$vuetify.display.xs">
        <v-card-text class="pa-0">
          <v-tabs v-model="activeTab" color="primary" grow show-arrows @update:model-value="handleTabChange">
            <v-tab value="pending" class="text-body-2 text-sm-body-1 font-weight-medium px-2 px-sm-4">
              <v-icon start size="18">mdi-clock-outline</v-icon>
              Pending
              <v-badge
                v-if="pendingCount > 0"
                color="orange"
                :content="pendingCount"
                inline
                class="ml-2"
              />
            </v-tab>
            <v-tab value="approved" class="text-body-2 text-sm-body-1 font-weight-medium px-2 px-sm-4">
              <v-icon start size="18">mdi-check-circle</v-icon>
              Approved
              <v-badge
                v-if="approvedCount > 0"
                color="green"
                :content="approvedCount"
                inline
                class="ml-2"
              />
            </v-tab>
            <v-tab value="revoked" class="text-body-2 text-sm-body-1 font-weight-medium px-2 px-sm-4">
              <v-icon start size="18">mdi-cancel</v-icon>
              Revoked
              <v-badge
                v-if="revokedCount > 0"
                color="red"
                :content="revokedCount"
                inline
                class="ml-2"
              />
            </v-tab>
          </v-tabs>

          <v-window v-model="activeTab">
            <!-- Pending Shops Tab -->
            <v-window-item value="pending">
              <div class="pa-3 pa-sm-4">
                <v-progress-circular
                  v-if="loadingShops"
                  indeterminate
                  color="primary"
                  size="48"
                  class="d-flex mx-auto my-12"
                />

                <!-- Mobile Cards View -->
                <div v-else-if="pendingShops.length > 0" class="d-block d-md-none">
                  <div class="mb-4">
                    <v-alert
                      v-if="needsIdReviewCount > 0"
                      type="warning"
                      variant="tonal"
                      density="comfortable"
                      class="mb-3"
                    >
                      <v-icon start>mdi-alert</v-icon>
                      {{ needsIdReviewCount }} shops need ID verification
                    </v-alert>
                  </div>
                  
                  <v-card
                    v-for="shop in pendingShops"
                    :key="shop.id"
                    class="mb-4 shop-card"
                    variant="outlined"
                    rounded="lg"
                    :class="{ 'needs-review': getIdStatus(shop).status !== 'complete' }"
                  >
                    <v-card-text class="pa-4">
                      <div class="mb-3">
                        <div class="text-h6 font-weight-bold text-primary">{{ shop.business_name }}</div>
                        <div class="text-caption text-medium-emphasis">{{ shop.business_type || 'No type specified' }}</div>
                      </div>

                      <!-- ID Status -->
                      <div class="mb-3">
                        <v-chip :color="getIdStatus(shop).color" size="small" variant="flat" class="mb-1 touch-target">
                          <v-icon start size="16">{{ getIdStatus(shop).icon }}</v-icon>
                          {{ getIdStatus(shop).text }}
                        </v-chip>
                        <div v-if="getIdStatus(shop).status !== 'complete'" class="text-caption text-warning mt-1">
                          <v-icon size="14" color="warning" class="mr-1">mdi-alert</v-icon>
                          {{ getIdStatus(shop).description }}
                        </div>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Owner ID</div>
                        <div class="text-body-2">{{ shop.owner_id }}</div>
                      </div>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Address</div>
                        <div class="text-body-2">{{ getFullAddress(shop) }}</div>
                      </div>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Contact</div>
                        <div v-if="shop.contact_number" class="text-body-2">{{ shop.contact_number }}</div>
                        <div v-if="shop.email" class="text-caption text-medium-emphasis">{{ shop.email }}</div>
                      </div>

                      <!-- ID Preview Buttons -->
                      <div class="mb-4">
                        <div class="text-caption font-weight-medium text-medium-emphasis mb-2">Valid ID:</div>
                        <div class="d-flex gap-2">
                          <v-btn
                            size="small"
                            variant="outlined"
                            color="primary"
                            :disabled="!shop.valid_id_front"
                            @click="previewId(shop, 'front')"
                            class="touch-target flex-grow-1"
                            height="40"
                          >
                            <v-icon start size="18">mdi-card-account-details</v-icon>
                            Front
                            <v-icon v-if="!shop.valid_id_front" end size="16" color="error">mdi-close-circle</v-icon>
                          </v-btn>
                          <v-btn
                            size="small"
                            variant="outlined"
                            color="primary"
                            :disabled="!shop.valid_id_back"
                            @click="previewId(shop, 'back')"
                            class="touch-target flex-grow-1"
                            height="40"
                          >
                            <v-icon start size="18">mdi-card-bulleted</v-icon>
                            Back
                            <v-icon v-if="!shop.valid_id_back" end size="16" color="error">mdi-close-circle</v-icon>
                          </v-btn>
                        </div>
                      </div>

                      <div class="mb-4">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Registered</div>
                        <div class="text-body-2">{{ formatDate(shop.created_at) }}</div>
                        <div class="text-caption text-medium-emphasis">{{ formatTime(shop.created_at) }}</div>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <!-- Action Buttons -->
                      <div class="d-flex flex-column gap-3">
                        <v-btn
                          color="success"
                          variant="flat"
                          size="large"
                          :disabled="!getIdStatus(shop).canApprove"
                          @click="updateShopStatus(shop.id, 'approved')"
                          class="touch-target"
                          height="48"
                          block
                        >
                          <v-icon start size="20">mdi-check</v-icon>
                          Approve Shop
                        </v-btn>
                        <v-btn
                          color="error"
                          variant="outlined"
                          size="large"
                          @click="updateShopStatus(shop.id, 'declined')"
                          class="touch-target"
                          height="48"
                          block
                        >
                          <v-icon start size="20">mdi-close</v-icon>
                          Decline Shop
                        </v-btn>
                      </div>
                    </v-card-text>
                  </v-card>
                </div>

                <!-- Desktop Table View -->
                <v-data-table
                  v-else-if="pendingShops.length > 0"
                  :headers="[
                    { title: 'Shop Name', key: 'business_name', sortable: true, width: '200px' },
                    { title: 'ID Status', key: 'id_status', sortable: true, width: '150px' },
                    { title: 'Owner ID', key: 'owner_id', sortable: true, width: '120px' },
                    { title: 'Address', key: 'address', sortable: false, width: '200px' },
                    { title: 'Contact', key: 'contact', sortable: false, width: '150px' },
                    { title: 'Registered', key: 'created_at', sortable: true, width: '120px' },
                    { title: 'Actions', key: 'actions', sortable: false, align: 'center', width: '200px' }
                  ]"
                  :items="pendingShops"
                  :items-per-page="10"
                  class="elevation-1 rounded-lg"
                  hide-default-footer
                >
                  <template #item.business_name="{ item }">
                    <div>
                      <div class="font-weight-bold text-primary text-truncate">{{ item.raw.business_name }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.raw.business_type || 'No type' }}</div>
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
                    <div class="text-body-2 text-truncate" :title="getFullAddress(item.raw)">
                      {{ getFullAddress(item.raw) }}
                    </div>
                  </template>

                  <template #item.contact="{ item }">
                    <div>
                      <div v-if="item.raw.contact_number" class="text-body-2">{{ item.raw.contact_number }}</div>
                      <div v-if="item.raw.email" class="text-caption text-medium-emphasis text-truncate">{{ item.raw.email }}</div>
                    </div>
                  </template>

                  <template #item.created_at="{ item }">
                    <div>
                      <div class="text-body-2">{{ formatDate(item.raw.created_at) }}</div>
                      <div class="text-caption text-medium-emphasis">{{ formatTime(item.raw.created_at) }}</div>
                    </div>
                  </template>

                  <template #item.actions="{ item }">
                    <div class="d-flex flex-column gap-2">
                      <div class="d-flex gap-1 justify-center">
                        <v-btn
                          size="small"
                          variant="outlined"
                          color="primary"
                          :disabled="!item.raw.valid_id_front"
                          @click="previewId(item.raw, 'front')"
                          class="touch-target"
                          min-width="40"
                          width="40"
                          height="36"
                        >
                          <v-icon size="18">mdi-card-account-details</v-icon>
                          <v-tooltip activator="parent" location="top">
                            {{ item.raw.valid_id_front ? 'View Front ID' : 'Front ID Missing' }}
                          </v-tooltip>
                        </v-btn>
                        <v-btn
                          size="small"
                          variant="outlined"
                          color="primary"
                          :disabled="!item.raw.valid_id_back"
                          @click="previewId(item.raw, 'back')"
                          class="touch-target"
                          min-width="40"
                          width="40"
                          height="36"
                        >
                          <v-icon size="18">mdi-card-bulleted</v-icon>
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
                          :disabled="!getIdStatus(item.raw).canApprove"
                          @click="updateShopStatus(item.raw.id, 'approved')"
                          class="touch-target flex-grow-1"
                          height="36"
                        >
                          <v-icon start size="16">mdi-check</v-icon>
                          Approve
                        </v-btn>
                        <v-btn
                          color="error"
                          size="small"
                          variant="outlined"
                          @click="updateShopStatus(item.raw.id, 'declined')"
                          class="touch-target flex-grow-1"
                          height="36"
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
                  density="comfortable"
                >
                  <v-icon start>mdi-information</v-icon>
                  No pending shop registrations at the moment.
                </v-alert>
              </div>
            </v-window-item>

            <!-- Approved Shops Tab -->
            <v-window-item value="approved">
              <div class="pa-3 pa-sm-4">
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
                    class="mb-4 shop-card"
                    variant="outlined"
                    rounded="lg"
                  >
                    <v-card-text class="pa-4">
                      <div class="mb-3">
                        <div class="text-h6 font-weight-bold text-primary">{{ shop.business_name }}</div>
                        <div class="text-caption text-medium-emphasis">{{ shop.business_type || 'No type specified' }}</div>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Owner ID</div>
                        <div class="text-body-2">{{ shop.owner_id }}</div>
                      </div>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Address</div>
                        <div class="text-body-2">{{ getFullAddress(shop) }}</div>
                      </div>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Contact</div>
                        <div v-if="shop.contact_number" class="text-body-2">{{ shop.contact_number }}</div>
                        <div v-if="shop.email" class="text-caption text-medium-emphasis">{{ shop.email }}</div>
                      </div>

                      <div class="mb-4">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Approved</div>
                        <div class="text-body-2">{{ formatDate(shop.updated_at || shop.created_at) }}</div>
                        <div class="text-caption text-medium-emphasis">{{ formatTime(shop.updated_at || shop.created_at) }}</div>
                      </div>

                      <div class="mb-4">
                        <v-chip color="green" size="small" variant="flat" class="touch-target">
                          <v-icon start size="16">mdi-check-circle</v-icon>
                          Approved
                        </v-chip>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <v-btn
                        color="error"
                        variant="outlined"
                        size="large"
                        @click="revokeApproval(shop.id)"
                        class="touch-target"
                        height="48"
                        block
                      >
                        <v-icon start size="20">mdi-cancel</v-icon>
                        Revoke Approval
                      </v-btn>
                    </v-card-text>
                  </v-card>
                </div>

                <!-- Desktop Table View -->
                <v-data-table
                  v-else-if="approvedShops.length > 0"
                  :headers="[
                    { title: 'Shop Name', key: 'business_name', sortable: true, width: '200px' },
                    { title: 'Owner ID', key: 'owner_id', sortable: true, width: '120px' },
                    { title: 'Address', key: 'address', sortable: false, width: '200px' },
                    { title: 'Contact', key: 'contact', sortable: false, width: '150px' },
                    { title: 'Approved', key: 'updated_at', sortable: true, width: '120px' },
                    { title: 'Status', key: 'status', sortable: false, width: '100px' },
                    { title: 'Actions', key: 'actions', sortable: false, align: 'center', width: '120px' }
                  ]"
                  :items="approvedShops"
                  :items-per-page="10"
                  class="elevation-1 rounded-lg"
                  hide-default-footer
                >
                  <template #item.business_name="{ item }">
                    <div>
                      <div class="font-weight-bold text-primary text-truncate">{{ item.raw.business_name }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.raw.business_type || 'No type' }}</div>
                    </div>
                  </template>

                  <template #item.address="{ item }">
                    <div class="text-body-2 text-truncate" :title="getFullAddress(item.raw)">
                      {{ getFullAddress(item.raw) }}
                    </div>
                  </template>

                  <template #item.contact="{ item }">
                    <div>
                      <div v-if="item.raw.contact_number" class="text-body-2">{{ item.raw.contact_number }}</div>
                      <div v-if="item.raw.email" class="text-caption text-medium-emphasis text-truncate">{{ item.raw.email }}</div>
                    </div>
                  </template>

                  <template #item.updated_at="{ item }">
                    <div>
                      <div class="text-body-2">{{ formatDate(item.raw.updated_at || item.raw.created_at) }}</div>
                      <div class="text-caption text-medium-emphasis">{{ formatTime(item.raw.updated_at || item.raw.created_at) }}</div>
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
                      class="touch-target"
                      height="36"
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
                  density="comfortable"
                >
                  <v-icon start>mdi-information</v-icon>
                  No approved shops yet. Start by approving some pending registrations!
                </v-alert>
              </div>
            </v-window-item>

            <!-- Revoked Shops Tab -->
            <v-window-item value="revoked">
              <div class="pa-3 pa-sm-4">
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
                    class="mb-4 shop-card"
                    variant="outlined"
                    rounded="lg"
                  >
                    <v-card-text class="pa-4">
                      <div class="mb-3">
                        <div class="text-h6 font-weight-bold text-primary">{{ shop.business_name }}</div>
                        <div class="text-caption text-medium-emphasis">{{ shop.business_type || 'No type specified' }}</div>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Owner ID</div>
                        <div class="text-body-2">{{ shop.owner_id }}</div>
                      </div>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Address</div>
                        <div class="text-body-2">{{ getFullAddress(shop) }}</div>
                      </div>

                      <div class="mb-3">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Contact</div>
                        <div v-if="shop.contact_number" class="text-body-2">{{ shop.contact_number }}</div>
                        <div v-if="shop.email" class="text-caption text-medium-emphasis">{{ shop.email }}</div>
                      </div>

                      <div class="mb-4">
                        <div class="text-caption font-weight-medium text-medium-emphasis">Revoked</div>
                        <div class="text-body-2">{{ formatDate(shop.updated_at || shop.created_at) }}</div>
                        <div class="text-caption text-medium-emphasis">{{ formatTime(shop.updated_at || shop.created_at) }}</div>
                      </div>

                      <div class="mb-4">
                        <v-chip color="red" size="small" variant="flat" class="touch-target">
                          <v-icon start size="16">mdi-cancel</v-icon>
                          Revoked
                        </v-chip>
                      </div>

                      <v-divider class="my-3"></v-divider>

                      <v-btn
                        color="success"
                        variant="flat"
                        size="large"
                        @click="restoreShop(shop.id)"
                        class="touch-target"
                        height="48"
                        block
                      >
                        <v-icon start size="20">mdi-restore</v-icon>
                        Restore Shop
                      </v-btn>
                    </v-card-text>
                  </v-card>
                </div>

                <!-- Desktop Table View -->
                <v-data-table
                  v-else-if="revokedShops.length > 0"
                  :headers="[
                    { title: 'Shop Name', key: 'business_name', sortable: true, width: '200px' },
                    { title: 'Owner ID', key: 'owner_id', sortable: true, width: '120px' },
                    { title: 'Address', key: 'address', sortable: false, width: '200px' },
                    { title: 'Contact', key: 'contact', sortable: false, width: '150px' },
                    { title: 'Revoked', key: 'updated_at', sortable: true, width: '120px' },
                    { title: 'Status', key: 'status', sortable: false, width: '100px' },
                    { title: 'Actions', key: 'actions', sortable: false, align: 'center', width: '120px' }
                  ]"
                  :items="revokedShops"
                  :items-per-page="10"
                  class="elevation-1 rounded-lg"
                  hide-default-footer
                >
                  <template #item.business_name="{ item }">
                    <div>
                      <div class="font-weight-bold text-primary text-truncate">{{ item.raw.business_name }}</div>
                      <div class="text-caption text-medium-emphasis">{{ item.raw.business_type || 'No type' }}</div>
                    </div>
                  </template>

                  <template #item.address="{ item }">
                    <div class="text-body-2 text-truncate" :title="getFullAddress(item.raw)">
                      {{ getFullAddress(item.raw) }}
                    </div>
                  </template>

                  <template #item.contact="{ item }">
                    <div>
                      <div v-if="item.raw.contact_number" class="text-body-2">{{ item.raw.contact_number }}</div>
                      <div v-if="item.raw.email" class="text-caption text-medium-emphasis text-truncate">{{ item.raw.email }}</div>
                    </div>
                  </template>

                  <template #item.updated_at="{ item }">
                    <div>
                      <div class="text-body-2">{{ formatDate(item.raw.updated_at || item.raw.created_at) }}</div>
                      <div class="text-caption text-medium-emphasis">{{ formatTime(item.raw.updated_at || item.raw.created_at) }}</div>
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
                      class="touch-target"
                      height="36"
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
                  density="comfortable"
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
    <v-dialog v-model="idPreviewDialog" max-width="800" persistent scrollable>
      <v-card rounded="lg" class="mx-auto">
        <v-card-title class="d-flex align-center pa-4">
          <v-icon color="primary" class="mr-2">mdi-card-account-details</v-icon>
          <div class="text-truncate">
            Valid ID - {{ selectedIdType === 'front' ? 'Front' : 'Back' }}
          </div>
          <v-spacer></v-spacer>
          <v-chip v-if="selectedShopForId" :color="getIdStatus(selectedShopForId).color" size="small" class="d-none d-sm-flex">
            {{ getIdStatus(selectedShopForId).text }}
          </v-chip>
          <v-btn
            icon
            @click="idPreviewDialog = false"
            class="ml-2"
            size="small"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text class="text-center pa-3 pa-sm-6">
          <div v-if="selectedShopForId && selectedIdType">
            <v-img
              :src="selectedIdType === 'front' ? selectedShopForId.valid_id_front : selectedShopForId.valid_id_back"
              max-height="400"
              contain
              class="mb-4 rounded-lg elevation-2 touch-target"
              @click="idPreviewDialog = false"
            >
              <template #placeholder>
                <v-row class="fill-height ma-0" align="center" justify="center">
                  <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </v-row>
              </template>
            </v-img>
            <div class="text-caption text-medium-emphasis mb-2 px-2">
              <div><strong>Shop:</strong> {{ selectedShopForId.business_name }}</div>
              <div><strong>Owner ID:</strong> {{ selectedShopForId.owner_id }}</div>
            </div>
          </div>
        </v-card-text>
        <v-card-actions class="justify-center pa-4">
          <v-btn 
            variant="flat" 
            color="primary" 
            @click="idPreviewDialog = false"
            block
            size="large"
            class="touch-target"
          >
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Logout Confirmation Dialog -->
    <v-dialog v-model="logoutDialog" max-width="400" persistent scrollable>
      <v-card rounded="lg" class="mx-auto">
        <v-card-title class="d-flex align-center pa-4">
          <v-icon color="primary" class="mr-2">mdi-logout</v-icon>
          Confirm Logout
          <v-spacer></v-spacer>
          <v-btn
            icon
            @click="logoutDialog = false"
            size="small"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text class="pa-4">
          <p class="text-body-1">Are you sure you want to logout from the admin dashboard?</p>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-row>
            <v-col cols="6" class="pr-1">
              <v-btn 
                variant="outlined" 
                @click="logoutDialog = false"
                block
                size="large"
                class="touch-target"
              >
                Cancel
              </v-btn>
            </v-col>
            <v-col cols="6" class="pl-1">
              <v-btn 
                color="error" 
                variant="flat" 
                @click="handleLogout"
                block
                size="large"
                class="touch-target"
              >
                <v-icon start>mdi-logout</v-icon>
                Logout
              </v-btn>
            </v-col>
          </v-row>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.admin-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
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

/* Touch-friendly button styling */
.touch-target {
  min-height: 44px !important;
  min-width: 44px !important;
  padding: 8px 16px !important;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

/* Improved mobile spacing */
.gap-2 {
  gap: 8px;
}

.gap-3 {
  gap: 12px;
}

/* Mobile optimizations */
@media (max-width: 600px) {
  .admin-header .text-h5 {
    font-size: 1.5rem !important;
  }

  .stat-card .text-h5 {
    font-size: 1.25rem !important;
  }

  .stat-card .v-icon {
    font-size: 28px !important;
  }

  .shop-card {
    margin-left: 0;
    margin-right: 0;
  }

  /* Better touch targets for chips */
  .v-chip {
    min-height: 32px !important;
    padding: 0 12px !important;
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

/* Improve table cell padding for mobile */
@media (max-width: 960px) {
  .v-data-table :deep(td) {
    padding: 12px 8px !important;
  }
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

/* Highlight shops that need review */
.shop-card.needs-review {
  border-left: 4px solid #ff9800 !important;
  background-color: rgba(255, 152, 0, 0.05) !important;
}

/* Better dialog for mobile */
@media (max-width: 600px) {
  .v-dialog {
    margin: 16px !important;
    max-height: calc(100vh - 32px) !important;
  }
}

/* Prevent horizontal scroll on mobile */
@media (max-width: 600px) {
  body {
    overflow-x: hidden !important;
  }
  
  .v-container {
    padding-left: 8px !important;
    padding-right: 8px !important;
  }
}

/* Improve ID preview dialog image */
.v-img {
  cursor: pointer;
}

/* Better button focus states for accessibility */
.v-btn:focus-visible {
  outline: 2px solid #1976d2;
  outline-offset: 2px;
}

/* Improve badge visibility on mobile */
.v-badge__badge {
  min-width: 20px !important;
  height: 20px !important;
  font-size: 0.7rem !important;
}

/* Tab improvements for mobile */
.v-tab {
  letter-spacing: normal !important;
  font-weight: 600 !important;
}

/* Remove ripple effects on cards for better performance on mobile */
.stat-card :deep(.v-card__loader) {
  display: none;
}

/* Ensure proper spacing in tables */
.v-data-table :deep(.v-data-table__td) {
  vertical-align: middle !important;
}

/* Make sure buttons in tables are properly aligned */
.v-data-table :deep(.v-data-table__td .v-btn) {
  vertical-align: middle;
}
</style>