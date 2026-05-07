<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'
import { withSchemaColumnFallback } from '@/utils/supabaseSchema'
import {
  getAuthUserAvatarUrl,
  getAuthUserDisplayName,
  getProfileDisplayName,
  normalizeIdentityText,
} from '@/utils/accountIdentity'

const router = useRouter()
const authStore = useAuthUserStore()

const showPicker = ref(false)
const isLoadingProfile = ref(true)
const isSaving = ref(false)
const uploading = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')
const snackbarColor = ref('success')
const primaryAuthProvider = ref('email')
const originalEmail = ref('')
const addressSummary = ref('No saved address yet. Add one to manage delivery contact numbers.')
const avatarPublicUrl = ref('')
const avatarVersion = ref(Date.now())
const PROFILE_SELECT = '*'

const formData = ref({
  fullName: '',
  email: '',
})

const showSuccessMessage = (message, color = 'success') => {
  successMessage.value = message
  snackbarColor.value = color
  showSuccess.value = true
}

const hideSuccessMessageLater = (timeout = 3000) => {
  window.setTimeout(() => {
    showSuccess.value = false
  }, timeout)
}

const getPrimaryAuthProvider = (user) =>
  normalizeIdentityText(user?.app_metadata?.provider || user?.identities?.[0]?.provider || 'email')
    .toLowerCase() || 'email'

const providerLabel = computed(() => {
  if (primaryAuthProvider.value === 'google') return 'Google'
  if (primaryAuthProvider.value === 'email') return 'Email & Password'

  return primaryAuthProvider.value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
})

const isEmailReadOnly = computed(() => primaryAuthProvider.value !== 'email')

const emailHint = computed(() =>
  isEmailReadOnly.value
    ? `Email is managed by your ${providerLabel.value} sign-in.`
    : 'Changing your email will require verification before it fully updates.',
)

