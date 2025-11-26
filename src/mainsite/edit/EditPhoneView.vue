<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

const phone = ref('')
const isLoading = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')

// Load current phone number on component mount
onMounted(async () => {
  await loadCurrentPhone()
})

const loadCurrentPhone = async () => {
  try {
    // Try to get phone from profile first, then from addresses
    if (authStore.profile?.phone) {
      phone.value = authStore.profile.phone
    } else {
      // Get phone from latest address
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) return
      
      const { data: latestAddress } = await supabase
        .from('addresses')
        .select('phone')
        .eq('user_id', userData.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
      
      if (latestAddress?.phone) {
        phone.value = latestAddress.phone
      }
    }
  } catch (error) {
    console.error('Error loading current phone:', error)
  }
}

const savePhone = async () => {
  try {
    isLoading.value = true

    // 1️⃣ Get authenticated user
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')
    const userId = userData.user.id

    let updateCount = 0
    const errors = []

    // 2️⃣ Update phone in profiles table (primary location)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        phone: phone.value,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (profileError) {
      errors.push(`Profile update failed: ${profileError.message}`)
    } else {
      updateCount++
      // Update the store if available
      if (authStore.profile) {
        authStore.profile.phone = phone.value
      }
    }

    // 3️⃣ Update phone in all user addresses
    const { error: addressesError } = await supabase
      .from('addresses')
      .update({
        phone: phone.value,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (addressesError) {
      errors.push(`Addresses update failed: ${addressesError.message}`)
    } else {
      updateCount++
    }

    // 4️⃣ If no addresses exist, create a default one with the phone number
    const { data: existingAddresses, error: checkAddressError } = await supabase
      .from('addresses')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (checkAddressError && checkAddressError.code !== 'PGRST116') {
      errors.push(`Address check failed: ${checkAddressError.message}`)
    }

    if (!existingAddresses || existingAddresses.length === 0) {
      const { error: createAddressError } = await supabase
        .from('addresses')
        .insert({
          user_id: userId,
          phone: phone.value,
          recipient_name: authStore.profile?.first_name + ' ' + authStore.profile?.last_name || 'Customer',
          is_default: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

      if (createAddressError) {
        errors.push(`Default address creation failed: ${createAddressError.message}`)
      } else {
        updateCount++
      }
    }

    // Handle results
    if (errors.length > 0) {
      console.warn('Partial updates completed with errors:', errors)
      successMessage.value = `Phone updated with some warnings: ${errors.join(', ')}`
    } else {
      successMessage.value = 'Phone number updated successfully in all locations!'
    }

    showSuccess.value = true

    // Redirect after 2 seconds
    setTimeout(() => {
      router.replace({ 
        name: 'edit-profile', 
        query: { 
          refreshed: Date.now(),
          phoneUpdated: true 
        } 
      })
    }, 2000)

  } catch (e) {
    console.error('Save phone error:', e)
    successMessage.value = 'Failed to update phone: ' + e.message
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

// Phone validation (optional enhancement)
const validatePhone = (phone) => {
  if (!phone) return 'Phone number is required'
  if (!/^\+?[\d\s-()]{10,}$/.test(phone)) return 'Please enter a valid phone number'
  return true
}
</script>

<template>
  <v-app>
    <v-app-bar class="top-nav" flat color="#3f83c7">
      <v-btn icon @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6 font-weight-bold">Edit Number</v-toolbar-title>
    </v-app-bar>

    <v-main class="background-gradient">
      <v-snackbar 
        v-model="showSuccess" 
        :timeout="4000" 
        color="success"
        location="top"
      >
        <div class="d-flex align-center">
          <v-icon class="me-2">mdi-check-circle</v-icon>
          <span>{{ successMessage }}</span>
        </div>
      </v-snackbar>

      <v-container class="container">
        <v-card class="phone-card" elevation="4" rounded="lg">
          <v-card-title class="card-title">
            <v-icon color="primary" class="me-3">mdi-phone</v-icon>
            Update Your Number
          </v-card-title>
          
          <v-card-text class="card-content">
            <v-alert 
              type="info" 
              variant="tonal" 
              class="mb-6"
              border="start"
            >
              <template #prepend>
                <v-icon color="info">mdi-information</v-icon>
              </template>
              <div class="text-caption">
                Your phone number will be updated in your profile and all your saved addresses.
                This ensures consistent contact information across all your orders.
              </div>
            </v-alert>

            <v-form @submit.prevent="savePhone">
              <v-text-field
                v-model="phone"
                label="Phone Number"
                variant="outlined"
                placeholder="+63 XXX XXX XXXX"
                :rules="[
                  v => !!v || 'Phone number is required',
                  v => /^\+?[\d\s-()]{10,}$/.test(v) || 'Please enter a valid phone number'
                ]"
                required
                clearable
                prepend-inner-icon="mdi-phone"
                class="phone-input"
              />

              <v-btn 
                type="submit" 
                color="primary" 
                size="large"
                :loading="isLoading"
                :disabled="!phone"
                block 
                class="save-btn"
              >
                <template #loader>
                  <v-progress-circular
                    indeterminate
                    size="20"
                    width="2"
                  ></v-progress-circular>
                </template>
                <v-icon class="me-2">mdi-content-save</v-icon>
                Update Phone Number
              </v-btn>

              <v-btn 
                variant="outlined" 
                color="grey" 
                block 
                class="mt-3"
                @click="router.back()"
                :disabled="isLoading"
              >
                <v-icon class="me-2">mdi-close</v-icon>
                Cancel
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>

        <!-- Additional Info Card -->
        <v-card class="info-card mt-4" variant="outlined" rounded="lg">
          <v-card-text class="text-center">
            <v-icon color="grey" class="mb-2">mdi-shield-account</v-icon>
            <p class="text-caption text-grey">
              Your phone number is used for order notifications and delivery coordination.
              We prioritize your privacy and will never share your contact information.
            </p>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>


.background-gradient {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
}

.top-nav {
  padding-top: 22px;
}

.container {
  max-width: 500px;
  margin-top: 40px;
  padding: 16px;
}

.phone-card {
  border: 1px solid #e0e0e0;
}

.card-title {
  background: linear-gradient(135deg, #f8fafc 0%, #e3f2fd 100%);
  border-bottom: 1px solid #e0e0e0;
  padding: 20px 24px;
  font-weight: 600;
  color: #354d7c;
  font-size: 19px;
}

.card-content {
  padding: 24px;
}

.phone-input {
  margin-bottom: 16px;
}

.save-btn {
  border-radius: 8px;
  font-weight: 600;
  height: 48px;
  text-transform: none;
  letter-spacing: 0.5px;
}

.info-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .container {
    margin-top: 20px;
    padding: 12px;
  }
  
  .card-content {
    padding: 20px 16px;
  }
  
  .card-title {
    padding: 16px 20px;
  }
}

/* Animation for smooth transitions */
.v-card {
  transition: all 0.3s ease;
}

.v-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15) !important;
}
</style>