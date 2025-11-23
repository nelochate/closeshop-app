<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const goBack = () => router.back()

// state
const businessAvatar = ref('')
const coverPhoto = ref('')
const businessName = ref('')
const description = ref('')
const timeOpen = ref('')
const timeClose = ref('')
const manualStatus = ref('auto') // 'open', 'closed', 'auto'
const address = ref('')
const loading = ref(false) // Add loading state

// transactions
const transactionFilter = ref('Orders')
const transactionOptions = ['Orders', 'Completed', 'Cancelled']

// Function to convert 24-hour time to 12-hour format
const convertTo12Hour = (time24: string) => {
  if (!time24 || time24 === 'N/A') return 'N/A'
  
  try {
    // Handle both "HH:MM" and "HH:MM:SS" formats
    const [hours, minutes] = time24.split(':')
    const hour = parseInt(hours)
    const minute = minutes || '00'
    
    if (isNaN(hour)) return time24
    
    const period = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12 // Convert 0 to 12 for 12 AM
    
    return `${hour12}:${minute} ${period}`
  } catch (error) {
    console.error('Error converting time:', error)
    return time24 // Return original if conversion fails
  }
}

// fetch shop data
const fetchShopData = async () => {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) throw new Error('User not logged in')

    // Add manual_status to the select query
    const { data, error } = await supabase
      .from('shops')
      .select(
        'business_name, description, logo_url, physical_store, open_time, close_time, barangay, building, street, house_no, postal, manual_status, open_days',
      )
      .eq('owner_id', user.id)
      .maybeSingle()

    if (error) throw error

    console.log('Shop info:', data)

    // assign values to display
    businessName.value = data?.business_name || 'No name'
    description.value = data?.description || 'No description provided'
    
    // Convert times to 12-hour format
    timeOpen.value = convertTo12Hour(data?.open_time) || 'N/A'
    timeClose.value = convertTo12Hour(data?.close_time) || 'N/A'
    
    businessAvatar.value = data?.logo_url || ''
    coverPhoto.value = data?.physical_store || ''
    manualStatus.value = data?.manual_status || 'auto'

    // build full address string
    address.value = [
      data?.house_no,
      data?.building,
      data?.street,
      data?.barangay,
      'Butuan City',
      'Agusan del Norte',
      'CARAGA',
      data?.postal,
    ]
      .filter(Boolean)
      .join(', ')
  } catch (err) {
    console.error('Error loading shop info:', err.message, err)
  }
}

// Function to toggle between manual open/closed and auto mode
const toggleShopStatus = async () => {
  try {
    loading.value = true

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not logged in')

    let newStatus: 'open' | 'closed' | 'auto'

    // Determine next status based on current status
    if (manualStatus.value === 'auto') {
      newStatus = 'open'
    } else if (manualStatus.value === 'open') {
      newStatus = 'closed'
    } else {
      newStatus = 'auto'
    }

    // Use the database function instead of direct update
    const { data, error } = await supabase.rpc('update_shop_status', {
      p_owner_id: user.id,
      p_manual_status: newStatus
    })

    if (error) {
      console.error('Supabase RPC error:', error)
      throw error
    }

    // Check if update was successful
    if (!data || !data.success) {
      throw new Error('Update failed')
    }

    manualStatus.value = newStatus

    // Show success message
    const statusMessages = {
      open: 'Shop is now manually set to OPEN',
      closed: 'Shop is now manually set to CLOSED',
      auto: 'Shop status is now AUTOMATIC (based on business hours)',
    }
    alert(statusMessages[newStatus])
  } catch (err) {
    console.error('Error updating shop status:', err)
    
    // More specific error messages
    if (err.message?.includes('permission denied')) {
      alert('Permission denied. Please make sure you are the owner of this shop.')
    } else if (err.message?.includes('Shop not found')) {
      alert('Shop not found. Please try refreshing the page.')
    } else {
      alert('Failed to update shop status: ' + err.message)
    }
  } finally {
    loading.value = false
  }
}

