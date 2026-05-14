<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { useDisplay } from 'vuetify'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'
import { withSchemaColumnFallback } from '@/utils/supabaseSchema'
import { deactivateCurrentPushToken } from '@/utils/mobilePushNotifications'
import {
  getAuthUserAvatarUrl,
  getAuthUserDisplayName,
  getProfileDisplayName,
  normalizeIdentityText,
} from '@/utils/accountIdentity'

const router = useRouter()
const authStore = useAuthUserStore()
const isNativePlatform = Capacitor.isNativePlatform()
const { smAndDown } = useDisplay()

const showPicker = ref(false)
const showCameraDialog = ref(false)
const cameraFacingMode = ref('user')
const isLoadingProfile = ref(true)
const isSaving = ref(false)
const uploading = ref(false)
const isCameraStarting = ref(false)
const showSuccess = ref(false)
const successMessage = ref('')
const snackbarColor = ref('success')
const showDeleteAccountDialog = ref(false)
const deleteAccountConfirmation = ref('')
const primaryAuthProvider = ref('email')
const originalEmail = ref('')
const addressSummary = ref('No saved address yet. Add one to manage delivery contact numbers.')
const avatarPublicUrl = ref('')
const avatarVersion = ref(Date.now())
const isDeletingAccount = ref(false)
const cameraVideo = ref(null)
const PROFILE_SELECT = '*'
const DELETE_ACCOUNT_CONFIRMATION_TEXT = 'DELETE'
let cameraStream = null
let cameraSessionId = 0

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

const stopStreamTracks = (stream) => {
  stream?.getTracks?.().forEach((track) => track.stop())
}

const cleanupCameraStream = () => {
  cameraSessionId += 1
  stopStreamTracks(cameraStream)
  cameraStream = null

  if (cameraVideo.value) {
    cameraVideo.value.pause?.()
    cameraVideo.value.srcObject = null
  }

  isCameraStarting.value = false
}

const closeCameraDialog = () => {
  cleanupCameraStream()
  cameraFacingMode.value = 'user'
  showCameraDialog.value = false
}