const avatarPreviewUrl = computed(() => {
  const baseUrl = normalizeIdentityText(avatarPublicUrl.value)
  if (!baseUrl) return ''

  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}t=${avatarVersion.value}`
})

const displayInitials = computed(() => {
  const source = normalizeIdentityText(formData.value.fullName || formData.value.email)
  if (!source) return 'U'

  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
})

const isSaveDisabled = computed(
  () =>
    isLoadingProfile.value ||
    isSaving.value ||
    uploading.value ||
    !normalizeIdentityText(formData.value.fullName) ||
    !normalizeIdentityText(formData.value.email),
)

const buildAddressSummary = (address) => {
  if (!address) {
    return 'No saved address yet. Add one to manage delivery contact numbers.'
  }

  const parts = [
    address.house_no,
    address.building,
    address.street,
    address.purok ? `Purok ${address.purok}` : '',
    address.barangay_name,
    address.city_name,
    address.province_name,
  ]
    .map((part) => normalizeIdentityText(part))
    .filter(Boolean)

  if (!parts.length) {
    return 'Saved address found. Open My Addresses to manage contact numbers.'
  }

  return parts.join(', ')
}

const getProfileFullName = (profile) => normalizeIdentityText(getProfileDisplayName(profile))

const splitFullName = (value) => {
  const normalized = normalizeIdentityText(value)
  if (!normalized) {
    return { firstName: '', lastName: '' }
  }

  const parts = normalized.split(/\s+/).filter(Boolean)

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: '',
    }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

const loadAddressSummary = async (userId) => {
  const { data, error } = await supabase
    .from('addresses')
    .select(
      'house_no, building, street, purok, barangay_name, city_name, province_name, is_default, updated_at',
    )
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Error loading address summary:', error)
    addressSummary.value = 'Unable to load your saved addresses right now.'
    return
  }

  addressSummary.value = buildAddressSummary(data)
}

const fetchProfileRecord = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

const resolveAuthUser = async () => {
  if (authStore.userData?.id) {
    return authStore.userData
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error

  return user
}

const populateFormState = ({ authUser, profile }) => {
  const profileName = normalizeIdentityText(profile?.full_name) || getProfileFullName(profile)
  const authName = normalizeIdentityText(getAuthUserDisplayName(authUser))
  const fallbackName = normalizeIdentityText(authUser.email)?.split('@')[0] || ''
  const resolvedAvatarUrl =
    normalizeIdentityText(profile?.avatar_url) || normalizeIdentityText(getAuthUserAvatarUrl(authUser))
  const resolvedEmail = normalizeIdentityText(profile?.email) || normalizeIdentityText(authUser.email)

  formData.value.fullName = profileName || authName || fallbackName
  formData.value.email = resolvedEmail
  originalEmail.value = formData.value.email
  avatarPublicUrl.value = resolvedAvatarUrl
  avatarVersion.value = Date.now()
  primaryAuthProvider.value = getPrimaryAuthProvider(authUser)
}

const applyLocalProfileState = ({ authUser = null, profile = null }) => {
  if (authUser) {
    authStore.userData = {
      ...(authStore.userData || {}),
      ...authUser,
      user_metadata: {
        ...(authStore.userData?.user_metadata || {}),
        ...(authUser.user_metadata || {}),
      },
    }
  }

  if (profile) {
    authStore.profile = {
      ...(authStore.profile || {}),
      ...profile,
    }
  }

  if (authStore.userData?.id) {
    populateFormState({
      authUser: authStore.userData,
      profile: authStore.profile,
    })
  }
}

const loadProfileEditor = async () => {
  try {
    isLoadingProfile.value = true

    let authUser = authStore.userData
    if (!authUser?.id) {
      await authStore.hydrateFromSession()
      authUser = authStore.userData
    }

    if (!authUser?.id) {
      router.replace({ name: 'login' })
      return
    }

    let profile = await fetchProfileRecord(authUser.id)
    if (!profile?.id) {
      profile = await authStore.loadProfile(authUser.id, authUser)
    }

    applyLocalProfileState({ authUser, profile })
    populateFormState({ authUser, profile })
    await loadAddressSummary(authUser.id)
  } catch (error) {
    console.error('Error loading edit profile page:', error)
    showSuccessMessage('Unable to load your profile right now. Please try again.', 'error')
  } finally {
    isLoadingProfile.value = false
  }
}

const updateAvatarReferences = (publicUrl) => {
  avatarPublicUrl.value = publicUrl
  avatarVersion.value = Date.now()
}

async function uploadAvatar(file) {
  if (!file) return

  try {
    uploading.value = true
    const authUser = await resolveAuthUser()
    const trimmedFullName = normalizeIdentityText(formData.value.fullName)
    const { firstName, lastName } = splitFullName(trimmedFullName)

    if (!authUser?.id) {
      throw new Error('No authenticated user found')
    }

    const fileExtension = normalizeIdentityText(file.name?.split('.').pop()) || 'jpg'
    const filePath = `${authUser.id}/${Date.now()}.${fileExtension}`

    const { data: uploadData, error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, {
      upsert: true,
      cacheControl: '3600',
    })

    if (uploadError) throw uploadError

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(uploadData?.path || filePath)

    const [profileUpdate, authUpdate] = await Promise.allSettled([
      withSchemaColumnFallback({
        payload: {
          avatar_url: publicUrl,
          first_name: firstName || null,
          last_name: lastName || null,
          email:
            normalizeIdentityText(authStore.profile?.email) || normalizeIdentityText(authUser.email) || null,
          full_name: trimmedFullName || null,
          updated_at: new Date().toISOString(),
        },
        requiredColumns: ['avatar_url', 'first_name', 'last_name'],
        execute: (currentPayload) =>
          supabase
            .from('profiles')
            .update(currentPayload)
            .eq('id', authUser.id)
            .select(PROFILE_SELECT)
            .single(),
      }),
      supabase.auth.updateUser({
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: trimmedFullName,
          avatar_url: publicUrl,
        },
      }),
    ])

    if (profileUpdate.status === 'rejected' || profileUpdate.value?.error) {
      const profileError =
        profileUpdate.status === 'rejected' ? profileUpdate.reason : profileUpdate.value.error
      throw profileError
    }

    if (authUpdate.status === 'rejected' || authUpdate.value?.error) {
      console.warn(
        'Auth metadata avatar update failed. Continuing with profiles avatar as source of truth.',
        authUpdate.status === 'rejected' ? authUpdate.reason : authUpdate.value.error,
      )
    }

    updateAvatarReferences(publicUrl)
    applyLocalProfileState({
      authUser:
        authUpdate.status === 'fulfilled' && authUpdate.value?.data?.user
          ? authUpdate.value.data.user
          : {
              ...authUser,
              user_metadata: {
                ...(authUser.user_metadata || {}),
                first_name: firstName,
                last_name: lastName,
                full_name: trimmedFullName,
                avatar_url: publicUrl,
              },
            },
      profile:
        profileUpdate.status === 'fulfilled' && profileUpdate.value?.data
          ? profileUpdate.value.data
          : {
              ...(authStore.profile || {}),
              avatar_url: publicUrl,
            },
    })
    showSuccessMessage('Profile picture updated successfully!')
    hideSuccessMessageLater()
  } catch (error) {
    console.error('Error uploading avatar:', error)
    const uploadMessage = String(error?.message || '')

    if (uploadMessage.toLowerCase().includes('row-level security')) {
      showSuccessMessage(
        'Avatar uploads are blocked by Supabase storage permissions. Run the new avatars bucket migration, then try again.',
        'error',
      )
    } else {
      showSuccessMessage('Failed to upload profile picture. Please try again.', 'error')
    }
    hideSuccessMessageLater()
  } finally {
    uploading.value = false
  }
}

const pickImage = async (source) => {
  try {
    showPicker.value = false

    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      width: 500,
      height: 500,
      correctOrientation: true,
    })

    if (!photo?.dataUrl) return

    const response = await fetch(photo.dataUrl)
    const blob = await response.blob()
    const file = new File([blob], `avatar-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })

    await uploadAvatar(file)
  } catch (error) {
    const message = String(error?.message || '')

    if (message.includes('User cancelled') || message === 'User cancelled photos app') {
      return
    }

    if (message.includes('No photos')) {
      showSuccessMessage('No photos found in gallery.', 'warning')
    } else if (message.includes('Permission')) {
      showSuccessMessage('Camera permission is required to change your profile photo.', 'warning')
    } else {
      console.error('Error selecting profile image:', error)
      showSuccessMessage('Failed to select image. Please try again.', 'error')
    }

    hideSuccessMessageLater()
  }
}