// Add this function to debug your current setup
const debugShopAccess = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    console.log('Current user:', user)

    if (user) {
      // Test SELECT access
      const { data: shopData, error: selectError } = await supabase
        .from('shops')
        .select('id, business_name, manual_status')
        .eq('owner_id', user.id)
        .maybeSingle()

      console.log('Shop data (SELECT):', shopData)
      console.log('SELECT error:', selectError)

      // Test if RPC calls work
      const { data: rpcTest, error: rpcError } = await supabase.rpc('update_shop_status', {
        p_owner_id: user.id,
        p_manual_status: 'auto'
      })
      
      console.log('RPC test:', rpcTest)
      console.log('RPC error:', rpcError)
    }
  } catch (err) {
    console.error('Debug error:', err)
  }
}

// Call this in onMounted to check permissions
onMounted(() => {
  fetchShopData()
  // debugShopAccess() // Uncomment to debug
})

// Helper to get current status display
const getCurrentStatusDisplay = () => {
  if (manualStatus.value === 'open') return { 
    text: 'Manually Open', 
    color: 'green',
    icon: 'mdi-store-check',
    buttonText: 'Switch to Closed',
    buttonColor: 'red'
  }
  if (manualStatus.value === 'closed') return { 
    text: 'Manually Closed', 
    color: 'red',
    icon: 'mdi-store-remove', 
    buttonText: 'Switch to Auto Mode',
    buttonColor: 'blue'
  }
  return { 
    text: 'Auto (Based on Hours)', 
    color: 'blue',
    icon: 'mdi-clock',
    buttonText: 'Switch to Open',
    buttonColor: 'green'
  }
}

// Check if shop is currently open based on hours (for display purposes)
const isShopCurrentlyOpen = () => {
  // This is a simplified version - you can expand this with your actual hours logic
  if (manualStatus.value === 'open') return true
  if (manualStatus.value === 'closed') return false
  
  // Auto mode - you can add your business hours logic here
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  
  // Simple example: assume open during daytime if no specific hours
  return currentHour >= 8 && currentHour < 20
}

