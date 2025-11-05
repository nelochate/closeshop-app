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

// Upload avatar
async function uploadAvatar(file) {
  if (!file) return
  try {
    uploading.value = true
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No authenticated user found')

    let fileExt = file.name ? file.name.split('.').pop() : 'jpg'
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `${user.id}/${fileName}`

    const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)

    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)

    avatarUrl.value = `${publicUrl}?t=${Date.now()}`
    if (authStore.profile) authStore.profile.avatar_url = publicUrl
    showSuccessMessage('Profile picture updated successfully!')
  } catch (error) {
    console.error(error)
    showSuccessMessage('Failed to upload profile picture')
  } finally {
    uploading.value = false
  }
}

const showSuccessMessage = (message) => {
  successMessage.value = message
  showSuccess.value = true
  setTimeout(() => (showSuccess.value = false), 3000)
}

// Pick image
const pickImage = async (source) => {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: true,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    })
    if (photo.webPath) {
      const response = await fetch(photo.webPath)
      const blob = await response.blob()
      await uploadAvatar(blob)
    }
    showPicker.value = false
  } catch (error) {
    console.error(error)
    showSuccessMessage('Failed to select image')
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

    await supabase.from('profiles').update({
      phone: formData.value.phone,
      updated_at: new Date().toISOString(),
    }).eq('id', userData.user.id)

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

onMounted(loadUserData)

const fullName = computed(() => {
  const first = formData.value.firstName || ''
  const last = formData.value.lastName || ''
  return `${first} ${last}`.trim()
})

// Mask phone (show only last 2 digits)
const maskedPhone = computed(() => {
  if (!formData.value.phone) return ''
  const phone = formData.value.phone
  return phone.replace(/.(?=.{2})/g, '*')  // keep last 2 digits
})

// Mask email (show first & last char + domain)
const maskedEmail = computed(() => {
  if (!formData.value.email) return ''
  const [local, domain] = formData.value.email.split('@')
  if (!local || !domain) return formData.value.email
  return (
    local[0] +
    '*****' +
    local[local.length - 1] +
    '@' +
    domain
  )
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
              <v-btn icon size="small" color="primary" class="edit-btn" elevation="4"
                @click="showPicker = true" :loading="uploading">
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
                        <v-list-item-subtitle>{{ maskedPhone }}</v-list-item-subtitle>
                        <template #append>
                          <v-icon color="grey-darken-1">mdi-chevron-right</v-icon>
                        </template>
                      </v-list-item>

                      <v-divider />

                      <!-- Email -->
                      <v-list-item class="list-item" @click="router.push({ name: 'edit-email' })">
                        <v-list-item-title class="font-medium">Email</v-list-item-title>
                        <v-list-item-subtitle>{{ maskedEmail }}</v-list-item-subtitle>
                        <template #append>
                          <v-icon color="grey-darken-1">mdi-chevron-right</v-icon>
                        </template>
                      </v-list-item>
                    </v-list>
                  </v-card>
                </v-col>

                <!-- Redirect to Edit Address -->
                <v-col cols="12" class="mt-4">
                  <v-btn block color="indigo-darken-3" class="rounded-lg text-white font-medium"
                    @click="router.push({ name: 'edit-address' })">
                    <v-icon class="me-2">mdi-map-marker</v-icon>
                    Edit Address
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>

    <!-- Bottom Sheet for Image Picker -->
    <v-bottom-sheet v-model="showPicker">
      <v-list>
        <v-list-item @click="pickImage('camera')">
          <v-icon icon="mdi-camera" class="me-3"></v-icon>
          <v-list-item-title>Take Photo</v-list-item-title>
        </v-list-item>
        <v-list-item @click="pickImage('gallery')">
          <v-icon icon="mdi-image" class="me-3"></v-icon>
          <v-list-item-title>Choose from Gallery</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-bottom-sheet>
  </v-app>
</template>

<style scoped>
.app-bar {
  padding-top: 22px;
}
/* Modern font */
.modern-font {
  font-family: 'Inter', 'Roboto', 'Helvetica Neue', sans-serif;
}

/* Cards */
.v-card {
  margin-bottom: 20px;
  border-radius: 14px;
}

.avatar-card {
  background: linear-gradient(135deg, #5276b0, #354d7c);
  color: white;
  border-radius: 16px;
}

.info-card {
  border-radius: 16px;
  background-color: #fafafa;
}

/* Avatar */
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
}

.edit-btn:hover {
  transform: scale(1.1);
}

/* List Items */
.list-card {
  background-color: #fff;
  border-radius: 12px;
}

.list-item {
  padding-top: 14px;
  padding-bottom: 14px;
}

.v-list-item-title {
  font-weight: 500;
  font-size: 15px;
}

.v-list-item-subtitle {
  font-size: 14px;
  color: #555;
}
</style>