const saveProfile = async () => {
  const trimmedFullName = normalizeIdentityText(formData.value.fullName)
  const trimmedEmail = normalizeIdentityText(formData.value.email)

  if (!trimmedFullName) {
    showSuccessMessage('Name is required.', 'error')
    hideSuccessMessageLater()
    return
  }

  if (!trimmedEmail) {
    showSuccessMessage('Email is required.', 'error')
    hideSuccessMessageLater()
    return
  }

  try {
    isSaving.value = true

    const authUser = await resolveAuthUser()
    if (!authUser?.id) {
      throw new Error('User not authenticated')
    }

    const { firstName, lastName } = splitFullName(trimmedFullName)
    const avatarUrl = normalizeIdentityText(avatarPublicUrl.value) || null

    const [profileUpdate, authMetadataUpdate] = await Promise.allSettled([
      withSchemaColumnFallback({
        payload: {
          email: trimmedEmail || null,
          first_name: firstName || null,
          last_name: lastName || null,
          full_name: trimmedFullName || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        },
        requiredColumns: ['first_name', 'last_name', 'avatar_url'],
        execute: (currentPayload) =>
          supabase
            .from('profiles')
            .update(currentPayload)
            .eq('id', authUser.id)
            .select(PROFILE_SELECT)
            .single(),
      }),
      supabase.auth.updateUser({
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: trimmedFullName,
          avatar_url: avatarUrl || '',
        },
      }),
    ])

    if (profileUpdate.status === 'rejected' || profileUpdate.value?.error) {
      throw (profileUpdate.status === 'rejected' ? profileUpdate.reason : profileUpdate.value.error)
    }

    if (authMetadataUpdate.status === 'rejected' || authMetadataUpdate.value?.error) {
      console.warn(
        'Auth metadata name update failed. Continuing with profiles as source of truth.',
        authMetadataUpdate.status === 'rejected'
          ? authMetadataUpdate.reason
          : authMetadataUpdate.value.error,
      )
    }

    let emailChanged = false
    let latestAuthUser =
      authMetadataUpdate.status === 'fulfilled' && authMetadataUpdate.value?.data?.user
        ? authMetadataUpdate.value.data.user
        : authUser

    if (!isEmailReadOnly.value && trimmedEmail !== originalEmail.value) {
      const { data: emailUpdateData, error: emailUpdateError } = await supabase.auth.updateUser({
        email: trimmedEmail,
      })

      if (emailUpdateError) throw emailUpdateError
      emailChanged = true

      if (emailUpdateData?.user) {
        latestAuthUser = emailUpdateData.user
      }
    }

    const updatedProfile = profileUpdate.value.data

    applyLocalProfileState({
      authUser: {
        ...latestAuthUser,
        user_metadata: {
          ...(latestAuthUser?.user_metadata || {}),
          first_name: firstName,
          last_name: lastName,
          full_name: trimmedFullName,
          avatar_url: avatarUrl || '',
        },
      },
      profile: updatedProfile,
    })

    updateAvatarReferences(updatedProfile?.avatar_url || avatarUrl || '')

    showSuccessMessage(
      emailChanged
        ? 'Profile updated. Please verify your new email address.'
        : 'Profile updated successfully!',
    )

    await router.replace({
      name: 'profileview',
      query: { refreshed: Date.now() },
    })
  } catch (error) {
    console.error('Error saving profile:', error)
    showSuccessMessage(`Failed to update profile: ${error?.message || 'Unknown error'}`, 'error')
    hideSuccessMessageLater()
  } finally {
    isSaving.value = false
  }
}

