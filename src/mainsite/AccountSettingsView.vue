<script setup>
import { ref, onMounted } from 'vue'
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
  email: ''
})

// Show success message and redirect
const showSuccessAndRedirect = (message) => {
  successMessage.value = message
  showSuccess.value = true
  setTimeout(() => {
    showSuccess.value = false
    // Force refresh by using replace with a query parameter
    router.replace({
      name: 'profileview',
      query: { refreshed: Date.now() }
    })
  }, 2000)
}

// Load user data
const loadUserData = async () => {
  try {
    const { data: userData } = await supabase.auth.getUser()
    if (userData?.user) {
      formData.value.email = userData.user.email || ''

      // Load from user_metadata or profile
      const metadata = userData.user.user_metadata || {}
      formData.value.firstName = metadata.first_name || ''
      formData.value.lastName = metadata.last_name || ''

      // Load phone from profile if available
      if (authStore.profile?.phone) {
        formData.value.phone = authStore.profile.phone
      }

      // Load avatar with cache busting
      if (authStore.profile?.avatar_url) {
        avatarUrl.value = `${authStore.profile.avatar_url}?t=${Date.now()}`
      }
    }
  } catch (error) {
    console.error('Error loading user data:', error)
  }
}

// Upload avatar function
async function uploadAvatar(file) {
  if (!file) {
    console.error('No file selected.');
    return;
  }

  try {
    uploading.value = true
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('No authenticated user found:', userError?.message);
      return;
    }

    // Handle both File objects and Blob objects
    let fileExt = 'jpg';

    if (file.name) {
      fileExt = file.name.split('.').pop() || 'jpg';
    } else if (file.type) {
      const mimeToExt = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp'
      };
      fileExt = mimeToExt[file.type] || 'jpg';
    }

    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // Update user profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id);

    if (updateError) throw updateError;

    console.log('Avatar uploaded successfully! URL:', publicUrl);

    // Update the local avatar URL with cache busting
    avatarUrl.value = `${publicUrl}?t=${Date.now()}`;

    // Update the auth store with the new avatar URL
    if (authStore.profile) {
      authStore.profile.avatar_url = publicUrl;
    }

    showSuccessMessage('Profile picture updated successfully!')
    return publicUrl;

  } catch (error) {
    console.error('Error uploading avatar:', error.message);
    showSuccessMessage('Failed to upload profile picture')
    throw error;
  } finally {
    uploading.value = false
  }
}

// Show success message only (without redirect)
const showSuccessMessage = (message) => {
  successMessage.value = message
  showSuccess.value = true
  setTimeout(() => {
    showSuccess.value = false
  }, 3000)
}

// Pick image function
const pickImage = async (source) => {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: true,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    });

    if (photo.webPath) {
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      await uploadAvatar(blob);
    }
    showPicker.value = false;

  } catch (error) {
    console.error('Error picking image:', error);
    showSuccessMessage('Failed to select image')
  }
}

// Save profile changes
const saveProfile = async () => {
  try {
    isLoading.value = true
    const { data: userData, error: getUserError } = await supabase.auth.getUser()
    if (getUserError || !userData?.user) throw getUserError || new Error('User not found')

    // Update auth metadata
    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        first_name: formData.value.firstName,
        last_name: formData.value.lastName
      }
    })
    if (metadataError) throw metadataError

    // Update profile table
    const updateData = {
      phone: formData.value.phone,
      updated_at: new Date().toISOString()
    }

    // Only update avatar_url if it's a new URL (not a cached one)
    if (avatarUrl.value && !avatarUrl.value.includes('?')) {
      updateData.avatar_url = avatarUrl.value
    } else if (avatarUrl.value) {
      updateData.avatar_url = avatarUrl.value.split('?')[0]
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userData.user.id)

    if (profileError) throw profileError

    // Refresh store so ProfileView sees updated values
    await authStore.hydrateFromSession()

    // ✅ Success feedback with redirect
    showSuccessAndRedirect('Profile updated successfully!')



  } catch (error) {
    console.error('Update error:', error)
    showSuccessMessage('Failed to update profile: ' + error.message)
  } finally {
    isLoading.value = false
    router.push('/profileview')
  }

}

// Navigation with refresh
const goBack = () => {
  // Use replace to force a fresh navigation to profileview
  router.replace({
    name: 'profileview',
    query: { refreshed: Date.now() }
  })
}

onMounted(() => {
  loadUserData()
})
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat density="comfortable" color="#5ca3eb">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6"><strong>Account Settings</strong></v-toolbar-title>
    </v-app-bar>

    <v-main>
      <!-- Success Snackbar -->
      <v-snackbar v-model="showSuccess" :timeout="3000" color="success" location="top">
        {{ successMessage }}
        <template v-slot:actions>
          <v-btn color="white" variant="text" @click="showSuccess = false">
            Close
          </v-btn>
        </template>
      </v-snackbar>

      <v-container>
        <!-- Profile Picture Section -->
        <v-card class="mb-5">
          <v-card-title>Profile Picture</v-card-title>
          <v-card-text class="text-center">
            <v-avatar size="120" color="grey-lighten-3" class="mb-4">
              <v-img v-if="avatarUrl" :src="avatarUrl" cover />
              <v-icon v-else size="60">mdi-account</v-icon>
            </v-avatar>
            <br>
            <v-btn color="primary" @click="showPicker = true" :loading="uploading">
              Change Picture
            </v-btn>
          </v-card-text>
        </v-card>

        <!-- Profile Information Form -->
        <v-card>
          <v-card-title>Profile Information</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="saveProfile">
              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="formData.firstName"
                    label="First Name"
                    variant="outlined"
                    required
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="formData.lastName"
                    label="Last Name"
                    variant="outlined"
                    required
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="formData.email"
                    label="Email"
                    type="email"
                    variant="outlined"
                    disabled
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="formData.phone"
                    label="Phone Number"
                    variant="outlined"
                    placeholder="+63 XXX XXX XXXX"
                  />
                </v-col>
                <v-col cols="12" class="text-right">
                  <v-btn
                    type="submit"
                    color="primary"
                    size="large"
                  >
                    <v-icon v-if="!isLoading" class="me-2">mdi-check</v-icon>
                    {{ isLoading ? 'Saved' : 'Save Changes' }}
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>

    <!-- Bottom Sheet for image picker -->
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
.v-card {
  margin-bottom: 20px;
}

/* Success message animation */
.v-snackbar {
  z-index: 1000;
}
</style>
