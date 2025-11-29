<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const addresses = ref<any[]>([])
const showSuccess = ref(false)
const successMessage = ref('')
const isLoading = ref(false)
const isDetectingLocation = ref(false)
const showLocationOptions = ref(false)

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

// Delete address
const deleteAddress = async (id: string) => {
  if (!confirm('Delete this address?')) return
  const { error } = await supabase.from('addresses').delete().eq('id', id)
  if (!error) {
    addresses.value = addresses.value.filter(a => a.id !== id)
    successMessage.value = 'Address deleted successfully'
    showSuccess.value = true
  }
}

// Set default address
const setDefaultAddress = async (id: string) => {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return
  
  try {
    // First, remove default from all addresses
    await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', userData.user.id)

    // Then set the selected one as default
    const { error } = await supabase
      .from('addresses')
      .update({ is_default: true })
      .eq('id', id)

    if (error) throw error

    await loadAddresses()
    successMessage.value = 'Default address updated'
    showSuccess.value = true
  } catch (error) {
    console.error('Error setting default address:', error)
    alert('Error setting default address')
  }
}

// Edit address navigation
const editAddress = (id: string) => {
  router.push({ name: 'edit-address', params: { id } })
}

// Detect current location options
const detectCurrentLocation = () => {
  showLocationOptions.value = true
}

// Find existing current location address
const findCurrentLocationAddress = () => {
  return addresses.value.find(addr => addr.recipient_name === 'My Current Location')
}