const goToAddressBook = () => {
  router.push({ name: 'my-address' })
}

const goBack = () => {
  router.replace({
    name: 'profileview',
    query: { refreshed: Date.now() },
  })
}

onMounted(() => {
  loadProfileEditor()
})
</script>

<template>
  <v-app>
    <v-app-bar flat elevation="0" class="top-nav" color="#3f83c7">
      <v-btn variant="text" icon @click="goBack" class="back-btn" :disabled="isSaving || uploading">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="font-bold">
        <strong>Edit Profile</strong>
      </v-toolbar-title>
      <v-spacer />
      <v-chip size="small" variant="flat" color="white" class="provider-chip">
        {{ providerLabel }}
      </v-chip>
    </v-app-bar>

    <v-main class="modern-font profile-page">
      <v-snackbar v-model="showSuccess" :timeout="3000" :color="snackbarColor" location="top">
        {{ successMessage }}
        <template #actions>
          <v-btn color="white" variant="text" @click="showSuccess = false">Close</v-btn>
        </template>
      </v-snackbar>

      <v-container class="profile-container">
        <v-row justify="center">
          <v-col cols="12" md="8" lg="6">
            <v-card class="avatar-card" flat>
              <v-card-text class="d-flex flex-column align-center text-center py-8">
                <div class="avatar-container">
                  <v-avatar size="124" class="profile-avatar">
                    <v-img v-if="avatarPreviewUrl" :src="avatarPreviewUrl" cover />
                    <span v-else class="avatar-fallback">{{ displayInitials }}</span>
                  </v-avatar>

                  <v-btn
                    icon
                    size="small"
                    color="white"
                    class="edit-btn"
                    elevation="4"
                    @click="showPicker = true"
                    :loading="uploading"
                    :disabled="uploading || isLoadingProfile"
                  >
                    <v-icon size="18" color="#2f6ca9">mdi-camera</v-icon>
                  </v-btn>
                </div>

                <div class="text-h6 font-weight-bold mt-4">
                  {{ formData.fullName || 'Your profile' }}
                </div>
                <div class="text-body-2 text-white opacity-90">
                  Keep your account details current and manage contact numbers from your saved
                  addresses.
                </div>
              </v-card-text>
            </v-card>

            <v-card class="form-card elevation-3">
              <v-card-title class="section-title">Profile Details</v-card-title>
              <v-card-text>
                <div v-if="isLoadingProfile" class="loading-state">
                  <v-progress-circular indeterminate color="primary" size="36" width="3" />
                  <p class="loading-text">Loading your profile...</p>
                </div>

                <v-form v-else @submit.prevent="saveProfile" class="profile-form">
                  <v-text-field
                    v-model="formData.fullName"
                    label="Full Name"
                    variant="outlined"
                    prepend-inner-icon="mdi-account-outline"
                    placeholder="Enter your full name"
                    :disabled="isSaving"
                    :rules="[(value) => !!value?.trim() || 'Name is required']"
                  />

                  <v-text-field
                    v-model="formData.email"
                    label="Email"
                    type="email"
                    variant="outlined"
                    prepend-inner-icon="mdi-email-outline"
                    :readonly="isEmailReadOnly"
                    :disabled="isSaving"
                    :hint="emailHint"
                    persistent-hint
                  />

                  <div class="contact-card">
                    <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 12px;">
                      <div>
                        <div class="text-subtitle-1 font-weight-bold">Contact Numbers</div>
                        <div class="text-body-2 text-medium-emphasis">
                          Phone numbers for checkout and deliveries are managed from My Addresses.
                        </div>
                        <div class="text-caption text-medium-emphasis mt-2">
                          {{ addressSummary }}
                        </div>
                      </div>

                      <v-btn
                        color="primary"
                        variant="tonal"
                        @click="goToAddressBook"
                        :disabled="isSaving"
                      >
                        <v-icon start>mdi-map-marker-outline</v-icon>
                        Open My Addresses
                      </v-btn>
                    </div>
                  </div>

                  <div class="action-row">
                    <v-btn
                      type="submit"
                      color="primary"
                      size="large"
                      class="save-btn"
                      :loading="isSaving"
                      :disabled="isSaveDisabled"
                    >
                      <v-icon start>mdi-content-save-outline</v-icon>
                      {{ isSaving ? 'Saving...' : 'Save Changes' }}
                    </v-btn>

                    <v-btn
                      variant="outlined"
                      size="large"
                      class="cancel-btn"
                      :disabled="isSaving || uploading"
                      @click="goBack"
                    >
                      Cancel
                    </v-btn>
                  </div>
                </v-form>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>

    <v-bottom-sheet v-model="showPicker" inset>
      <v-card class="bottom-sheet-card" rounded="t-xl">
        <v-card-title class="d-flex justify-space-between align-center pa-4">
          <span class="text-h6 font-weight-bold">Change Profile Photo</span>
          <v-btn icon @click="showPicker = false" variant="text">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-divider />

        <v-list class="py-0">
          <v-list-item @click="pickImage('camera')" class="pa-4 list-item-action">
            <template #prepend>
              <v-avatar color="primary" variant="tonal" size="40" rounded>
                <v-icon color="primary">mdi-camera</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title class="font-weight-medium">Take Photo</v-list-item-title>
            <v-list-item-subtitle>Use your camera to take a new photo</v-list-item-subtitle>
          </v-list-item>

          <v-divider />

          <v-list-item @click="pickImage('gallery')" class="pa-4 list-item-action">
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
          <v-btn block variant="text" @click="showPicker = false" class="cancel-sheet-btn">
            Cancel
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-bottom-sheet>
  </v-app>
