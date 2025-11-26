<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

const firstName = ref('')
const lastName = ref('')
const isLoading = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')

// Load current name when component mounts
onMounted(() => {
  loadCurrentName()
})

const loadCurrentName = () => {
  firstName.value = authStore.profile?.first_name || ''
  lastName.value = authStore.profile?.last_name || ''
}

const saveName = async () => {
  // Quick validation
  if (!firstName.value?.trim() || !lastName.value?.trim()) {
    successMessage.value = 'Please fill in both first and last name'
    showSuccess.value = true
    return
  }

  try {
    isLoading.value = true
    const startTime = Date.now()
    console.time('NameUpdate')

    const trimmedFirstName = firstName.value.trim()
    const trimmedLastName = lastName.value.trim()
    
    // Use existing user data instead of calling getUser() again
    const userId = authStore.userData?.id
    if (!userId) {
      throw new Error('User not authenticated')
    }

    console.log('🔄 Starting name update...')

    // OPTIMIZATION 1: Run updates in parallel where possible
    const updatePromises = []

    // 1️⃣ Update profiles table (most important - run first)
    const profilePromise = supabase
      .from('profiles')
      .update({
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    updatePromises.push(profilePromise)

    // 2️⃣ Update auth metadata (can run in parallel)
    const authPromise = supabase.auth.updateUser({
      data: { 
        first_name: trimmedFirstName, 
        last_name: trimmedLastName 
      }
    })

    updatePromises.push(authPromise)

    // 3️⃣ OPTIMIZATION: Only update addresses if name actually changed
    const oldFirstName = authStore.profile?.first_name || ''
    const oldLastName = authStore.profile?.last_name || ''
    
    if (trimmedFirstName !== oldFirstName || trimmedLastName !== oldLastName) {
      const oldFullName = `${oldFirstName} ${oldLastName}`.trim()
      const newFullName = `${trimmedFirstName} ${trimmedLastName}`.trim()
      
      if (oldFullName && oldFullName !== newFullName) {
        console.log('📝 Updating addresses from:', oldFullName, 'to:', newFullName)
        
        const addressPromise = supabase
          .from('addresses')
          .update({
            recipient_name: newFullName,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('recipient_name', oldFullName)

        updatePromises.push(addressPromise)
      }
    }

    // Execute all updates in parallel and handle errors properly
    console.log('🚀 Executing parallel updates...')
    const results = await Promise.allSettled(updatePromises)
    
    // Check for critical errors
    const errors = []
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`⚠️ Update ${index} failed:`, result.reason)
        errors.push(result.reason)
      } else if (result.value?.error) {
        console.warn(`⚠️ Update ${index} returned error:`, result.value.error)
        errors.push(result.value.error)
      }
    })

    // Throw error if profile update failed (critical)
    const profileResult = results[0]
    if (profileResult.status === 'rejected' || profileResult.value?.error) {
      const profileError = profileResult.status === 'rejected' ? profileResult.reason : profileResult.value.error
      throw new Error(`Profile update failed: ${profileError.message}`)
    }

    console.log('✅ Database updates completed')

    // OPTIMIZATION 2: Lightweight store update instead of full hydration
    console.log('🔄 Updating local store...')
    if (authStore.profile) {
      // Direct update instead of full re-hydration
      authStore.profile.first_name = trimmedFirstName
      authStore.profile.last_name = trimmedLastName
      authStore.profile.updated_at = new Date().toISOString()
    }

    // Also update user_metadata in authStore if it exists
    if (authStore.userData?.user_metadata) {
      authStore.userData.user_metadata.first_name = trimmedFirstName
      authStore.userData.user_metadata.last_name = trimmedLastName
    }

    const endTime = Date.now()
    console.log(`⏱️ Total update time: ${endTime - startTime}ms`)
    console.timeEnd('NameUpdate')

    successMessage.value = 'Name updated successfully!'
    showSuccess.value = true
    
    // OPTIMIZATION 3: Faster redirect
    console.log('🔄 Redirecting...')
    setTimeout(() => {
      router.replace({ 
        name: 'profileview', 
        query: { 
          nameUpdated: Date.now()
        } 
      })
    }, 800) // Reduced from 1500ms

  } catch (error) {
    console.error('❌ Save name failed:', error)
    
    // More specific error handling
    if (error.message?.includes('JWT') || error.message?.includes('auth')) {
      successMessage.value = 'Session expired. Please log in again.'
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      successMessage.value = 'Network error. Please check your connection.'
    } else if (error.message?.includes('profiles')) {
      successMessage.value = 'Database error. Please try again.'
    } else {
      successMessage.value = 'Failed to update name: ' + error.message
    }
    
    showSuccess.value = true
  } finally {
    isLoading.value = false
  }
}

