<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

const router = useRouter()
const avatarUrl = ref<string | null>(null)
const uploading = ref(false)
const showPicker = ref(false) // bottom sheet control

const goBack = () => router.back()

// Load profile
const loadProfile = async () => {
  const { data, error } = await supabase.from('profiles').select('avatar_url').single()
  if (!error) avatarUrl.value = data?.avatar_url || null
}

// Upload image to Supabase
const uploadAvatar = async (file: Blob) => {
  try {
    uploading.value = true
    const fileName = `${Date.now()}.jpeg`
    const filePath = `avatars/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })
    if (uploadError) throw uploadError

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(filePath)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', (await supabase.auth.getUser()).data.user?.id)
    if (updateError) throw updateError

    avatarUrl.value = publicUrl
  } catch (err) {
    console.error('Upload error:', err)
  } finally {
    uploading.value = false
  }
}

// Pick image from camera/gallery
const pickImage = async (source: 'camera' | 'gallery') => {
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
}

onMounted(loadProfile)

// purchase sections
const purchaseSections = [
  'My purchases',
  'On going',
  'Cancelled',
  'Purchased done/rated'
]
const selectedSection = ref(purchaseSections[0]) // default = "My purchases"
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat color="transparent" density="comfortable">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6"><strong>Profile</strong></v-toolbar-title>
    </v-app-bar>

    <v-divider />

    <!-- Main Profile Content -->
   <v-main>
  <div class="acc-view">
    <div class="avatar-container">
      <!-- Avatar -->
      <v-avatar size="120" color="grey-lighten-3">
        <v-img v-if="avatarUrl" :src="avatarUrl" cover />
        <v-icon v-else size="60">mdi-account</v-icon>
      </v-avatar>

      <!-- Floating Edit Button -->
      <v-btn
        class="edit-btn"
        color="primary"
        size="small"
        icon
        :loading="uploading"
        @click="showPicker = true"
      >
        <v-icon>mdi-camera</v-icon>
      </v-btn>
    </div>

    <!-- Profile Info -->
    <div class="profile-info">
      <h2 class="name">Full Name</h2>
      <v-btn variant="outlined" color="primary" size="small">Edit / Verify Profile</v-btn>
      <p class="sell-link"><u>Click here to start selling</u></p>
    </div>
  </div>

  <v-divider thickness="2" class="my-4"></v-divider>

  <!-- Dropdown for Sections -->
  <v-select
    v-model="selectedSection"
    :items="purchaseSections"
    label="Purchase Status"
    variant="outlined"
    density="comfortable"
  ></v-select>

  <!-- Show content depending on selection -->
  <v-expand-transition>
    <div v-if="selectedSection">
      <v-card class="my-4" outlined>
        <v-card-title>{{ selectedSection }}</v-card-title>
        <v-card-subtitle>Sample item 1</v-card-subtitle>
      </v-card>
      <v-card class="my-2" outlined>
        <v-card-title>{{ selectedSection }}</v-card-title>
        <v-card-subtitle>Sample item 2</v-card-subtitle>
      </v-card>
    </div>
  </v-expand-transition>
</v-main>


    <!-- Bottom Sheet for options -->
    <v-bottom-sheet v-model="showPicker">
      <v-list>
        <v-list-item @click="pickImage('camera')">
          <v-list-item-icon>
            <v-icon>mdi-camera</v-icon>
          </v-list-item-icon>
          <v-list-item-title>Take Photo</v-list-item-title>
        </v-list-item>

        <v-list-item @click="pickImage('gallery')">
          <v-list-item-icon>
            <v-icon>mdi-image</v-icon>
          </v-list-item-icon>
          <v-list-item-title>Choose from Gallery</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-bottom-sheet>
  </v-app>
</template>

<style scoped>
.acc-view {
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 24px;
  background: linear-gradient(to bottom, #5ca3eb 0%, #ffffff 100%);
  border-radius: 16px;
}

.avatar-container {
  position: relative;
  display: inline-block;
}

.edit-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  transform: translate(25%, 25%);
  border: 2px solid white;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.name {
  margin: 0;
}

.sell-link {
  font-size: 0.9rem;
  color: #1976d2;
  cursor: pointer;
}
</style>