// Enhanced delete shop function with confirmation
const deleteShop = async () => {
  if (!confirm('Are you sure you want to delete your shop? This action cannot be undone.')) {
    return
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not found')

    const { error } = await supabase.from('shops')
      .delete()
      .eq('owner_id', user.id)

    if (error) throw error

    // Clean up images if they exist
    if (businessAvatar.value) {
      try {
        const oldPath = businessAvatar.value.split('/storage/v1/object/public/Profile/')[1]
        if (oldPath) {
          await supabase.storage.from('Profile').remove([oldPath])
        }
      } catch (storageError) {
        console.warn('Could not delete avatar image:', storageError)
      }
    }

    // Reset all state
    businessAvatar.value = ''
    coverPhoto.value = ''
    businessName.value = ''
    description.value = ''
    timeOpen.value = ''
    timeClose.value = ''
    address.value = ''
    manualStatus.value = 'auto'

    alert('Shop deleted successfully')
    
    // Redirect to home page
    router.push('/')
  } catch (err) {
    console.error('Delete shop error:', err)
    alert('Failed to delete shop: ' + err.message)
  }
}
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6">Business Profile</v-toolbar-title>

      <!-- Dropdown menu -->
      <v-menu>
        <template #activator="{ props }">
          <v-btn icon v-bind="props">
            <v-icon>mdi-menu</v-icon>
          </v-btn>
        </template>

        <v-list>
          <v-list-item to="/edit-shop">
            <v-list-item-title>
              <v-icon start small>mdi-pencil</v-icon>
              Edit Shop
            </v-list-item-title>
          </v-list-item>

          <v-list-item @click="deleteShop">
            <v-list-item-title>
              <v-icon start small>mdi-delete</v-icon>
              Delete Shop
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <v-main>
      <!-- Cover + Logo -->
      <v-container class="pa-0">
        <!-- Cover Photo -->
        <v-img v-if="coverPhoto" :src="coverPhoto" height="180" cover class="cover-photo" />
        <div v-else class="cover-placeholder"></div>

        <!-- Avatar overlapping cover -->
        <div class="avatar-wrapper">
          <v-avatar size="96" class="avatar-border">
            <v-img v-if="businessAvatar" :src="businessAvatar" cover />
            <v-icon v-else size="48">mdi-store</v-icon>
          </v-avatar>
        </div>
      </v-container>

      <!-- Business Info Section -->
      <v-container class="py-6">
        <v-sheet rounded="xl" elevation="4" class="pa-6 text-center">
          <h2 class="text-h6 mt-4">{{ businessName }}</h2>
          <p class="text-body-2 text-medium-emphasis">{{ description }}</p>

          <!-- Business hours -->
          <div class="mt-2">
            <p><strong>Opens:</strong> {{ timeOpen }}</p>
            <p><strong>Closes:</strong> {{ timeClose }}</p>

            <!-- Shop Status Control -->
            <div class="status-control mt-4">
              <p class="text-body-2 mb-2">
                <strong>Current Status:</strong>
                <v-chip :color="getCurrentStatusDisplay().color" size="small" class="ml-2">
                  <v-icon start small>{{ getCurrentStatusDisplay().icon }}</v-icon>
                  {{ getCurrentStatusDisplay().text }}
                </v-chip>
              </p>

              <!-- Single toggle button -->
              <v-btn
                :color="getCurrentStatusDisplay().buttonColor"
                :loading="loading"
                @click="toggleShopStatus"
                class="status-toggle-btn"
                size="large"
              >
                <v-icon start>{{ getCurrentStatusDisplay().icon }}</v-icon>
                {{ getCurrentStatusDisplay().buttonText }}
              </v-btn>

              <p class="text-caption text-medium-emphasis mt-2 text-center">
                {{
                  manualStatus === 'auto'
                    ? `Status automatically determined by your business hours. Currently: ${isShopCurrentlyOpen() ? 'OPEN' : 'CLOSED'}`
                    : 'Status manually overridden'
                }}
              </p>
              
              <!-- Quick status summary -->
              <div class="mt-2">
                <v-chip 
                  v-if="manualStatus === 'auto'" 
                  :color="isShopCurrentlyOpen() ? 'green' : 'red'" 
                  size="small"
                >
                  <v-icon start small>
                    {{ isShopCurrentlyOpen() ? 'mdi-check' : 'mdi-close' }}
                  </v-icon>
                  {{ isShopCurrentlyOpen() ? 'Currently OPEN' : 'Currently CLOSED' }}
                </v-chip>
              </div>
            </div>
          </div>

          <p class="mt-2 text-body-2">
            <v-icon start small>mdi-map-marker</v-icon>
            {{ address }}
          </p>
        </v-sheet>
      </v-container>

      <!-- Transaction Section -->
      <v-divider thickness="3">Transaction</v-divider>

      <v-container class="py-4">
        <v-btn color="primary" rounded="lg" class="mb-4" to="/productlist"> 
          My Product 
        </v-btn>

        <v-select
          v-model="transactionFilter"
          :items="transactionOptions"
          label="Filter Transactions"
          variant="outlined"
          density="comfortable"
        />
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.cover-photo {
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

.cover-placeholder {
  height: 180px;
  background: linear-gradient(135deg, #e5e7eb, #d1d5db);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

.avatar-wrapper {
  display: flex;
  justify-content: center;
  margin-top: -48px; /* pull avatar over cover */
}

.avatar-border {
  border: 4px solid #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: #fff;
}

.status-control {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  background: #f8fafc;
}

.status-toggle-btn {
  min-width: 200px;
  font-weight: 600;
}
</style>