<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/utils/supabase'
import { useRouter } from 'vue-router'

const router = useRouter()

// Shop states
const pendingShops = ref<any[]>([])
const approvedShops = ref<any[]>([])
const revokedShops = ref<any[]>([])
const shopActiveTab = ref('pending')
const riderActiveTab = ref('pending')

// Rider states
const pendingRiders = ref<any[]>([])
const approvedRiders = ref<any[]>([])
const rejectedRiders = ref<any[]>([])

const loadingShops = ref(false)
const loadingRiders = ref(false)
const activeTab = ref('pending-shops')
const errorMessage = ref('')
const isAdmin = ref(false)
const logoutDialog = ref(false)
const idPreviewDialog = ref(false)
const selectedShopForId = ref<any>(null)
const selectedIdType = ref<'front' | 'back' | null>(null)
const adminUser = ref<any>(null)

// Expand/Collapse states
const expandedShops = ref<Set<string>>(new Set())
const expandedRiders = ref<Set<string>>(new Set())

// Store owner profiles
const ownerProfiles = ref<Map<string, any>>(new Map())

// Debug info
const debugInfo = ref('')
const showDebug = ref(true)

// Rider document preview
const riderDocPreviewDialog = ref(false)
const selectedRiderDoc = ref<string | null>(null)
const selectedRiderDocType = ref<string>('')

// Helper function to get full storage URL
const getFullStorageUrl = (path: string, bucket: string = 'rider_info') => {
  if (!path) return null

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
  return publicUrl
}

// Handle image error
const handleImageError = (event: any) => {
  console.error('Image failed to load:', event)
  event.target.src = 'https://placehold.co/400x300?text=Image+Not+Found'
}

// Toggle expand/collapse functions
const toggleShopExpand = (shopId: string) => {
  if (expandedShops.value.has(shopId)) {
    expandedShops.value.delete(shopId)
  } else {
    expandedShops.value.add(shopId)
  }
}

const toggleRiderExpand = (riderId: string) => {
  if (expandedRiders.value.has(riderId)) {
    expandedRiders.value.delete(riderId)
  } else {
    expandedRiders.value.add(riderId)
  }
}

const isShopExpanded = (shopId: string) => expandedShops.value.has(shopId)
const isRiderExpanded = (riderId: string) => expandedRiders.value.has(riderId)

// Fetch owner profile by ID
const fetchOwnerProfile = async (ownerId: string) => {
  if (ownerProfiles.value.has(ownerId)) {
    return ownerProfiles.value.get(ownerId)
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', ownerId)
      .single()

    if (error) throw error

    if (data) {
      ownerProfiles.value.set(ownerId, data)
    }
    return data
  } catch (err) {
    console.error('Error fetching owner profile:', err)
    return null
  }
}

// Get owner name from profile
const getOwnerName = (shop: any) => {
  const profile = ownerProfiles.value.get(shop.owner_id)
  if (profile) {
    return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || shop.owner_id
  }
  return shop.owner_id
}

// Get owner email
const getOwnerEmail = (shop: any) => {
  const profile = ownerProfiles.value.get(shop.owner_id)
  return profile?.email || 'Not available'
}

