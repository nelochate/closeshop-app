<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

const showPicker = ref(false)
const uploading = ref(false)
const avatarUrl = ref(null)
const showSuccess = ref(false)
const successMessage = ref('')
const isLoading = ref(false)

// Form data
const formData = ref({
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
})

// User address
const userAddress = ref('')

// Success message
const showSuccessAndRedirect = (message) => {
  successMessage.value = message
  showSuccess.value = true
  setTimeout(() => {
    showSuccess.value = false
    router.replace({
      name: 'profileview',
      query: { refreshed: Date.now() },
    })
  }, 2000)
}

// Load user data
const loadUserData = async () => {
  try {
    const { data: userData } = await supabase.auth.getUser()
    if (userData?.user) {
      formData.value.email = userData.user.email || ''
      const metadata = userData.user.user_metadata || {}
      formData.value.firstName = metadata.first_name || ''
      formData.value.lastName = metadata.last_name || ''
      if (authStore.profile?.phone) formData.value.phone = authStore.profile.phone
      if (authStore.profile?.avatar_url) {
        avatarUrl.value = `${authStore.profile.avatar_url}?t=${Date.now()}`
      }
    }
  } catch (error) {
    console.error('Error loading user data:', error)
  }
}

// Load user address
const loadUserAddress = async () => {
  try {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return

    const userId = userData.user.id

    const { data: address, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (error) throw error

    if (address) {
      const a = address
      // Construct full address string
      userAddress.value = [
        a.house_no,
        a.street,
        a.building,
        a.purok,
        a.barangay_name,
        a.city_name,
        a.province_name,
        a.region_name,
        a.postal_code,
      ]
        .filter((part) => part && part.trim() !== '')
        .join(', ')

      // ✅ Set phone number from latest address if not set already
      if (!formData.value.phone && a.phone) {
        formData.value.phone = a.phone
        
      }
    } else {
      userAddress.value = 'Add address'
    }
  } catch (error) {
    console.error('Error loading user address:', error)
    userAddress.value = 'Add address'
  }
}

// Upload avatar with improved error handling
async function uploadAvatar(file) {
  if (!file) return
  try {
    uploading.value = true
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('No authenticated user found')

    let fileExt = file.name ? file.name.split('.').pop() : 'jpg'
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `${user.id}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { 
        upsert: true,
        cacheControl: '3600'
      })
    
    if (uploadError) throw uploadError

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(filePath)

    const { error: updateError } = await supabase.from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id)

    if (updateError) throw updateError

    avatarUrl.value = `${publicUrl}?t=${Date.now()}`
    if (authStore.profile) authStore.profile.avatar_url = publicUrl
    showSuccessMessage('Profile picture updated successfully!')
  } catch (error) {
    console.error('Error uploading avatar:', error)
    showSuccessMessage('Failed to upload profile picture. Please try again.')
  } finally {
    uploading.value = false
  }
}

const showSuccessMessage = (message) => {
  successMessage.value = message
  showSuccess.value = true
  setTimeout(() => (showSuccess.value = false), 3000)
}

// Improved image picker with better error handling
const pickImage = async (source) => {
  try {
    showPicker.value = false // Close picker immediately when option is selected
    
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false, // Set to false for better UX
      resultType: CameraResultType.DataUrl, // Use DataUrl for better compatibility
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      width: 500,
      height: 500,
      correctOrientation: true
    })

    if (photo?.dataUrl) {
      // Convert DataUrl to blob
      const response = await fetch(photo.dataUrl)
      const blob = await response.blob()
      
      // Create a file object with proper name and type
      const file = new File([blob], `avatar-${Date.now()}.jpg`, { 
        type: 'image/jpeg',
        lastModified: Date.now()
      })
      
      await uploadAvatar(file)
    }
  } catch (error) {
    if (error.message.includes('User cancelled') || error.message === 'User cancelled photos app') {
      // User closed camera or gallery without selecting
      console.log('User cancelled image selection')
    } else if (error.message.includes('No photos')) {
      showSuccessMessage('No photos found in gallery')
    } else if (error.message.includes('Permission')) {
      showSuccessMessage('Camera permission is required to take photos')
    } else {
      console.error('Error picking image:', error)
      showSuccessMessage('Failed to select image. Please try again.')
    }
  }
}

// Save profile
const saveProfile = async () => {
  try {
    isLoading.value = true
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) throw new Error('User not found')

    await supabase.auth.updateUser({
      data: {
        first_name: formData.value.firstName,
        last_name: formData.value.lastName,
      },
    })

    await supabase
      .from('profiles')
      .update({
        phone: formData.value.phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userData.user.id)

    await authStore.hydrateFromSession()
    showSuccessAndRedirect('Profile updated successfully!')
  } catch (error) {
    console.error(error)
    showSuccessMessage('Failed to update profile: ' + error.message)
  } finally {
    isLoading.value = false
  }
}

const goBack = () => {
  router.replace({ name: 'profileview', query: { refreshed: Date.now() } })
}

onMounted(() => {
  loadUserData()
  loadUserAddress()
})

const fullName = computed(() => {
  const first = formData.value.firstName || ''
  const last = formData.value.lastName || ''
  return `${first} ${last}`.trim()
})

// Computed property for phone display
const displayPhone = computed(() => {
  return formData.value.phone || 'Add phone number'
})
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat density="comfortable" color="#3f83c7" class="app-bar">
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title class="text-h6 font-bold">Edit Profile</v-toolbar-title>
    </v-app-bar>

    <v-main class="modern-font">
      <!-- Success Snackbar -->
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success" location="top">
        {{ successMessage }}
        <template v-slot:actions>
          <v-btn color="white" variant="text" @click="showSuccess = false">Close</v-btn>
        </template>
      </v-snackbar>

      <v-container>
        <!-- Avatar Section -->
        <v-card class="mb-5 pa-4 avatar-card" flat>
          <v-card-text class="d-flex justify-center">
            <div class="avatar-container">
              <v-avatar size="120" class="elevation-3" color="grey-lighten-3">
                <v-img v-if="avatarUrl" :src="avatarUrl" cover />
                <v-icon v-else size="60" color="grey-darken-2">mdi-account</v-icon>
              </v-avatar>
              <v-btn
                icon
                size="small"
                color="primary"
                class="edit-btn"
                elevation="4"
                @click="showPicker = true"
                :loading="uploading"
                :disabled="uploading"
              >
                <v-icon size="18">mdi-pencil</v-icon>
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Profile Information -->
        <v-card class="info-card elevation-2">
          <v-card-title class="font-bold">Profile Information</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="saveProfile">
              <v-row>
                <v-col cols="12">
                  <v-card flat class="mt-2 list-card">
                    <v-list>
                      <!-- Name -->
                      <v-list-item class="list-item" @click="router.push({ name: 'edit-name' })">
                        <v-list-item-title class="font-medium">Name</v-list-item-title>
                        <v-list-item-subtitle>{{ fullName }}</v-list-item-subtitle>
                        <template #append>
                          <v-icon color="grey-darken-1">mdi-chevron-right</v-icon>
                        </template>
                      </v-list-item>

                      <v-divider />

                      <!-- Phone -->
                      <v-list-item class="list-item" @click="router.push({ name: 'edit-phone' })">
                        <v-list-item-title class="font-medium">Phone</v-list-item-title>
                        <v-list-item-subtitle 
                          :class="{ 'text-grey': !formData.phone }"
                        >
                          {{ displayPhone }}
                        </v-list-item-subtitle>
                        <template #append>
                          <v-icon color="grey-darken-1">mdi-chevron-right</v-icon>
                        </template>
                      </v-list-item>

                      <v-divider />

                      <!-- Email -->
                      <v-list-item class="list-item" @click="router.push({ name: 'edit-email' })">
                        <v-list-item-title class="font-medium">Email</v-list-item-title>
                        <v-list-item-subtitle>{{ formData.email }}</v-list-item-subtitle>
                        <template #append>
                          <v-icon color="grey-darken-1">mdi-chevron-right</v-icon>
                        </template>
                      </v-list-item>

                      <v-divider />

                      <!-- Address -->
                      <v-list-item class="list-item" @click="router.push({ name: 'my-address' })">
                        <v-list-item-title class="font-medium">Address</v-list-item-title>
                        <v-list-item-subtitle 
                          :class="{ 'text-grey': userAddress === 'Add address' }"
                        >
                          {{ userAddress }}
                        </v-list-item-subtitle>
                        <template #append>
                          <v-icon color="grey-darken-1">mdi-chevron-right</v-icon>
                        </template>
                      </v-list-item>
                    </v-list>
                  </v-card>
                </v-col>
              </v-row>
            </v-form>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>

    <!-- Improved Bottom Sheet for Image Picker -->
    <v-bottom-sheet v-model="showPicker" inset>
      <v-card class="bottom-sheet-card" rounded="t-xl">
        <v-card-title class="d-flex justify-space-between align-center pa-4">
          <span class="text-h6 font-weight-bold">Change Profile Photo</span>
          <v-btn icon @click="showPicker = false" variant="text">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-divider></v-divider>

        <v-list class="py-0">
          <v-list-item 
            @click="pickImage('camera')"
            class="pa-4 list-item-action"
          >
            <template #prepend>
              <v-avatar color="primary" variant="tonal" size="40" rounded>
                <v-icon color="primary">mdi-camera</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title class="font-weight-medium">Take Photo</v-list-item-title>
            <v-list-item-subtitle>Use your camera to take a new photo</v-list-item-subtitle>
          </v-list-item>

          <v-divider />

          <v-list-item 
            @click="pickImage('gallery')"
            class="pa-4 list-item-action"
          >
            <template #prepend>
              <v-avatar color="secondary" variant="tonal" size="40" rounded>
                <v-icon color="secondary">mdi-image-multiple</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title class="font-weight-medium">Choose from Gallery</v-list-item-title>
            <v-list-item-subtitle>Select a photo from your gallery</v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <v-card-actions class="pa-4">
          <v-btn 
            block 
            variant="text" 
            @click="showPicker = false"
            class="cancel-btn"
          >
            Cancel
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-bottom-sheet>
  </v-app>
</template>

<style scoped>
.app-bar {
  padding-top: 22px;
}
.modern-font {
  font-family: 'Inter', 'Roboto', 'Helvetica Neue', sans-serif;
}
.v-card {
  margin-bottom: 20px;
  border-radius: 14px;
}
.avatar-card {
  background: linear-gradient(135deg, #5276b0, #354d7c);
  color: white;
  border-radius: 16px;
  margin-top: 18px;
}
.info-card {
  border-radius: 16px;
  background-color: #fafafa;
}
.avatar-container {
  position: relative;
  display: inline-block;
}
.edit-btn {
  position: absolute;
  bottom: -5px;
  right: -5px;
  border: 2px solid white;
  border-radius: 50%;
  transition: transform 0.2s ease;
  background-color: #3f83c7;
}
.edit-btn:hover {
  transform: scale(1.1);
}
.list-card {
  background-color: #fff;
  border-radius: 12px;
}
.list-item {
  padding-top: 14px;
  padding-bottom: 14px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.list-item:hover {
  background-color: #f5f5f5;
}
.v-list-item-title {
  font-weight: 500;
  font-size: 15px;
}
.v-list-item-subtitle {
  font-size: 14px;
  color: #555;
}
.text-grey {
  color: #9e9e9e !important;
  font-style: italic;
}

/* Bottom Sheet Styles */
.bottom-sheet-card {
  border-radius: 16px 16px 0 0 !important;
}
.list-item-action {
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.list-item-action:hover {
  background-color: #f8f9fa;
}
.cancel-btn {
  border-radius: 10px;
  font-weight: 600;
}

/* Loading state for avatar button */
.edit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>