const cancelEdit = () => {
  router.back()
}
</script>

<template>
  <v-app>
    <v-app-bar class="top-nav" flat color="#3f83c7">
      <v-btn icon @click="cancelEdit" :disabled="isLoading">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6 font-weight-bold">Edit Name</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn 
        icon 
        @click="router.push('/settings')" 
        :disabled="isLoading"
      >
        <v-icon>mdi-cog-outline</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main class="background-gradient">
      <v-snackbar 
        v-model="showSuccess" 
        :timeout="3000" 
        color="success"
        location="top"
        elevation="4"
      >
        <div class="d-flex align-center">
          <v-icon class="me-2">mdi-check-circle</v-icon>
          <span>{{ successMessage }}</span>
        </div>
        <template #actions>
          <v-btn
            icon
            @click="showSuccess = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </template>
      </v-snackbar>

      <v-container class="edit-name-container">
        <v-card class="name-card" elevation="4" rounded="lg">
          <v-card-title class="card-header">
            <v-icon color="primary" class="me-3">mdi-account-edit</v-icon>
            Update Your Name
            <v-chip v-if="isLoading" color="primary" variant="flat" size="small" class="ms-2">
              <v-icon small class="me-1">mdi-sync</v-icon>
              Saving...
            </v-chip>
          </v-card-title>
          
          <v-card-text class="card-content">
            <v-alert 
              type="info" 
              variant="tonal" 
              class="mb-4"
              border="start"
            >
              <div class="text-caption">
                <strong>Performance Optimized:</strong> Quick updates with parallel processing
              </div>
            </v-alert>

            <v-form @submit.prevent="saveName" class="name-form">
              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="firstName"
                    label="First Name"
                    variant="outlined"
                    placeholder="Enter your first name"
                    :rules="[
                      v => !!v?.trim() || 'First name is required',
                      v => (v?.trim().length >= 2) || 'Must be at least 2 characters',
                    ]"
                    required
                    clearable
                    prepend-inner-icon="mdi-account-outline"
                    :disabled="isLoading"
                    class="name-input"
                  />
                </v-col>
                
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="lastName"
                    label="Last Name"
                    variant="outlined"
                    placeholder="Enter your last name"
                    :rules="[
                      v => !!v?.trim() || 'Last name is required',
                      v => (v?.trim().length >= 2) || 'Must be at least 2 characters',
                    ]"
                    required
                    clearable
                    prepend-inner-icon="mdi-account-outline"
                    :disabled="isLoading"
                    class="name-input"
                  />
                </v-col>
              </v-row>

              <div class="action-buttons mt-6">
                <v-btn 
                  type="submit" 
                  color="primary" 
                  size="large"
                  :loading="isLoading"
                  :disabled="!firstName?.trim() || !lastName?.trim()"
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
                  <v-icon class="me-2">mdi-content-save-check</v-icon>
                  {{ isLoading ? 'Updating...' : 'Update Name' }}
                </v-btn>

                <v-btn 
                  variant="outlined" 
                  color="grey" 
                  size="large"
                  block 
                  class="mt-2 cancel-btn"
                  @click="cancelEdit"
                  :disabled="isLoading"
                >
                  <v-icon class="me-2">mdi-close</v-icon>
                  Cancel
                </v-btn>
              </div>
            </v-form>
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

.edit-name-container {
  max-width: 600px;
  margin-top: 40px;
  padding: 16px;
}

.name-card {
  border: 1px solid #e0e0e0;
}

.card-header {
  background: linear-gradient(135deg, #f8fafc 0%, #e3f2fd 100%);
  border-bottom: 1px solid #e0e0e0;
  padding: 20px 24px;
  font-weight: 600;
  color: #354d7c;
}

.card-content {
  padding: 20px;
}

.name-input {
  margin-bottom: 4px;
}

.action-buttons {
  margin-top: 8px;
}

.save-btn {
  border-radius: 8px;
  font-weight: 600;
  height: 48px;
  text-transform: none;
}

.cancel-btn {
  border-radius: 8px;
  height: 48px;
  text-transform: none;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .edit-name-container {
    margin-top: 20px;
    padding: 8px;
  }
  
  .card-header {
    padding: 16px 20px;
  }
  
  .card-content {
    padding: 16px;
  }
}
</style>