</template>

<style scoped>
:root {
  --sat: env(safe-area-inset-top);
}

.top-nav {
  padding-top: env(safe-area-inset-top);
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

@supports (padding-top: env(safe-area-inset-top)) {
  .top-nav {
    padding-top: env(safe-area-inset-top);
    height: calc(56px + env(safe-area-inset-top)) !important;
  }
}

@supports (padding-top: constant(safe-area-inset-top)) {
  .top-nav {
    padding-top: constant(safe-area-inset-top);
    height: calc(56px + constant(safe-area-inset-top)) !important;
  }
}

.top-nav :deep(.v-toolbar__content) {
  height: 56px !important;
  padding-top: 0 !important;
}

.top-nav :deep(.v-toolbar-title) {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.top-nav :deep(.v-btn) {
  color: white !important;
}

.provider-chip {
  color: #2f6ca9 !important;
  font-weight: 700;
}

.modern-font {
  font-family: 'Inter', 'Roboto', 'Helvetica Neue', sans-serif;
}

.profile-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(63, 131, 199, 0.2), transparent 35%),
    linear-gradient(180deg, #eef4fb 0%, #f7f9fc 48%, #ffffff 100%);
}

.profile-container {
  padding-top: 24px;
  padding-bottom: 32px;
}

.avatar-card {
  background: linear-gradient(145deg, #5276b0, #354d7c);
  color: white;
  border-radius: 22px;
  overflow: visible;
  margin-bottom: 20px;
}

.avatar-container {
  position: relative;
  display: inline-flex;
}

.profile-avatar {
  background: rgba(255, 255, 255, 0.2);
  border: 4px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 14px 32px rgba(27, 54, 99, 0.28);
}

.avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 2rem;
  font-weight: 700;
  color: white;
}

.edit-btn {
  position: absolute;
  right: -8px;
  bottom: -8px;
  border: 2px solid white;
}

.form-card {
  border-radius: 22px;
  border: 1px solid rgba(63, 131, 199, 0.08);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(6px);
}

.section-title {
  padding: 22px 24px 0;
  font-weight: 700;
  color: #27436b;
}

.profile-form {
  display: grid;
  gap: 18px;
}

.loading-state {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.loading-text {
  margin: 0;
  color: #607086;
}

.contact-card {
  border-radius: 18px;
  border: 1px solid rgba(63, 131, 199, 0.14);
  background: linear-gradient(135deg, rgba(63, 131, 199, 0.08), rgba(82, 118, 176, 0.04));
  padding: 18px;
}

.action-row {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.save-btn,
.cancel-btn,
.cancel-sheet-btn {
  min-height: 46px;
  border-radius: 12px;
  text-transform: none;
  font-weight: 700;
}

.bottom-sheet-card {
  border-radius: 22px 22px 0 0 !important;
}

.list-item-action {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.list-item-action:hover {
  background-color: #f8fafc;
}

@media (max-width: 600px) {
  .profile-container {
    padding-top: 16px;
  }

  .section-title {
    padding: 20px 18px 0;
  }

  .contact-card {
    padding: 16px;
  }

  .action-row {
    flex-direction: column;
  }

  .save-btn,
  .cancel-btn {
    width: 100%;
  }
}
</style>