const requestCameraStream = async (preferredFacingMode) => {
  const constraintsList = [
    {
      video: {
        facingMode: {
          ideal: preferredFacingMode,
        },
      },
      audio: false,
    },
    {
      video: {
        facingMode: preferredFacingMode,
      },
      audio: false,
    },
    {
      video: true,
      audio: false,
    },
  ]

  let lastError = null

  for (const constraints of constraintsList) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Unable to access camera')
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

const activeCameraLabel = computed(() =>
  cameraFacingMode.value === 'user' ? 'Front camera' : 'Rear camera',
)

const isSaveDisabled = computed(
  () =>
    isLoadingProfile.value ||
    isSaving.value ||
    uploading.value ||
    isDeletingAccount.value ||
    !normalizeIdentityText(formData.value.fullName) ||
    !normalizeIdentityText(formData.value.email),
)

const isDeleteAccountConfirmationValid = computed(
  () =>
    normalizeIdentityText(deleteAccountConfirmation.value).toUpperCase() ===
    DELETE_ACCOUNT_CONFIRMATION_TEXT,
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

const pickImageWithSystemCamera = async (source) => {
  try {
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

const openCameraDialog = async (preferredFacingMode = cameraFacingMode.value) => {
  showPicker.value = false

  if (!navigator.mediaDevices?.getUserMedia) {
    showSuccessMessage('Camera is not supported on this device. Please try another browser.', 'warning')
    hideSuccessMessageLater()
    return
  }

  showCameraDialog.value = true
  cameraFacingMode.value = preferredFacingMode
  cleanupCameraStream()
  const sessionId = ++cameraSessionId

  try {
    isCameraStarting.value = true

    const stream = await requestCameraStream(preferredFacingMode)

    if (cameraSessionId !== sessionId) {
      stopStreamTracks(stream)
      return
    }

    cameraStream = stream
    showCameraDialog.value = true

    await nextTick()

    if (cameraSessionId !== sessionId || !cameraVideo.value) {
      stopStreamTracks(stream)
      return
    }

    cameraVideo.value.srcObject = stream
    await cameraVideo.value.play()
  } catch (error) {
    if (cameraSessionId === sessionId) {
      const message = String(error?.message || '')

      if (error?.name === 'NotAllowedError' || message.includes('Permission')) {
        showSuccessMessage('Camera permission is required to change your profile photo.', 'warning')
      } else if (error?.name === 'NotFoundError') {
        showSuccessMessage('No camera was found on this device.', 'warning')
      } else {
        console.error('Error opening profile camera:', error)
        showSuccessMessage('Failed to open the camera. Please try again.', 'error')
      }

      showCameraDialog.value = false
      cameraFacingMode.value = 'user'
      hideSuccessMessageLater()
    }
  } finally {
    if (cameraSessionId === sessionId) {
      isCameraStarting.value = false
    }
  }
}

const toggleCameraFacingMode = async () => {
  if (isCameraStarting.value || uploading.value) {
    return
  }

  const nextFacingMode = cameraFacingMode.value === 'user' ? 'environment' : 'user'
  await openCameraDialog(nextFacingMode)
}

const captureCameraPhoto = async () => {
  if (!cameraVideo.value?.videoWidth || !cameraVideo.value?.videoHeight) {
    showSuccessMessage('Camera is still loading. Please try again in a moment.', 'warning')
    hideSuccessMessageLater()
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = cameraVideo.value.videoWidth
  canvas.height = cameraVideo.value.videoHeight

  const context = canvas.getContext('2d')
  if (!context) {
    showSuccessMessage('Unable to capture a photo right now. Please try again.', 'error')
    hideSuccessMessageLater()
    return
  }

  if (cameraFacingMode.value === 'user') {
    context.translate(canvas.width, 0)
    context.scale(-1, 1)
  }

  context.drawImage(cameraVideo.value, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9)
  })

  if (!blob) {
    showSuccessMessage('Unable to capture a photo right now. Please try again.', 'error')
    hideSuccessMessageLater()
    return
  }

  const file = new File([blob], `avatar-${Date.now()}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })

  closeCameraDialog()
  await uploadAvatar(file)
}

const pickImage = async (source) => {
  showPicker.value = false

  if (source === 'camera' && !isNativePlatform) {
    await openCameraDialog()
    return
  }

  await pickImageWithSystemCamera(source)
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

const handleRefresh = async () => {
  await loadProfileEditor()
}

const openDeleteAccountDialog = () => {
  if (isSaving.value || uploading.value || isDeletingAccount.value) {
    return
  }

  deleteAccountConfirmation.value = ''
  showDeleteAccountDialog.value = true
}

const closeDeleteAccountDialog = () => {
  if (isDeletingAccount.value) {
    return
  }

  showDeleteAccountDialog.value = false
  deleteAccountConfirmation.value = ''
}

const deleteAccount = async () => {
  if (!isDeleteAccountConfirmationValid.value || isDeletingAccount.value) {
    return
  }

  try {
    isDeletingAccount.value = true

    const authUser = await resolveAuthUser()
    if (!authUser?.id) {
      throw new Error('User not authenticated')
    }

    await deactivateCurrentPushToken(authUser.id)

    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: {
        confirmDelete: true,
      },
    })

    if (error) {
      throw error
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Account deletion failed.')
    }

    localStorage.removeItem('lastCreatedShopId')
    showDeleteAccountDialog.value = false
    deleteAccountConfirmation.value = ''

    try {
      await authStore.forceLogout()
    } catch (signOutError) {
      console.warn('Account was deleted but local sign-out cleanup failed:', signOutError)
      authStore.$reset?.()
    }

    await router.replace({
      name: 'login',
      query: { accountDeleted: Date.now() },
    })
  } catch (error) {
    console.error('Error deleting account:', error)
    showSuccessMessage(
      `Failed to delete account: ${error?.message || 'Unknown error'}`,
      'error',
    )
    hideSuccessMessageLater()
  } finally {
    isDeletingAccount.value = false
  }
}

const goBack = () => {
  closeCameraDialog()
  showPicker.value = false

  router.replace({
    name: 'profileview',
    query: { refreshed: Date.now() },
  })
}

watch(showCameraDialog, (isOpen) => {
  if (!isOpen) {
    cleanupCameraStream()
  }
})

onBeforeRouteLeave(() => {
  closeCameraDialog()
  showPicker.value = false
})

onBeforeUnmount(() => {
  closeCameraDialog()
  showPicker.value = false
})

onMounted(() => {
  loadProfileEditor()
})
</script>

<template>
  <v-app>
    <v-app-bar class="app-bar" flat color="#3f83c7" dark density="comfortable">
      <v-btn
        variant="text"
        icon
        @click="goBack"
        class="back-btn"
        :disabled="isSaving || uploading || isDeletingAccount"
      >
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
      <PullToRefreshWrapper
        :on-refresh="handleRefresh"
        :disabled="isLoadingProfile || isSaving || uploading || isDeletingAccount || isCameraStarting || showCameraDialog"
      >
      <v-snackbar v-model="showSuccess" :timeout="3000" :color="snackbarColor" location="top">
        {{ successMessage }}
        <template #actions>
          <v-btn color="white" variant="text" @click="showSuccess = false">Close</v-btn>
        </template>
      </v-snackbar>

      <v-container class="profile-container pt-12">
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
                      :disabled="isSaving || isDeletingAccount"
                    >
                      <v-icon start>mdi-map-marker-outline</v-icon>
                      Open My Addresses
                    </v-btn>
                  </div>
                  </div>

                  <div class="danger-card">
                    <div class="danger-copy">
                      <div class="text-subtitle-1 font-weight-bold">Delete Account</div>
                      <div class="text-body-2 text-medium-emphasis">
                        This permanently disables your CloseShop account, removes saved addresses,
                        cart items, notifications, and reviews, anonymizes your profile, and hides
                        any owned shop from the marketplace.
                      </div>
                    </div>

                    <v-btn
                      color="error"
                      variant="outlined"
                      @click="openDeleteAccountDialog"
                      :disabled="isSaving || uploading || isDeletingAccount"
                    >
                      <v-icon start>mdi-delete-alert-outline</v-icon>
                      Delete Account
                    </v-btn>
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
                      :disabled="isSaving || uploading || isDeletingAccount"
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
      </PullToRefreshWrapper>
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

    <v-dialog
      v-model="showCameraDialog"
      max-width="520"
      :fullscreen="smAndDown"
      scrim="#02060d"
      transition="dialog-bottom-transition"
    >
      <div class="camera-shell" :class="{ 'camera-shell--mobile': smAndDown }">
        <div class="camera-stage">
          <video
            ref="cameraVideo"
            class="camera-preview"
            :class="{ 'camera-preview--mirrored': cameraFacingMode === 'user' }"
            autoplay
            muted
            playsinline
          ></video>

          <div class="camera-stage-gradient camera-stage-gradient--top"></div>
          <div class="camera-stage-gradient camera-stage-gradient--bottom"></div>

          <div class="camera-header">
            <v-btn
              icon
              variant="text"
              class="camera-icon-btn"
              @click="closeCameraDialog"
              :disabled="uploading"
            >
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>

            <div class="camera-header-copy">
              <div class="camera-mode-title">Portrait</div>
              <div class="camera-mode-subtitle">Center your face in the frame</div>
            </div>

            <v-btn
              icon
              variant="text"
              class="camera-icon-btn"
              @click="toggleCameraFacingMode"
              :disabled="isCameraStarting || uploading"
            >
              <v-icon>mdi-camera-flip-outline</v-icon>
            </v-btn>
          </div>

          <div class="camera-status-pill">
            <v-icon size="16">mdi-circle-medium</v-icon>
            {{ activeCameraLabel }}
          </div>

          <div class="camera-viewfinder">
            <span class="camera-corner camera-corner--top-left"></span>
            <span class="camera-corner camera-corner--top-right"></span>
            <span class="camera-corner camera-corner--bottom-left"></span>
            <span class="camera-corner camera-corner--bottom-right"></span>
          </div>

          <div class="camera-footer">
            <div class="camera-footer-spacer"></div>

            <button
              type="button"
              class="camera-shutter"
              @click="captureCameraPhoto"
              :disabled="isCameraStarting || uploading"
            >
              <span class="camera-shutter-ring"></span>
              <span class="camera-shutter-core"></span>
            </button>

            <div class="camera-footer-hint">
              <span>Tap to capture</span>
            </div>
          </div>

          <div v-if="isCameraStarting" class="camera-loading-state">
            <v-progress-circular indeterminate color="white" size="40" width="4" />
            <span>Starting camera...</span>
          </div>
        </div>
      </div>
    </v-dialog>

    <v-dialog v-model="showDeleteAccountDialog" max-width="480" persistent>
      <v-card class="delete-dialog-card">
        <v-card-title class="delete-dialog-title">Delete Account</v-card-title>
        <v-card-text class="delete-dialog-body">
          <p class="delete-dialog-copy">
            This action cannot be undone. Type <strong>{{ DELETE_ACCOUNT_CONFIRMATION_TEXT }}</strong>
            to confirm account deletion.
          </p>

          <v-alert type="warning" variant="tonal" class="mb-4">
            Your profile will be anonymized, saved addresses and notifications will be removed, and
            any shop you own will be hidden from customers.
          </v-alert>

          <v-text-field
            v-model="deleteAccountConfirmation"
            label="Type DELETE to continue"
            variant="outlined"
            :disabled="isDeletingAccount"
            autocomplete="off"
          />
        </v-card-text>
        <v-card-actions class="delete-dialog-actions">
          <v-btn variant="text" @click="closeDeleteAccountDialog" :disabled="isDeletingAccount">
            Cancel
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="isDeletingAccount"
            :disabled="!isDeleteAccountConfirmationValid"
            @click="deleteAccount"
          >
            Delete Account
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<style scoped>
/* =========================================
   SAFE AREA + GLOBAL MOBILE FRIENDLY LAYOUT
========================================= */
:root {
  font-family: 'Inter', 'Poppins', 'Roboto', sans-serif;
}

.v-application {
  background: #f5f7fb;
}

v-main,
.v-main {
  padding-top: var(--app-safe-area-top, env(safe-area-inset-top, 0px));
  padding-bottom: var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px));
  padding-left: max(0px, var(--app-safe-area-left, env(safe-area-inset-left, 0px)));
  padding-right: max(0px, var(--app-safe-area-right, env(safe-area-inset-right, 0px)));
  background: #f5f7fb;
  min-height: 100vh;
  margin-top: 20px;
}

/* =========================================
   APP BAR
========================================= */
.app-bar {
  padding-top: var(--app-safe-area-top, env(safe-area-inset-top, 0px));
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  color: white !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.app-bar :deep(.v-toolbar-title) {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.app-bar :deep(.v-btn) {
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

.danger-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(220, 38, 38, 0.18);
  background: linear-gradient(135deg, rgba(254, 242, 242, 0.96), rgba(255, 255, 255, 0.98));
}

.danger-copy {
  display: grid;
  gap: 8px;
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

.camera-shell {
  width: min(100%, 520px);
  margin: 0 auto;
  border-radius: 30px;
  overflow: hidden;
  background: #030712;
  box-shadow: 0 24px 60px rgba(2, 6, 23, 0.55);
}

.camera-stage {
  position: relative;
  min-height: 78dvh;
  background:
    radial-gradient(circle at top, rgba(30, 64, 175, 0.22), transparent 32%),
    linear-gradient(180deg, #020817 0%, #020617 100%);
}

.camera-preview {
  width: 100%;
  height: 78dvh;
  object-fit: cover;
  display: block;
}

.camera-preview--mirrored {
  transform: scaleX(-1);
}

.camera-stage-gradient {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  pointer-events: none;
}

.camera-stage-gradient--top {
  top: 0;
  height: 22%;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.78), rgba(2, 6, 23, 0));
}

.camera-stage-gradient--bottom {
  bottom: 0;
  height: 32%;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0), rgba(2, 6, 23, 0.92));
}

.camera-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3;
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  gap: 12px;
  padding: calc(18px + var(--app-safe-area-top, env(safe-area-inset-top, 0px))) 20px 0;
}

.camera-icon-btn {
  color: white !important;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(10px);
}

.camera-header-copy {
  text-align: center;
  color: white;
}

.camera-mode-title {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.camera-mode-subtitle {
  font-size: 0.82rem;
  color: rgba(226, 232, 240, 0.92);
}

.camera-status-pill {
  position: absolute;
  top: calc(86px + var(--app-safe-area-top, env(safe-area-inset-top, 0px)));
  left: 50%;
  z-index: 3;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  color: white;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(10px);
  font-size: 0.78rem;
  font-weight: 600;
}

.camera-viewfinder {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  width: min(72vw, 320px);
  height: min(88vw, 420px);
  transform: translate(-50%, -50%);
  border-radius: 32px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.camera-corner {
  position: absolute;
  width: 34px;
  height: 34px;
  border-color: rgba(255, 255, 255, 0.95);
  border-style: solid;
  border-width: 0;
}

.camera-corner--top-left {
  top: 16px;
  left: 16px;
  border-top-width: 4px;
  border-left-width: 4px;
  border-top-left-radius: 14px;
}

.camera-corner--top-right {
  top: 16px;
  right: 16px;
  border-top-width: 4px;
  border-right-width: 4px;
  border-top-right-radius: 14px;
}

.camera-corner--bottom-left {
  bottom: 16px;
  left: 16px;
  border-bottom-width: 4px;
  border-left-width: 4px;
  border-bottom-left-radius: 14px;
}

.camera-corner--bottom-right {
  right: 16px;
  bottom: 16px;
  border-right-width: 4px;
  border-bottom-width: 4px;
  border-bottom-right-radius: 14px;
}

.camera-footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 24px calc(28px + var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)));
}

.camera-footer-spacer,
.camera-footer-hint {
  min-width: 72px;
}

.camera-footer-hint {
  justify-self: end;
  color: rgba(226, 232, 240, 0.94);
  font-size: 0.82rem;
  font-weight: 600;
}

.camera-shutter {
  position: relative;
  width: 88px;
  height: 88px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.camera-shutter:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.camera-shutter-ring,
.camera-shutter-core {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.camera-shutter-ring {
  border: 4px solid rgba(255, 255, 255, 0.95);
  box-shadow:
    0 0 0 10px rgba(255, 255, 255, 0.14),
    0 12px 24px rgba(2, 6, 23, 0.28);
}

.camera-shutter-core {
  inset: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%);
}

.camera-loading-state {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: white;
  background: rgba(2, 6, 23, 0.42);
  backdrop-filter: blur(6px);
}

.list-item-action {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.list-item-action:hover {
  background-color: #f8fafc;
}

.delete-dialog-card {
  border-radius: 20px;
}

.delete-dialog-title {
  padding: 22px 24px 0;
  font-weight: 700;
  color: #8b1e2d;
}

.delete-dialog-body {
  padding-top: 16px;
}

.delete-dialog-copy {
  margin: 0 0 16px;
  color: #475569;
  line-height: 1.55;
}

.delete-dialog-actions {
  padding: 0 24px 24px;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 600px) {
  .profile-container {
    padding-top: 16px;
  }

  .camera-shell {
    width: 100%;
    height: 100dvh;
    border-radius: 0;
    box-shadow: none;
  }

  .camera-shell--mobile {
    min-height: 100dvh;
  }

  .camera-stage {
    min-height: 100dvh;
  }

  .camera-preview {
    width: 100%;
    height: 100dvh;
  }

  .camera-header {
    padding: calc(16px + var(--app-safe-area-top, env(safe-area-inset-top, 0px))) 16px 0;
  }

  .camera-mode-title {
    font-size: 1rem;
  }

  .camera-mode-subtitle {
    font-size: 0.76rem;
  }

  .camera-status-pill {
    top: calc(78px + var(--app-safe-area-top, env(safe-area-inset-top, 0px)));
  }

  .camera-viewfinder {
    width: calc(100vw - 64px);
    max-width: 360px;
    height: min(104vw, 440px);
  }

  .camera-footer {
    padding: 0 16px calc(24px + var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)));
  }

  .camera-footer-hint {
    font-size: 0.76rem;
  }

  .camera-shutter {
    width: 82px;
    height: 82px;
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

  .danger-card {
    flex-direction: column;
  }

  .save-btn,
  .cancel-btn {
    width: 100%;
  }
}
</style>