// Use current GPS location
const useCurrentGPSLocation = () => {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser')
    return
  }

  isDetectingLocation.value = true

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const { latitude, longitude } = position.coords
        
        // Reverse geocoding to get address from coordinates
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`
        )
        const data = await response.json()
        
        if (data && data.address) {
          const address = data.address
          
          // Map the OpenStreetMap address data to your schema (without latitude/longitude)
          const newAddress = {
            recipient_name: 'My Current Location',
            phone: '',
            house_no: address.house_number || '',
            building: address.building || '',
            street: address.road || address.street || address.pedestrian || '',
            purok: address.neighbourhood || '',
            barangay_name: address.suburb || address.village || address.neighbourhood || '',
            city_name: address.city || address.town || address.municipality || '',
            province_name: address.state || address.region || '',
            region_name: address.region || '',
            postal_code: address.postcode || '',
            is_default: true
          }

          // Save to database
          await saveCurrentLocationAddress(newAddress)
        }
      } catch (error) {
        console.error('Error getting location:', error)
        alert('Unable to get your current location. Please try again.')
      } finally {
        isDetectingLocation.value = false
        showLocationOptions.value = false
      }
    },
    (error) => {
      console.error('Geolocation error:', error)
      isDetectingLocation.value = false
      showLocationOptions.value = false
      
      switch (error.code) {
        case error.PERMISSION_DENIED:
          alert('Location access denied. Please enable location permissions in your browser settings.')
          break
        case error.POSITION_UNAVAILABLE:
          alert('Location information unavailable.')
          break
        case error.TIMEOUT:
          alert('Location request timed out.')
          break
        default:
          alert('An unknown error occurred while getting your location.')
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
    }
  )
}

// Save current location address to database
const saveCurrentLocationAddress = async (addressData: any) => {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return

  try {
    // Find existing current location address
    const existingCurrentLocation = findCurrentLocationAddress()

    // First, remove default from all addresses
    await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', userData.user.id)

    if (existingCurrentLocation) {
      // Update existing current location address
      const { error } = await supabase
        .from('addresses')
        .update({
          ...addressData,
          is_default: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingCurrentLocation.id)

      if (error) throw error
      successMessage.value = 'Current location updated and set as default'
    } else {
      // Insert new current location address
      const { error } = await supabase
        .from('addresses')
        .insert([
          {
            ...addressData,
            user_id: userData.user.id,
            is_default: true
          }
        ])
        .select()

      if (error) throw error
      successMessage.value = 'Current location set as default delivery address'
    }

    await loadAddresses()
    showSuccess.value = true
  } catch (error) {
    console.error('Error saving current location:', error)
    alert('Error saving your current location address.')
  }
}

// Select from existing addresses for delivery
const selectExistingAddressForDelivery = () => {
  showLocationOptions.value = false
  successMessage.value = 'Select an address below to set as your delivery location'
  showSuccess.value = true
}

// Close location options dialog
const closeLocationOptions = () => {
  showLocationOptions.value = false
}

// Check if current location exists
const hasCurrentLocation = () => {
  return addresses.value.some(addr => addr.recipient_name === 'My Current Location')
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

                      <!-- Current Location Badge -->
                      <div v-if="addr.recipient_name === 'My Current Location'" class="d-flex align-center mb-2">
                        <v-icon color="green" small class="me-1">mdi-crosshairs-gps</v-icon>
                        <span class="text-green font-weight-bold text-caption">CURRENT LOCATION</span>
                      </div>
                      
                      <!-- Recipient Info -->
                      <div class="font-weight-medium text-body-1 mb-1">
                        {{ addr.recipient_name || 'No name provided' }} 
                        <span v-if="addr.phone">| {{ addr.phone }}</span>
                      </div>
                      
                      <!-- Address Details - Updated for your schema -->
                      <div class="text-body-2 mb-1">
                        <span v-if="addr.house_no">{{ addr.house_no }}, </span>
                        <span v-if="addr.building">{{ addr.building }}, </span>
                        <span v-if="addr.street">{{ addr.street }}, </span>
                        <span v-if="addr.purok">Purok {{ addr.purok }}, </span>
                        <span class="font-weight-medium" v-if="addr.barangay_name">{{ addr.barangay_name }}, </span>
                        <span v-if="addr.city_name">{{ addr.city_name }}</span>
                      </div>
                      <div class="text-caption text-grey" v-if="addr.province_name || addr.postal_code">
                        {{ addr.province_name }}{{ addr.province_name && addr.postal_code ? ', ' : '' }}{{ addr.postal_code }}
                      </div>
                      <div class="text-caption text-grey" v-if="addr.region_name">
                        {{ addr.region_name }}
                      </div>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div class="d-flex flex-column align-end" style="gap: 8px;">
                      <v-btn 
                        v-if="addr.recipient_name !== 'My Current Location'"
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

        <!-- Detect My Current Location Button -->
        <v-col cols="12" class="mt-4">
          <v-btn
            block
            :color="hasCurrentLocation() ? 'warning' : 'secondary'"
            class="rounded-lg"
            @click="detectCurrentLocation"
            :loading="isDetectingLocation"
            size="large"
          >
            <v-icon class="me-2">mdi-crosshairs-gps</v-icon>
            {{ hasCurrentLocation() ? 'Update My Current Location' : 'Detect My Current Location' }}
          </v-btn>
        </v-col>

        <!-- Add New Address Button -->
        <v-col cols="12" class="mt-2">
          <v-btn
            block
            color="primary"
            class="rounded-lg text-white"
            @click="router.push({ name: 'edit-address' })"
            size="large"
          >
            <v-icon class="me-2">mdi-plus</v-icon>
            Add New Address Manually
          </v-btn>
        </v-col>
      </v-container>

      <!-- Location Options Dialog -->
      <v-dialog v-model="showLocationOptions" max-width="400" persistent>
        <v-card>
          <v-card-title class="d-flex justify-space-between align-center">
            <span class="text-h6">Delivery Location</span>
            <v-btn icon @click="closeLocationOptions">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-card-title>
          
          <v-card-text class="pt-4">
            <p class="text-body-1 mb-4">How would you like to set your delivery location?</p>
            
            <div class="d-flex flex-column" style="gap: 12px;">
              <v-btn
                color="primary"
                variant="outlined"
                size="large"
                @click="useCurrentGPSLocation"
                :loading="isDetectingLocation"
              >
                <v-icon class="me-2">mdi-crosshairs-gps</v-icon>
                {{ hasCurrentLocation() ? 'Update My Current Location' : 'Use My Current Location' }}
              </v-btn>
              
              <v-btn
                color="secondary"
                variant="outlined"
                size="large"
                @click="selectExistingAddressForDelivery"
              >
                <v-icon class="me-2">mdi-map-marker</v-icon>
                Select from Saved Addresses
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-dialog>
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