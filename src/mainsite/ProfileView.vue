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
const user = ref<any>(null)
const fullName = ref<string>('')

const loadUser = async () => {
  // 1. Get logged-in user from auth
  const { data: userData, error } = await supabase.auth.getUser()

  if (error || !userData?.user) {
    console.error('No user found:', error?.message)
    return
  }

  user.value = userData.user

  // 2. Build full name from auth.user_metadata
  const first = user.value.user_metadata?.first_name || ''
  const last = user.value.user_metadata?.last_name || ''

  fullName.value = `${first} ${last}`.trim()
}

onMounted(() => {
  loadUser()
})


// Upload image to Supabase
const uploadAvatar = async (file: Blob) => {
  try {
    uploading.value = true

    // 1. Generate unique filename
    const fileName = `${Date.now()}.jpeg`
    const filePath = `avatars/${fileName}`

    // 2. Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      console.error('Upload failed:', uploadError.message)
      return
    }

    // 3. Get public URL
    const { data: publicUrlData, error: publicUrlError } = supabase
      .storage
      .from('avatars')
      .getPublicUrl(filePath)

    if (publicUrlError) {
      console.error('Failed to get public URL:', publicUrlError.message)
      return
    }

    const publicUrl = publicUrlData.publicUrl

    // 4. Get current user
    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData?.user) {
      console.error('No logged in user found:', userError?.message)
      return
    }

    // 5. Update profile with avatar_url
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userData.user.id)

    if (updateError) {
      console.error('Profile update failed:', updateError.message)
      return
    }

    // 6. Update local state
    avatarUrl.value = publicUrl
  } catch (err) {
    console.error('Unexpected error:', err)
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


// purchase sections
const purchaseSections = ['My purchases', 'On going', 'Cancelled', 'Purchased done/rated']
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
          <v-avatar size="50" color="grey-lighten-3">
            <v-img v-if="avatarUrl" :src="avatarUrl" cover />
            <v-icon v-else size="60">mdi-account</v-icon>
          </v-avatar>

          <!-- Floating Edit Button -->
          <v-btn class="edit-btn" color="primary" icon elevation="4" :loading="uploading" @click="showPicker = true">
            <v-icon class="camera-icon">mdi-camera</v-icon>
          </v-btn>
        </div>

        <!-- Profile Info -->
        <div class="profile-info">
          <!-- Full name -->
          <!-- Full name -->
          <h2 class="name">
            {{ fullName || 'Unnamed User' }}
          </h2>

          <!-- Email below -->
          <p class="email">{{ user?.email || 'No email available' }}</p>

          <!-- Actions -->
          <v-btn variant="outlined" color="primary" size="small">
            Edit / Verify Profile
          </v-btn>
          <p class="sell-link"><u>Click here to start selling</u></p>
        </div>


      </div>
      <v-divider thickness="2" class="my-4"></v-divider>
      <!-- Dropdown for Sections -->
      <v-select v-model="selectedSection" :items="purchaseSections" label="Purchase Status" variant="outlined"
        density="comfortable" />

      <!-- Show this when "My purchases" is chosen -->
      <v-expand-transition>
        <div v-if="selectedSection === 'My purchases'" class="mypurchases">
          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic1.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 1</v-card-title>
              <span class="price">₱100.00</span>
            </div>
          </v-card>

          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic1.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 2</v-card-title>
              <span class="price">₱150.00</span>
            </div>
          </v-card>

          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic3.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 3</v-card-title>
              <span class="price">₱150.00</span>
            </div>
          </v-card>
        </div>
      </v-expand-transition>

      <!-- Show this when "On going" is chosen -->
      <v-expand-transition>
        <div v-if="selectedSection === 'On going'" class="ongoing">
          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic3.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 3</v-card-title>
              <span class="price">₱100.00</span>
            </div>
          </v-card>

          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic3.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 2</v-card-title>
              <span class="price">₱150.00</span>
            </div>
          </v-card>

          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic3.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 3</v-card-title>
              <span class="price">₱150.00</span>
            </div>
          </v-card>
        </div>
      </v-expand-transition>

      <!-- Show this when "Cancelled" is chosen -->
      <v-expand-transition>
        <div v-if="selectedSection === 'Cancelled'" class="cancelled">
          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic1.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 1</v-card-title>
              <span class="price">₱100.00</span>
            </div>
          </v-card>

          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic1.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 1</v-card-title>
              <span class="price">₱150.00</span>
            </div>
          </v-card>

          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic1.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 1</v-card-title>
              <span class="price">₱150.00</span>
            </div>
          </v-card>
        </div>
      </v-expand-transition>

      <!-- Show this when "Purchased done/rated" is chosen -->
      <v-expand-transition>
        <div v-if="selectedSection === 'Purchased done/rated'" class="purchased-done">
          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic1.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 2</v-card-title>
              <span class="price">₱100.00</span>
            </div>
          </v-card>

          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic1.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 2</v-card-title>
              <span class="price">₱150.00</span>
            </div>
          </v-card>

          <v-card class="my-4 d-flex align-center pa-2" outlined>
            <div class="img-container">
              <v-img src="/public/sample_img/pic1.jpg" width="50" height="50" cover />
            </div>
            <div class="ml-4 d-flex flex-column">
              <v-card-title class="pa-0">Pic 2</v-card-title>
              <span class="price">₱150.00</span>
            </div>
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
/* Profile container */
.acc-view {
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 24px;
  background: linear-gradient(to bottom, #5ca3eb 0%, #ffffff 100%);
  border-radius: 16px;
  flex-wrap: wrap; /* allow wrapping if very small */
}

/* Avatar container */
.avatar-container {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
}

/* Floating edit button */
.edit-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  transform: translate(30%, 30%);
  border: 2px solid white;
  border-radius: 50%;
  transition: all 0.2s ease-in-out;
}
.edit-btn:hover {
  transform: translate(30%, 30%) scale(1.1);
}

/* Profile info always sits beside avatar */
.profile-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  align-items: flex-start; /* keep left aligned */
  text-align: left;
}

.name {
  margin: 0;
  font-size: 1.2rem;
}

.sell-link {
  font-size: 0.9rem;
  color: #1976d2;
  cursor: pointer;
}

/* Card responsiveness */
.v-card {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.img-container {
  flex-shrink: 0;
}

/* Camera icon */
.camera-icon {
  font-size: 22px;
}

/* Tablet */
@media (max-width: 768px) {
  .acc-view {
    padding: 16px;
    gap: 16px;
  }

  .name {
    font-size: 1.1rem;
  }

  .profile-info {
    gap: 6px;
  }

  .edit-btn {
    width: 36px;
    height: 36px;
  }

  .camera-icon {
    font-size: 20px;
  }
}

/* Mobile */
@media (max-width: 480px) {
  .acc-view {
    flex-direction: row;         /* ✅ keep avatar + info side by side */
    align-items: flex-start;     /* align top */
    gap: 12px;
  }

  .profile-info {
    align-items: flex-start;     /* ✅ text/buttons left aligned */
    text-align: left;
    flex: 1;                     /* take remaining width */
  }

 .name {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.email {
  margin: 0;
  font-size: 0.9rem;
  color: #555;
}


  .v-card {
    flex-direction: row;
    align-items: center;
    width: 100%;
  }

  .img-container v-img {
    width: 40px !important;
    height: 40px !important;
  }

  .price {
    font-size: 0.85rem;
  }

  .edit-btn {
    width: 30px;
    height: 30px;
  }

  .camera-icon {
    font-size: 18px;
  }
}
</style>