// Get owner phone
const getOwnerPhone = (shop: any) => {
  const profile = ownerProfiles.value.get(shop.owner_id)
  return profile?.phone || 'Not available'
}

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
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Error fetching profile:', profileError)

        if (profileError.code === 'PGRST116') {
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([
              {
                id: user.id,
                email: user.email,
                role: 'user',
                created_at: new Date().toISOString(),
              },
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

// Debug function to check table data
const checkTableData = async () => {
  console.log('=== CHECKING TABLE DATA ===')

  const { data: shopsData, count: shopsCount } = await supabase
    .from('shops')
    .select('*', { count: 'exact' })

  const { data: ridersData, count: ridersCount } = await supabase
    .from('Rider_Registration')
    .select('*', { count: 'exact' })

  let debugMsg = ''
  if (!shopsCount || shopsCount === 0) {
    debugMsg += '⚠️ No shops found in database! Create a shop first.\n'
  } else {
    debugMsg += `✅ Found ${shopsCount} shops in database.\n`
  }

  if (!ridersCount || ridersCount === 0) {
    debugMsg += '⚠️ No rider registrations found in database! Submit a rider application first.\n'
  } else {
    debugMsg += `✅ Found ${ridersCount} rider registrations in database.\n`
  }

  debugInfo.value = debugMsg
}

// Fetch shops based on status with owner profiles
const fetchShopsByStatus = async (status: string) => {
  try {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (error) throw error
    
    // Log the IDs to verify format
    if (data && data.length > 0) {
      console.log(`First ${status} shop ID:`, data[0].id)
      console.log(`ID type:`, typeof data[0].id)
    }
    
    // Fetch owner profiles for each shop
    if (data && data.length > 0) {
      for (const shop of data) {
        await fetchOwnerProfile(shop.owner_id)
      }
    }
    
    return data || []
  } catch (err: any) {
    console.error(`Error fetching ${status} shops:`, err)
    throw err
  }
}

// Fetch riders based on status
const fetchRidersByStatus = async (status: string) => {
  try {
    const { data, error } = await supabase
      .from('Rider_Registration')
      .select(
        `
        *,
        profiles:profile_id (
          id,
          email,
          first_name,
          last_name,
          phone,
          avatar_url
        )
      `,
      )
      .eq('status', status)
      .order('application_date', { ascending: false })

    if (error) throw error
    return data || []
  } catch (err: any) {
    console.error(`Error fetching ${status} riders:`, err)
    throw err
  }
}

const fetchShops = async () => {
  if (!isAdmin.value) return

  loadingShops.value = true
  errorMessage.value = ''

  try {
    const [pendingData, approvedData, revokedData] = await Promise.all([
      fetchShopsByStatus('pending'),
      fetchShopsByStatus('approved'),
      fetchShopsByStatus('declined'),
    ])

    pendingShops.value = pendingData
    approvedShops.value = approvedData
    revokedShops.value = revokedData

    if (pendingData.length === 0 && approvedData.length === 0 && revokedData.length === 0) {
      debugInfo.value += '\n📝 No shops found. Please register a shop first.'
    }
  } catch (err: any) {
    console.error('Error fetching shops:', err)
    errorMessage.value = `Failed to fetch shops: ${err.message}`
  } finally {
    loadingShops.value = false
  }
}

const fetchRiders = async () => {
  if (!isAdmin.value) return

  loadingRiders.value = true
  errorMessage.value = ''

  try {
    const [pendingData, approvedData, rejectedData] = await Promise.all([
      fetchRidersByStatus('pending'),
      fetchRidersByStatus('approved'),
      fetchRidersByStatus('rejected'),
    ])

    pendingRiders.value = pendingData
    approvedRiders.value = approvedData
    rejectedRiders.value = rejectedData

    if (pendingData.length === 0 && approvedData.length === 0 && rejectedData.length === 0) {
      debugInfo.value += '\n📝 No rider applications found. Please submit a rider application first.'
    }
  } catch (err: any) {
    console.error('Error fetching riders:', err)
    errorMessage.value = `Failed to fetch riders: ${err.message}`
  } finally {
    loadingRiders.value = false
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
      canApprove: false,
    }
  } else if (!hasFrontId) {
    return {
      status: 'incomplete',
      color: 'orange',
      text: 'Front ID Missing',
      icon: 'mdi-alert',
      description: 'Front ID is required',
      canApprove: false,
    }
  } else if (!hasBackId) {
    return {
      status: 'incomplete',
      color: 'orange',
      text: 'Back ID Missing',
      icon: 'mdi-alert',
      description: 'Back ID is required',
      canApprove: false,
    }
  } else {
    return {
      status: 'complete',
      color: 'green',
      text: 'IDs Complete',
      icon: 'mdi-check-circle',
      description: 'Both IDs are uploaded',
      canApprove: true,
    }
  }
}

// Check document status for rider
const getDocumentStatus = (rider: any) => {
  const documents = {
    validId: !!rider.valid_id_url,
    driversLicense: !!rider.drivers_license_url,
    orCr: !!rider.or_cr_url,
  }

  const missingDocs = []
  if (!documents.validId) missingDocs.push('Valid ID')
  if (!documents.driversLicense) missingDocs.push("Driver's License")
  if (!documents.orCr) missingDocs.push('OR/CR')

  if (missingDocs.length === 0) {
    return {
      status: 'complete',
      color: 'green',
      text: 'All Documents Uploaded',
      icon: 'mdi-check-circle',
      description: 'All required documents are present',
      canApprove: true,
    }
  } else {
    return {
      status: 'incomplete',
      color: 'orange',
      text: `${missingDocs.length} Document${missingDocs.length > 1 ? 's' : ''} Missing`,
      icon: 'mdi-alert',
      description: `Missing: ${missingDocs.join(', ')}`,
      canApprove: true,
    }
  }
}

// Preview shop ID images
const previewId = (shop: any, type: 'front' | 'back') => {
  const imageUrl = type === 'front' ? shop.valid_id_front : shop.valid_id_back

  if (!imageUrl) {
    alert(`No ${type} ID uploaded for this shop.`)
    return
  }

  selectedShopForId.value = shop
  selectedIdType.value = type
  idPreviewDialog.value = true
}

// Preview rider document
const previewRiderDocument = (url: string, docType: string) => {
  if (!url) {
    alert(`No ${docType} document uploaded.`)
    return
  }

  const fullUrl = getFullStorageUrl(url, 'rider_info')

  if (!fullUrl) {
    alert(`Could not load ${docType} document.`)
    return
  }

  console.log('Previewing document:', { docType, originalUrl: url, fullUrl })
  selectedRiderDoc.value = fullUrl
  selectedRiderDocType.value = docType
  riderDocPreviewDialog.value = true
}

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

    console.log('Updating shop ID:', id, 'to status:', status)

    // Perform update WITHOUT .select() - just update
    const { error } = await supabase
      .from('shops')
      .update({
        status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      console.error('Supabase update error:', error)
      throw error
    }

    console.log('Update successful, refreshing data...')
    
    // Force refresh all shops from database
    await fetchShops()
    
    // Verify the update by checking the shop directly
    const { data: verifiedShop } = await supabase
      .from('shops')
      .select('id, status')
      .eq('id', id)
      .single()
    
    console.log('Verified shop status after update:', verifiedShop)

    alert(`Shop ${status} successfully!`)
  } catch (err: any) {
    console.error('Update error:', err)
    errorMessage.value = `Failed to update shop: ${err.message}`
    alert(`Failed to update shop: ${err.message}`)
  }
}

// Update rider status
const updateRiderStatus = async (id: string, status: 'approved' | 'rejected') => {
  if (!isAdmin.value) {
    errorMessage.value = 'Admin privileges required.'
    return
  }

  if (!confirm(`Are you sure you want to ${status === 'approved' ? 'approve' : 'reject'} this rider application?`)) {
    return
  }

  try {
    errorMessage.value = ''

    console.log('Updating rider ID:', id, 'to status:', status)

    // Remove .select() - just update
    const { error } = await supabase
      .from('Rider_Registration')
      .update({
        status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('rider_id', id)

    if (error) {
      console.error('Supabase error:', error)
      throw error
    }

    console.log('Rider update successful, refreshing...')
    await fetchRiders()

    alert(`Rider application ${status} successfully!`)
  } catch (err: any) {
    console.error('Update error:', err)
    errorMessage.value = `Failed to update rider: ${err.message}`
    alert(`Failed to update rider: ${err.message}`)
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

    console.log('Revoking approval for shop:', id)

    // Remove .select() - just update
    const { error } = await supabase
      .from('shops')
      .update({
        status: 'declined',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) throw error

    console.log('Revoke successful, refreshing...')
    await fetchShops()

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

    console.log('Restoring shop:', id)

    // Remove .select() - just update
    const { error } = await supabase
      .from('shops')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) throw error

    console.log('Restore successful, refreshing...')
    await fetchShops()

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

// Computed properties
const pendingShopsCount = computed(() => pendingShops.value.length)
const approvedShopsCount = computed(() => approvedShops.value.length)
const revokedShopsCount = computed(() => revokedShops.value.length)
const pendingRidersCount = computed(() => pendingRiders.value.length)
const approvedRidersCount = computed(() => approvedRiders.value.length)
const rejectedRidersCount = computed(() => rejectedRiders.value.length)

const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const formatDateTime = (dateString: string) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getFullAddress = (shop: any) => {
  const parts = []
  if (shop.building) parts.push(shop.building)
  if (shop.street) parts.push(shop.street)
  if (shop.barangay) parts.push(shop.barangay)
  if (shop.city) parts.push(shop.city)
  if (shop.province) parts.push(shop.province)

  if (parts.length > 0) {
    return parts.join(', ')
  }
  return shop.detected_address || 'No address provided'
}

const getRiderFullName = (rider: any) => {
  if (rider.profiles) {
    return `${rider.profiles.first_name || ''} ${rider.profiles.last_name || ''}`.trim()
  }
  return `${rider.first_name || ''} ${rider.last_name || ''}`.trim()
}

onMounted(async () => {
  await checkAdminStatus()
  if (isAdmin.value) {
    await checkTableData()
    await Promise.all([fetchShops(), fetchRiders()])
  }
})

// Real-time subscriptions
onMounted(() => {
  if (isAdmin.value) {
    const shopChannel = supabase
      .channel('shops-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shops',
        },
        async () => {
          await fetchShops()
        },
      )
      .subscribe()

    const riderChannel = supabase
      .channel('rider-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'Rider_Registration',
        },
        async () => {
          await fetchRiders()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(shopChannel)
      supabase.removeChannel(riderChannel)
    }
  }
})
</script>

<template>
  <v-container fluid class="admin-dashboard-container pa-0 ma-0">
    <!-- Header Section -->
    <v-card flat class="mb-4 admin-header" rounded="xl">
      <v-card-text class="admin-header-content">
        <div class="admin-header-row">
          <div class="admin-header-main">
            <v-icon color="white" size="32" class="admin-header-icon">mdi-shield-account</v-icon>
            <div class="admin-header-copy">
              <h1 class="admin-title text-h5 text-md-h4 font-weight-bold text-white">Admin Dashboard</h1>
              <div v-if="adminUser" class="admin-subtitle text-caption text-white text-opacity-90">
                Welcome, {{ adminUser.first_name || adminUser.email }}
              </div>
            </div>
          </div>
          <div class="admin-header-actions">
            <v-chip v-if="isAdmin" color="white" size="large" class="text-primary admin-role-chip d-none d-sm-flex">
              <v-icon start size="20">mdi-shield-account</v-icon>
              Administrator
            </v-chip>
            <v-btn
              color="white"
              variant="outlined"
              @click="openLogoutDialog"
              class="logout-btn touch-target"
              size="small"
            >
              <v-icon start size="20">mdi-logout</v-icon>
              <span class="d-none d-sm-inline">Logout</span>
            </v-btn>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- Debug Info Card -->
    <v-card v-if="showDebug && debugInfo" class="mx-2 mb-4 admin-status-card" color="info" variant="tonal">
      <v-card-text class="pa-3">
        <div class="d-flex align-center justify-space-between">
          <div>
            <v-icon start size="20">mdi-information</v-icon>
            <span class="font-weight-bold">Database Status:</span>
            <pre class="debug-text mt-1 mb-0">{{ debugInfo }}</pre>
          </div>
          <v-btn icon size="small" @click="showDebug = false">
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Error Message -->
    <v-alert
      v-if="errorMessage"
      type="error"
      class="mb-4 mx-2 admin-error-alert"
      variant="tonal"
      dismissible
      @click:close="errorMessage = ''"
    >
      {{ errorMessage }}
    </v-alert>

    <!-- Access Denied State -->
    <div v-if="!isAdmin && adminUser" class="admin-empty-state text-center py-16 px-3">
      <v-icon color="warning" size="72" class="mb-4">mdi-shield-account-outline</v-icon>
      <h2 class="text-h5 font-weight-bold mb-4">Access Denied</h2>
      <p class="text-body-1 text-medium-emphasis mb-6">
        Admin privileges required to access this page.
      </p>
      <v-btn color="primary" size="large" rounded="lg" to="/" block>
        <v-icon start>mdi-home</v-icon>
        Return to Home
      </v-btn>
    </div>

    <!-- Admin Content -->
    <div v-else-if="isAdmin" class="admin-dashboard-body">
      <!-- Main Tabs for Shops and Riders -->
      <v-tabs v-model="activeTab" color="primary" grow show-arrows class="mx-2 admin-main-tabs">
        <v-tab value="pending-shops">
          <v-icon start>mdi-store</v-icon>
          Shops
          <v-badge
            v-if="pendingShopsCount > 0"
            color="orange"
            :content="pendingShopsCount"
            inline
            class="ml-2"
          />
        </v-tab>
        <v-tab value="pending-riders">
          <v-icon start>mdi-motorbike</v-icon>
          Riders
          <v-badge
            v-if="pendingRidersCount > 0"
            color="orange"
            :content="pendingRidersCount"
            inline
            class="ml-2"
          />
        </v-tab>
      </v-tabs>

      <v-window v-model="activeTab" class="mt-4 admin-window">
        <!-- SHOPS MANAGEMENT SECTION -->
        <v-window-item value="pending-shops">
          <v-card class="mx-2 admin-section-card" rounded="xl" elevation="1">
            <v-card-text class="pa-0">
              <!-- Shop Status Tabs -->
              <v-tabs v-model="shopActiveTab" color="primary" grow show-arrows class="admin-sub-tabs">
                <v-tab value="pending">
                  Pending
                  <v-badge
                    v-if="pendingShopsCount > 0"
                    color="orange"
                    :content="pendingShopsCount"
                    inline
                    class="ml-2"
                  />
                </v-tab>
                <v-tab value="approved">
                  Approved
                  <v-badge
                    v-if="approvedShopsCount > 0"
                    color="green"
                    :content="approvedShopsCount"
                    inline
                    class="ml-2"
                  />
                </v-tab>
                <v-tab value="revoked">
                  Revoked
                  <v-badge
                    v-if="revokedShopsCount > 0"
                    color="red"
                    :content="revokedShopsCount"
                    inline
                    class="ml-2"
                  />
                </v-tab>
              </v-tabs>

              <v-window v-model="shopActiveTab">
                <!-- Pending Shops -->
                <v-window-item value="pending">
                  <div class="pa-3 pa-sm-4">
                    <v-progress-circular
                      v-if="loadingShops"
                      indeterminate
                      color="primary"
                      size="48"
                      class="d-flex mx-auto my-12"
                    />
                    <div v-else-if="pendingShops.length === 0" class="text-center py-8">
                      <v-icon size="64" color="grey-lighten-1">mdi-store-off</v-icon>
                      <p class="mt-2">No pending shop registrations</p>
                      <v-btn color="primary" variant="text" @click="fetchShops" class="mt-2">
                        Refresh
                      </v-btn>
                    </div>
                    <div v-else>
                      <!-- Expandable Shop Cards -->
                      <v-card
                        v-for="shop in pendingShops"
                        :key="shop.id"
                        class="mb-4 expandable-card"
                        :class="{ expanded: isShopExpanded(shop.id) }"
                        rounded="lg"
                      >
                        <!-- Card Header - Always visible -->
                        <v-card-text class="pa-4" @click="toggleShopExpand(shop.id)" style="cursor: pointer">
                          <div class="d-flex justify-space-between align-center">
                            <div class="d-flex align-center gap-3">
                              <v-icon :color="isShopExpanded(shop.id) ? 'primary' : 'grey'" size="28">
                                {{ isShopExpanded(shop.id) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                              </v-icon>
                              <div>
                                <div class="text-h6 font-weight-bold text-primary">
                                  {{ shop.business_name }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  Owner: {{ getOwnerName(shop) }} • Applied: {{ formatDateTime(shop.created_at) }}
                                </div>
                              </div>
                            </div>
                            <v-chip :color="getIdStatus(shop).color" size="small">
                              <v-icon start size="16">{{ getIdStatus(shop).icon }}</v-icon>
                              {{ getIdStatus(shop).text }}
                            </v-chip>
                          </div>
                        </v-card-text>

                        <!-- Expandable Content -->
                        <v-expand-transition>
                          <div v-show="isShopExpanded(shop.id)">
                            <v-divider></v-divider>
                            <v-card-text class="pa-4">
                              <v-row>
                                <v-col cols="12" md="6">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Business Information</h4>
                                    <div class="detail-row">
                                      <span class="detail-label">Business Name:</span>
                                      <span class="detail-value">{{ shop.business_name }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Owner Name:</span>
                                      <span class="detail-value">{{ getOwnerName(shop) }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Owner Email:</span>
                                      <span class="detail-value">{{ getOwnerEmail(shop) }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Owner Phone:</span>
                                      <span class="detail-value">{{ getOwnerPhone(shop) }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Owner ID:</span>
                                      <span class="detail-value"><small>{{ shop.owner_id }}</small></span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Description:</span>
                                      <span class="detail-value">{{ shop.description || 'No description' }}</span>
                                    </div>
                                  </div>
                                </v-col>

                                <v-col cols="12" md="6">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Address Information</h4>
                                    <div class="detail-row">
                                      <span class="detail-label">Building/House:</span>
                                      <span class="detail-value">{{ shop.building || 'N/A' }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Street:</span>
                                      <span class="detail-value">{{ shop.street || 'N/A' }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Barangay:</span>
                                      <span class="detail-value">{{ shop.barangay || 'N/A' }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">City:</span>
                                      <span class="detail-value">{{ shop.city || 'N/A' }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Province:</span>
                                      <span class="detail-value">{{ shop.province || 'N/A' }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Full Address:</span>
                                      <span class="detail-value">{{ getFullAddress(shop) }}</span>
                                    </div>
                                  </div>
                                </v-col>

                                <v-col cols="12">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Business Hours</h4>
                                    <div class="detail-row">
                                      <span class="detail-label">Open Time:</span>
                                      <span class="detail-value">{{ shop.open_time || 'Not set' }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Close Time:</span>
                                      <span class="detail-value">{{ shop.close_time || 'Not set' }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Open Days:</span>
                                      <span class="detail-value">{{ shop.open_days ? shop.open_days.join(', ') : 'Mon-Sat' }}</span>
                                    </div>
                                  </div>
                                </v-col>

                                <v-col cols="12">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Valid ID Documents</h4>
                                    <div class="d-flex flex-wrap gap-3 mt-2">
                                      <v-btn
                                        v-if="shop.valid_id_front"
                                        color="primary"
                                        variant="outlined"
                                        @click="previewId(shop, 'front')"
                                      >
                                        <v-icon start>mdi-card-account-details</v-icon>
                                        View Front ID
                                      </v-btn>
                                      <v-btn
                                        v-if="shop.valid_id_back"
                                        color="primary"
                                        variant="outlined"
                                        @click="previewId(shop, 'back')"
                                      >
                                        <v-icon start>mdi-card-bulleted</v-icon>
                                        View Back ID
                                      </v-btn>
                                      <v-chip v-if="!shop.valid_id_front" color="error" size="small">
                                        Front ID Missing
                                      </v-chip>
                                      <v-chip v-if="!shop.valid_id_back" color="error" size="small">
                                        Back ID Missing
                                      </v-chip>
                                    </div>
                                  </div>
                                </v-col>
                              </v-row>
                            </v-card-text>
                            <v-divider></v-divider>
                            <v-card-actions class="pa-4">
                              <v-spacer></v-spacer>
                              <v-btn
                                color="error"
                                variant="outlined"
                                @click="updateShopStatus(shop.id, 'declined')"
                              >
                                <v-icon start>mdi-close</v-icon>
                                Decline
                              </v-btn>
                              <v-btn
                                color="success"
                                variant="flat"
                                :disabled="!getIdStatus(shop).canApprove"
                                @click="updateShopStatus(shop.id, 'approved')"
                              >
                                <v-icon start>mdi-check</v-icon>
                                Approve Shop
                              </v-btn>
                            </v-card-actions>
                          </div>
                        </v-expand-transition>
                      </v-card>
                    </div>
                  </div>
                </v-window-item>

                <!-- Approved Shops -->
                <v-window-item value="approved">
                  <div class="pa-3 pa-sm-4">
                    <div v-if="approvedShops.length === 0" class="text-center py-8">
                      <v-icon size="64" color="grey-lighten-1">mdi-store-check</v-icon>
                      <p class="mt-2">No approved shops yet</p>
                    </div>
                    <div v-else>
                      <v-card
                        v-for="shop in approvedShops"
                        :key="shop.id"
                        class="mb-4 expandable-card"
                        rounded="lg"
                      >
                        <v-card-text class="pa-4" @click="toggleShopExpand(shop.id)" style="cursor: pointer">
                          <div class="d-flex justify-space-between align-center">
                            <div class="d-flex align-center gap-3">
                              <v-icon :color="isShopExpanded(shop.id) ? 'primary' : 'grey'" size="28">
                                {{ isShopExpanded(shop.id) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                              </v-icon>
                              <div>
                                <div class="text-h6 font-weight-bold text-primary">
                                  {{ shop.business_name }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  Owner: {{ getOwnerName(shop) }} • Approved: {{ formatDateTime(shop.updated_at) }}
                                </div>
                              </div>
                            </div>
                            <v-chip color="green">
                              <v-icon start size="16">mdi-check-circle</v-icon>
                              Approved
                            </v-chip>
                          </div>
                        </v-card-text>
                        <v-expand-transition>
                          <div v-show="isShopExpanded(shop.id)">
                            <v-divider></v-divider>
                            <v-card-text class="pa-4">
                              <v-row>
                                <v-col cols="12" md="6">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Business Information</h4>
                                    <div class="detail-row">
                                      <span class="detail-label">Business Name:</span>
                                      <span class="detail-value">{{ shop.business_name }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Owner Name:</span>
                                      <span class="detail-value">{{ getOwnerName(shop) }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Owner Email:</span>
                                      <span class="detail-value">{{ getOwnerEmail(shop) }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Description:</span>
                                      <span class="detail-value">{{ shop.description || 'No description' }}</span>
                                    </div>
                                  </div>
                                </v-col>
                                <v-col cols="12" md="6">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Address</h4>
                                    <div class="detail-value">{{ getFullAddress(shop) }}</div>
                                  </div>
                                </v-col>
                              </v-row>
                            </v-card-text>
                            <v-divider></v-divider>
                            <v-card-actions class="pa-4">
                              <v-spacer></v-spacer>
                              <v-btn color="error" variant="outlined" @click="revokeApproval(shop.id)">
                                Revoke Approval
                              </v-btn>
                            </v-card-actions>
                          </div>
                        </v-expand-transition>
                      </v-card>
                    </div>
                  </div>
                </v-window-item>

                <!-- Revoked Shops -->
                <v-window-item value="revoked">
                  <div class="pa-3 pa-sm-4">
                    <div v-if="revokedShops.length === 0" class="text-center py-8">
                      <v-icon size="64" color="grey-lighten-1">mdi-store-remove</v-icon>
                      <p class="mt-2">No revoked shops</p>
                    </div>
                    <div v-else>
                      <v-card
                        v-for="shop in revokedShops"
                        :key="shop.id"
                        class="mb-4 expandable-card"
                        rounded="lg"
                      >
                        <v-card-text class="pa-4" @click="toggleShopExpand(shop.id)" style="cursor: pointer">
                          <div class="d-flex justify-space-between align-center">
                            <div class="d-flex align-center gap-3">
                              <v-icon :color="isShopExpanded(shop.id) ? 'primary' : 'grey'" size="28">
                                {{ isShopExpanded(shop.id) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                              </v-icon>
                              <div>
                                <div class="text-h6 font-weight-bold text-primary">
                                  {{ shop.business_name }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  Owner: {{ getOwnerName(shop) }} • Revoked: {{ formatDateTime(shop.updated_at) }}
                                </div>
                              </div>
                            </div>
                            <v-chip color="red">Revoked</v-chip>
                          </div>
                        </v-card-text>
                        <v-expand-transition>
                          <div v-show="isShopExpanded(shop.id)">
                            <v-divider></v-divider>
                            <v-card-actions class="pa-4">
                              <v-spacer></v-spacer>
                              <v-btn color="success" variant="flat" @click="restoreShop(shop.id)">
                                Restore Shop
                              </v-btn>
                            </v-card-actions>
                          </div>
                        </v-expand-transition>
                      </v-card>
                    </div>
                  </div>
                </v-window-item>
              </v-window>
            </v-card-text>
          </v-card>
        </v-window-item>

        <!-- RIDERS MANAGEMENT SECTION -->
        <v-window-item value="pending-riders">
          <v-card class="mx-2 admin-section-card" rounded="xl" elevation="1">
            <v-card-text class="pa-0">
              <!-- Rider Status Tabs -->
              <v-tabs v-model="riderActiveTab" color="primary" grow show-arrows class="admin-sub-tabs">
                <v-tab value="pending">
                  Pending Applications
                  <v-badge
                    v-if="pendingRidersCount > 0"
                    color="orange"
                    :content="pendingRidersCount"
                    inline
                    class="ml-2"
                  />
                </v-tab>
                <v-tab value="approved">
                  Approved Riders
                  <v-badge
                    v-if="approvedRidersCount > 0"
                    color="green"
                    :content="approvedRidersCount"
                    inline
                    class="ml-2"
                  />
                </v-tab>
                <v-tab value="rejected">
                  Rejected Applications
                  <v-badge
                    v-if="rejectedRidersCount > 0"
                    color="red"
                    :content="rejectedRidersCount"
                    inline
                    class="ml-2"
                  />
                </v-tab>
              </v-tabs>

              <v-window v-model="riderActiveTab">
                <!-- Pending Riders -->
                <v-window-item value="pending">
                  <div class="pa-3 pa-sm-4">
                    <v-progress-circular
                      v-if="loadingRiders"
                      indeterminate
                      color="primary"
                      size="48"
                      class="d-flex mx-auto my-12"
                    />
                    <div v-else-if="pendingRiders.length === 0" class="text-center py-8">
                      <v-icon size="64" color="grey-lighten-1">mdi-motorbike-off</v-icon>
                      <p class="mt-2">No pending rider applications</p>
                      <v-btn color="primary" variant="text" @click="fetchRiders" class="mt-2">
                        Refresh
                      </v-btn>
                    </div>
                    <div v-else>
                      <!-- Expandable Rider Cards -->
                      <v-card
                        v-for="rider in pendingRiders"
                        :key="rider.rider_id"
                        class="mb-4 expandable-card"
                        :class="{ expanded: isRiderExpanded(rider.rider_id.toString()), 'needs-review': getDocumentStatus(rider).status !== 'complete' }"
                        rounded="lg"
                      >
                        <!-- Card Header - Always visible -->
                        <v-card-text class="pa-4" @click="toggleRiderExpand(rider.rider_id.toString())" style="cursor: pointer">
                          <div class="d-flex justify-space-between align-center flex-wrap gap-2">
                            <div class="d-flex align-center gap-3">
                              <v-icon :color="isRiderExpanded(rider.rider_id.toString()) ? 'primary' : 'grey'" size="28">
                                {{ isRiderExpanded(rider.rider_id.toString()) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                              </v-icon>
                              <div>
                                <div class="text-h6 font-weight-bold text-primary">
                                  {{ getRiderFullName(rider) }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  {{ rider.email }} • Applied: {{ formatDateTime(rider.application_date) }}
                                </div>
                              </div>
                            </div>
                            <v-chip :color="getDocumentStatus(rider).color" size="small">
                              <v-icon start size="16">{{ getDocumentStatus(rider).icon }}</v-icon>
                              {{ getDocumentStatus(rider).text }}
                            </v-chip>
                          </div>
                        </v-card-text>

                        <!-- Expandable Content -->
                        <v-expand-transition>
                          <div v-show="isRiderExpanded(rider.rider_id.toString())">
                            <v-divider></v-divider>
                            <v-card-text class="pa-4">
                              <v-row>
                                <v-col cols="12" md="6">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Personal Information</h4>
                                    <div class="detail-row">
                                      <span class="detail-label">Full Name:</span>
                                      <span class="detail-value">{{ getRiderFullName(rider) }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Email:</span>
                                      <span class="detail-value">{{ rider.email }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Phone:</span>
                                      <span class="detail-value">{{ rider.phone || 'Not provided' }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Birthdate:</span>
                                      <span class="detail-value">{{ formatDate(rider.birthdate) }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Gender:</span>
                                      <span class="detail-value">{{ rider.gender || 'Not specified' }}</span>
                                    </div>
                                  </div>
                                </v-col>

                                <v-col cols="12" md="6">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Address</h4>
                                    <div class="detail-row">
                                      <span class="detail-label">Street:</span>
                                      <span class="detail-value">{{ rider.address || 'N/A' }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">City:</span>
                                      <span class="detail-value">{{ rider.city || 'N/A' }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Province:</span>
                                      <span class="detail-value">{{ rider.province || 'N/A' }}</span>
                                    </div>
                                  </div>
                                </v-col>

                                <v-col cols="12">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Vehicle Information</h4>
                                    <v-row>
                                      <v-col cols="12" sm="6">
                                        <div class="detail-row">
                                          <span class="detail-label">Vehicle Type:</span>
                                          <span class="detail-value">{{ rider.vehicle_type || 'N/A' }}</span>
                                        </div>
                                        <div class="detail-row">
                                          <span class="detail-label">Brand:</span>
                                          <span class="detail-value">{{ rider.vehicle_brand || 'N/A' }}</span>
                                        </div>
                                        <div class="detail-row">
                                          <span class="detail-label">Model:</span>
                                          <span class="detail-value">{{ rider.vehicle_model || 'N/A' }}</span>
                                        </div>
                                      </v-col>
                                      <v-col cols="12" sm="6">
                                        <div class="detail-row">
                                          <span class="detail-label">Year:</span>
                                          <span class="detail-value">{{ rider.vehicle_year || 'N/A' }}</span>
                                        </div>
                                        <div class="detail-row">
                                          <span class="detail-label">Color:</span>
                                          <span class="detail-value">{{ rider.vehicle_color || 'N/A' }}</span>
                                        </div>
                                        <div class="detail-row">
                                          <span class="detail-label">Plate Number:</span>
                                          <span class="detail-value">{{ rider.vehicle_plate || 'N/A' }}</span>
                                        </div>
                                        <div class="detail-row">
                                          <span class="detail-label">OR/CR Number:</span>
                                          <span class="detail-value">{{ rider.vehicle_or_cr_number || 'N/A' }}</span>
                                        </div>
                                      </v-col>
                                    </v-row>
                                  </div>
                                </v-col>

                                <v-col cols="12">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Required Documents</h4>
                                    <div class="d-flex flex-wrap gap-3 mt-2">
                                      <v-btn
                                        v-if="rider.valid_id_url"
                                        color="primary"
                                        variant="outlined"
                                        @click="previewRiderDocument(rider.valid_id_url, 'Valid ID')"
                                      >
                                        <v-icon start>mdi-card-account-details</v-icon>
                                        View Valid ID
                                      </v-btn>
                                      <v-btn
                                        v-if="rider.drivers_license_url"
                                        color="primary"
                                        variant="outlined"
                                        @click="previewRiderDocument(rider.drivers_license_url, 'Driver\'s License')"
                                      >
                                        <v-icon start>mdi-card-account-details</v-icon>
                                        View Driver's License
                                      </v-btn>
                                      <v-btn
                                        v-if="rider.or_cr_url"
                                        color="primary"
                                        variant="outlined"
                                        @click="previewRiderDocument(rider.or_cr_url, 'OR/CR')"
                                      >
                                        <v-icon start>mdi-file-document</v-icon>
                                        View OR/CR
                                      </v-btn>
                                      <v-btn
                                        v-if="rider.nbi_clearance_url"
                                        color="primary"
                                        variant="outlined"
                                        @click="previewRiderDocument(rider.nbi_clearance_url, 'NBI Clearance')"
                                      >
                                        <v-icon start>mdi-folder-account</v-icon>
                                        View NBI Clearance
                                      </v-btn>
                                      <v-chip v-if="!rider.valid_id_url" color="error" size="small">
                                        Valid ID Missing
                                      </v-chip>
                                      <v-chip v-if="!rider.drivers_license_url" color="error" size="small">
                                        Driver's License Missing
                                      </v-chip>
                                      <v-chip v-if="!rider.or_cr_url" color="error" size="small">
                                        OR/CR Missing
                                      </v-chip>
                                    </div>
                                  </div>
                                </v-col>
                              </v-row>
                            </v-card-text>
                            <v-divider></v-divider>
                            <v-card-actions class="pa-4">
                              <v-spacer></v-spacer>
                              <v-btn
                                color="error"
                                variant="outlined"
                                @click="updateRiderStatus(rider.rider_id, 'rejected')"
                              >
                                <v-icon start>mdi-close</v-icon>
                                Reject Application
                              </v-btn>
                              <v-btn
                                color="success"
                                variant="flat"
                                @click="updateRiderStatus(rider.rider_id, 'approved')"
                              >
                                <v-icon start>mdi-check</v-icon>
                                Approve Application
                              </v-btn>
                            </v-card-actions>
                          </div>
                        </v-expand-transition>
                      </v-card>
                    </div>
                  </div>
                </v-window-item>

                <!-- Approved Riders -->
                <v-window-item value="approved">
                  <div class="pa-3 pa-sm-4">
                    <div v-if="approvedRiders.length === 0" class="text-center py-8">
                      <v-icon size="64" color="grey-lighten-1">mdi-motorbike</v-icon>
                      <p class="mt-2">No approved riders yet</p>
                    </div>
                    <div v-else>
                      <v-card
                        v-for="rider in approvedRiders"
                        :key="rider.rider_id"
                        class="mb-4 expandable-card"
                        rounded="lg"
                      >
                        <v-card-text class="pa-4" @click="toggleRiderExpand(rider.rider_id.toString())" style="cursor: pointer">
                          <div class="d-flex justify-space-between align-center">
                            <div class="d-flex align-center gap-3">
                              <v-icon :color="isRiderExpanded(rider.rider_id.toString()) ? 'primary' : 'grey'" size="28">
                                {{ isRiderExpanded(rider.rider_id.toString()) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                              </v-icon>
                              <div>
                                <div class="text-h6 font-weight-bold text-primary">
                                  {{ getRiderFullName(rider) }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  {{ rider.email }} • Approved: {{ formatDateTime(rider.updated_at) }}
                                </div>
                              </div>
                            </div>
                            <v-chip color="green">
                              <v-icon start size="16">mdi-check-circle</v-icon>
                              Approved
                            </v-chip>
                          </div>
                        </v-card-text>
                        <v-expand-transition>
                          <div v-show="isRiderExpanded(rider.rider_id.toString())">
                            <v-divider></v-divider>
                            <v-card-text class="pa-4">
                              <v-row>
                                <v-col cols="12" md="6">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Personal Information</h4>
                                    <div class="detail-row">
                                      <span class="detail-label">Full Name:</span>
                                      <span class="detail-value">{{ getRiderFullName(rider) }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Email:</span>
                                      <span class="detail-value">{{ rider.email }}</span>
                                    </div>
                                    <div class="detail-row">
                                      <span class="detail-label">Phone:</span>
                                      <span class="detail-value">{{ rider.phone || 'Not provided' }}</span>
                                    </div>
                                  </div>
                                </v-col>
                                <v-col cols="12" md="6">
                                  <div class="detail-section">
                                    <h4 class="detail-title">Vehicle</h4>
                                    <div class="detail-value">{{ rider.vehicle_brand }} {{ rider.vehicle_model }} ({{ rider.vehicle_year }})</div>
                                    <div class="text-caption">Plate: {{ rider.vehicle_plate }}</div>
                                  </div>
                                </v-col>
                              </v-row>
                            </v-card-text>
                          </div>
                        </v-expand-transition>
                      </v-card>
                    </div>
                  </div>
                </v-window-item>

                <!-- Rejected Riders -->
                <v-window-item value="rejected">
                  <div class="pa-3 pa-sm-4">
                    <div v-if="rejectedRiders.length === 0" class="text-center py-8">
                      <v-icon size="64" color="grey-lighten-1">mdi-cancel</v-icon>
                      <p class="mt-2">No rejected applications</p>
                    </div>
                    <div v-else>
                      <v-card
                        v-for="rider in rejectedRiders"
                        :key="rider.rider_id"
                        class="mb-4 expandable-card"
                        rounded="lg"
                      >
                        <v-card-text class="pa-4" @click="toggleRiderExpand(rider.rider_id.toString())" style="cursor: pointer">
                          <div class="d-flex justify-space-between align-center">
                            <div class="d-flex align-center gap-3">
                              <v-icon :color="isRiderExpanded(rider.rider_id.toString()) ? 'primary' : 'grey'" size="28">
                                {{ isRiderExpanded(rider.rider_id.toString()) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                              </v-icon>
                              <div>
                                <div class="text-h6 font-weight-bold text-primary">
                                  {{ getRiderFullName(rider) }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                  {{ rider.email }} • Rejected: {{ formatDateTime(rider.updated_at) }}
                                </div>
                              </div>
                            </div>
                            <v-chip color="red">Rejected</v-chip>
                          </div>
                        </v-card-text>
                      </v-card>
                    </div>
                  </div>
                </v-window-item>
              </v-window>
            </v-card-text>
          </v-card>
        </v-window-item>
      </v-window>
    </div>

    <!-- ID Preview Dialog -->
    <v-dialog v-model="idPreviewDialog" max-width="800" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center pa-4">
          <v-icon color="primary" class="mr-2">mdi-card-account-details</v-icon>
          Valid ID - {{ selectedIdType === 'front' ? 'Front' : 'Back' }}
          <v-spacer></v-spacer>
          <v-btn icon @click="idPreviewDialog = false" size="small">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text class="text-center pa-3 pa-sm-6">
          <div v-if="selectedShopForId">
            <v-img
              :src="selectedIdType === 'front' ? getFullStorageUrl(selectedShopForId.valid_id_front, 'shop_documents') : getFullStorageUrl(selectedShopForId.valid_id_back, 'shop_documents')"
              max-height="500"
              contain
              class="rounded-lg elevation-2"
              @error="handleImageError"
            >
              <template #placeholder>
                <v-row class="fill-height ma-0" align="center" justify="center">
                  <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </v-row>
              </template>
            </v-img>
          </div>
        </v-card-text>
        <v-card-actions class="justify-center pa-4">
          <v-btn variant="flat" color="primary" @click="idPreviewDialog = false" block>
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Document Preview Dialog -->
    <v-dialog v-model="riderDocPreviewDialog" max-width="800" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center pa-4">
          <v-icon color="primary" class="mr-2">mdi-file-document</v-icon>
          {{ selectedRiderDocType }}
          <v-spacer></v-spacer>
          <v-btn icon @click="riderDocPreviewDialog = false" size="small">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text class="text-center pa-3 pa-sm-6">
          <div v-if="selectedRiderDoc">
            <v-img
              :src="selectedRiderDoc"
              max-height="500"
              contain
              class="rounded-lg elevation-2"
              @error="handleImageError"
            >
              <template #placeholder>
                <v-row class="fill-height ma-0" align="center" justify="center">
                  <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </v-row>
              </template>
            </v-img>
          </div>
        </v-card-text>
        <v-card-actions class="justify-center pa-4">
          <v-btn variant="flat" color="primary" @click="riderDocPreviewDialog = false" block>
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Logout Dialog -->
    <v-dialog v-model="logoutDialog" max-width="400" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center pa-4">
          <v-icon color="primary" class="mr-2">mdi-logout</v-icon>
          Confirm Logout
          <v-spacer></v-spacer>
          <v-btn icon @click="logoutDialog = false" size="small">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text class="pa-4">
          <p>Are you sure you want to logout from the admin dashboard?</p>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-row>
            <v-col cols="6" class="pr-1">
              <v-btn variant="outlined" @click="logoutDialog = false" block>Cancel</v-btn>
            </v-col>
            <v-col cols="6" class="pl-1">
              <v-btn color="error" variant="flat" @click="handleLogout" block>Logout</v-btn>
            </v-col>
          </v-row>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.admin-dashboard-container {
  max-width: 100vw;
  overflow-x: hidden;
  min-height: 100vh;
  position: relative;
  padding:
    0
    max(12px, env(safe-area-inset-right, 0px))
    calc(28px + env(safe-area-inset-bottom, 0px))
    max(12px, env(safe-area-inset-left, 0px)) !important;
  background:
    radial-gradient(circle at top, rgba(102, 126, 234, 0.14), transparent 32%),
    linear-gradient(180deg, #f4f7fb 0%, #edf3f9 100%);
}

.admin-dashboard-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: calc(env(safe-area-inset-top, 0px) + 28px);
  background: linear-gradient(135deg, #2c5f8c 0%, #5c6fd6 100%);
  z-index: 0;
}

.admin-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 20px 44px rgba(82, 99, 174, 0.22);
  position: relative;
  z-index: 1;
}

.admin-header-content {
  padding:
    calc(clamp(18px, 3vw, 28px) + env(safe-area-inset-top, 0px))
    clamp(18px, 3vw, 28px)
    clamp(18px, 3vw, 28px)
    clamp(18px, 3vw, 28px) !important;
}

.admin-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.admin-header-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  flex: 1 1 320px;
}

.admin-header-icon {
  flex-shrink: 0;
  filter: drop-shadow(0 8px 18px rgba(26, 35, 126, 0.24));
}

.admin-header-copy {
  min-width: 0;
}

.admin-title {
  margin: 0;
  line-height: 1.05;
  letter-spacing: -0.02em;
}

.admin-subtitle {
  margin-top: 6px;
}

.admin-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.admin-role-chip {
  font-weight: 700;
}

.logout-btn {
  min-height: 42px !important;
  border-color: rgba(255, 255, 255, 0.45) !important;
  backdrop-filter: blur(6px);
}

.admin-dashboard-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
  z-index: 1;
}

.admin-status-card,
.admin-error-alert,
.admin-main-tabs,
.admin-section-card,
.admin-empty-state {
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08);
}

.admin-status-card,
.admin-error-alert,
.admin-main-tabs,
.admin-section-card {
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.admin-status-card,
.admin-error-alert,
.admin-section-card {
  border-radius: 24px !important;
  overflow: hidden;
}

.admin-empty-state {
  max-width: 560px;
  margin: 0 auto;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.admin-main-tabs,
.admin-sub-tabs {
  background: rgba(255, 255, 255, 0.92);
}

.admin-main-tabs {
  border-radius: 22px !important;
  overflow: hidden;
}

.admin-window {
  overflow: visible;
}

.admin-section-card {
  background: rgba(255, 255, 255, 0.96);
}

.admin-main-tabs :deep(.v-slide-group__content),
.admin-sub-tabs :deep(.v-slide-group__content) {
  gap: 6px;
  padding: 8px;
}

.admin-main-tabs :deep(.v-tab),
.admin-sub-tabs :deep(.v-tab) {
  min-height: 48px;
  border-radius: 16px;
  text-transform: none;
  font-weight: 700;
}

.admin-main-tabs :deep(.v-tab__slider),
.admin-sub-tabs :deep(.v-tab__slider) {
  display: none;
}

.admin-main-tabs :deep(.v-tab--selected),
.admin-sub-tabs :deep(.v-tab--selected) {
  background: rgba(102, 126, 234, 0.12);
}

.touch-target {
  min-height: 44px !important;
}

.needs-review {
  border-left: 4px solid #ff9800 !important;
  background-color: rgba(255, 152, 0, 0.05) !important;
}

.expandable-card {
  transition: all 0.3s ease;
  border: 1px solid rgba(224, 224, 224, 0.92);
  border-radius: 22px !important;
  background: rgba(255, 255, 255, 0.98);
}

.expandable-card:hover {
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.1);
  transform: translateY(-1px);
}

.expandable-card.expanded {
  border-color: #667eea;
  box-shadow: 0 12px 26px rgba(102, 126, 234, 0.16);
}

.detail-section {
  margin-bottom: 20px;
  padding: 16px 18px;
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.detail-title {
  font-size: 1rem;
  font-weight: 600;
  color: #667eea;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #e0e0e0;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
  font-size: 0.9rem;
  gap: 12px;
}

.detail-label {
  width: 140px;
  flex-shrink: 0;
  font-weight: 500;
  color: #666;
}

.detail-value {
  flex: 1;
  color: #333;
  min-width: 0;
  word-break: break-word;
}

.gap-2 {
  gap: 8px;
}

.gap-3 {
  gap: 12px;
}

.debug-text {
  font-size: 12px;
  white-space: pre-wrap;
  font-family: monospace;
}

@media (max-width: 600px) {
  .admin-dashboard-container {
    padding:
      0
      max(10px, env(safe-area-inset-right, 0px))
      calc(22px + env(safe-area-inset-bottom, 0px))
      max(10px, env(safe-area-inset-left, 0px)) !important;
  }

  .admin-header-content {
    padding:
      calc(16px + env(safe-area-inset-top, 0px))
      16px
      16px
      16px !important;
  }

  .admin-header-main {
    align-items: flex-start;
    gap: 12px;
  }

  .admin-header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .admin-main-tabs,
  .admin-section-card,
  .admin-status-card,
  .admin-error-alert {
    margin-left: 0 !important;
    margin-right: 0 !important;
  }

  .admin-main-tabs :deep(.v-tab),
  .admin-sub-tabs :deep(.v-tab) {
    min-height: 46px;
    font-size: 0.82rem;
    padding-inline: 10px;
  }

  .logout-btn {
    flex: 1 1 auto;
  }

  .touch-target {
    min-height: 48px !important;
  }

  .detail-row {
    flex-direction: column;
    gap: 4px;
  }

  .detail-label {
    width: 100%;
    margin-bottom: 4px;
  }

  .detail-value {
    margin-bottom: 8px;
  }
}

@media (max-width: 420px) {
  .admin-title {
    font-size: 1.45rem !important;
  }

  .admin-header-icon {
    font-size: 28px !important;
  }

  .admin-header-actions {
    gap: 8px;
  }
}
</style>
