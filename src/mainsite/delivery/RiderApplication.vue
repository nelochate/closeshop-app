<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

const router = useRouter()
const authStore = useAuthUserStore()

// Stepper state
const currentStep = ref(1)
const personalValid = ref(false)
const vehicleValid = ref(false)
const documentsValid = ref(false)
const submitting = ref(false)
const agreeTerms = ref(false)
const showTermsDialog = ref(false)
const showSuccessDialog = ref(false)
const applicationId = ref('')

// File selection dialog
const showFileOptionsDialog = ref(false)
const currentFileField = ref('')

// Camera state
const showCameraDialog = ref(false)
const video = ref(null)
let stream = null

// Form references
const personalForm = ref(null)
const vehicleForm = ref(null)
const documentsForm = ref(null)

// File input refs
const validIdInput = ref(null)
const driversLicenseInput = ref(null)
const orCrInput = ref(null)
const nbiClearanceInput = ref(null)

// PSGC Address Data
const provinces = ref([])
const cities = ref([])
const barangays = ref([])
const loadingProvinces = ref(false)
const loadingCities = ref(false)
const loadingBarangays = ref(false)

const isMissingDocuments = computed(() => {
  return !documents.value.validId || !documents.value.driversLicense || !documents.value.orCr
})

// Form data
const personalInfo = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  province_code: '',
  province_name: '',
  city_code: '',
  city_name: '',
  barangay_code: '',
  barangay_name: '',
  birthdate: null,
  gender: '',
})

const vehicleInfo = ref({
  vehicleType: '',
  brand: '',
  model: '',
  year: '',
  color: '',
  plateNumber: '',
  orCrNumber: '',
})

const documents = ref({
  validId: null,
  validIdPreview: null,
  driversLicense: null,
  driversLicensePreview: null,
  orCr: null,
  orCrPreview: null,
  nbiClearance: null,
  nbiClearancePreview: null,
})

// Vehicle options
const vehicleTypes = [
  'Motorcycle - Under 200cc',
  'Motorcycle - 200cc and above',
  'Scooter',
  'Electric Bike',
  'Car',
  'Van',
  'Bicycle',
]

// Validation rules
const rules = {
  required: (v) => !!v || 'This field is required',
  email: (v) => /.+@.+\..+/.test(v) || 'Invalid email address',
  phone: (v) => /^09\d{9}$/.test(v) || 'Invalid phone number (must be 09XXXXXXXXX)',
  age: (v) => {
    if (v === null || v === undefined || v === '') {
      return 'Birthdate is required'
    }

    const birthDate = new Date(v)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age >= 18 || 'You must be at least 18 years old'
  },
  year: (v) => {
    if (!v) return true
    const year = parseInt(v)
    const currentYear = new Date().getFullYear()
    return (year >= 1990 && year <= currentYear) || `Year must be between 1990 and ${currentYear}`
  },
  plateNumber: (v) => {
    if (!v) return true
    return /^[A-Z0-9]{3,10}$/.test(v) || 'Invalid plate number format'
  },
}

// PSGC API Functions
const fetchProvinces = async () => {
  loadingProvinces.value = true
  try {
    const response = await fetch('https://psgc.gitlab.io/api/provinces/')
    const data = await response.json()
    provinces.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Error fetching provinces:', error)
    alert('Failed to load provinces. Please refresh the page.')
  } finally {
    loadingProvinces.value = false
  }
}

const fetchCities = async (provinceCode) => {
  loadingCities.value = true
  cities.value = []
  personalInfo.value.city_code = ''
  personalInfo.value.city_name = ''
  barangays.value = []
  personalInfo.value.barangay_code = ''
  personalInfo.value.barangay_name = ''

  try {
    const response = await fetch(`https://psgc.gitlab.io/api/provinces/${provinceCode}/cities-municipalities/`)
    const data = await response.json()
    cities.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Error fetching cities:', error)
    alert('Failed to load cities/municipalities. Please try again.')
  } finally {
    loadingCities.value = false
  }
}

const fetchBarangays = async (cityCode) => {
  loadingBarangays.value = true
  barangays.value = []
  personalInfo.value.barangay_code = ''
  personalInfo.value.barangay_name = ''

  try {
    const response = await fetch(`https://psgc.gitlab.io/api/cities-municipalities/${cityCode}/barangays/`)
    const data = await response.json()
    barangays.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Error fetching barangays:', error)
    alert('Failed to load barangays. Please try again.')
  } finally {
    loadingBarangays.value = false
  }
}

// Watch for province selection
watch(() => personalInfo.value.province_code, (newProvinceCode) => {
  if (newProvinceCode) {
    const selectedProvince = provinces.value.find(p => p.code === newProvinceCode)
    personalInfo.value.province_name = selectedProvince?.name || ''
    fetchCities(newProvinceCode)
  } else {
    cities.value = []
    barangays.value = []
  }
})

// Watch for city selection
watch(() => personalInfo.value.city_code, (newCityCode) => {
  if (newCityCode) {
    const selectedCity = cities.value.find(c => c.code === newCityCode)
    personalInfo.value.city_name = selectedCity?.name || ''
    fetchBarangays(newCityCode)
  } else {
    barangays.value = []
  }
})

// Watch for barangay selection
watch(() => personalInfo.value.barangay_code, (newBarangayCode) => {
  if (newBarangayCode) {
    const selectedBarangay = barangays.value.find(b => b.code === newBarangayCode)
    personalInfo.value.barangay_name = selectedBarangay?.name || ''
  }
})

// Watch for document changes to validate
watch(
  documents,
  () => {
    const hasValidId = !!documents.value.validId
    const hasDriversLicense = !!documents.value.driversLicense
    const hasOrCr = !!documents.value.orCr

    documentsValid.value = hasValidId && hasDriversLicense && hasOrCr
  },
  { deep: true },
)

// Helper functions
const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const getFileName = (file) => {
  if (!file) return ''
  if (file.name) return file.name
  return 'Photo captured'
}

const getFullAddress = () => {
  const parts = []
  if (personalInfo.value.address) parts.push(personalInfo.value.address)
  if (personalInfo.value.barangay_name) parts.push(personalInfo.value.barangay_name)
  if (personalInfo.value.city_name) parts.push(personalInfo.value.city_name)
  if (personalInfo.value.province_name) parts.push(personalInfo.value.province_name)
  return parts.join(', ')
}

const nextStep = () => {
  if (currentStep.value === 1) {
    if (!personalInfo.value.birthdate || personalInfo.value.birthdate === '') {
      alert('Please enter your birthdate')
      return
    }

    const birthDate = new Date(personalInfo.value.birthdate)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    if (age < 18) {
      alert('You must be at least 18 years old to become a rider')
      return
    }

    // Validate address selection
    if (!personalInfo.value.province_code || !personalInfo.value.city_code || !personalInfo.value.barangay_code) {
      alert('Please complete your address (Province, City/Municipality, and Barangay)')
      return
    }
  }

  if (currentStep.value < 4) {
    currentStep.value++
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

const previousStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

// File handling functions
const showFileOptions = (field) => {
  currentFileField.value = field
  showFileOptionsDialog.value = true
}

const openGallery = () => {
  showFileOptionsDialog.value = false

  const inputMap = {
    validId: validIdInput,
    driversLicense: driversLicenseInput,
    orCr: orCrInput,
    nbiClearance: nbiClearanceInput,
  }

  setTimeout(() => {
    if (inputMap[currentFileField.value]) {
      inputMap[currentFileField.value].value.click()
    }
  }, 100)
}

const handleFileSelect = (event, field) => {
  const file = event.target.files[0]
  if (file) {
    if (file.size / 1024 / 1024 > 5) {
      alert('File size must be less than 5MB')
      return
    }

    documents.value[field] = file

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        documents.value[`${field}Preview`] = e.target.result
      }
      reader.readAsDataURL(file)
    } else {
      documents.value[`${field}Preview`] = null
    }
  }
  event.target.value = ''
}

const removeFile = (field) => {
  documents.value[field] = null
  documents.value[`${field}Preview`] = null

  const inputMap = {
    validId: validIdInput,
    driversLicense: driversLicenseInput,
    orCr: orCrInput,
    nbiClearance: nbiClearanceInput,
  }
  if (inputMap[field] && inputMap[field].value) {
    inputMap[field].value.value = ''
  }
}

// Camera functions
const openCamera = async () => {
  showFileOptionsDialog.value = false

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera is not supported on this browser. Please use the file upload option instead.')
      return
    }

    stream = await navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { exact: 'environment' },
        },
      })
      .catch(() => {
        return navigator.mediaDevices.getUserMedia({ video: true })
      })

    showCameraDialog.value = true

    setTimeout(() => {
      if (video.value) {
        video.value.srcObject = stream
        video.value.play()
      }
    }, 100)
  } catch (err) {
    console.error('Error accessing camera:', err)
    if (err.name === 'NotAllowedError') {
      alert('Camera permission denied. Please allow camera access and try again.')
    } else if (err.name === 'NotFoundError') {
      alert('No camera found on this device.')
    } else {
      alert('Unable to access camera. Please check your camera settings.')
    }
  }
}

const capturePhoto = () => {
  if (video.value && video.value.videoWidth > 0) {
    const canvas = document.createElement('canvas')
    canvas.width = video.value.videoWidth
    canvas.height = video.value.videoHeight
    const context = canvas.getContext('2d')
    context.drawImage(video.value, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' })
        documents.value[currentFileField.value] = file

        const reader = new FileReader()
        reader.onload = (e) => {
          documents.value[`${currentFileField.value}Preview`] = e.target.result
        }
        reader.readAsDataURL(file)

        closeCamera()
      },
      'image/jpeg',
      0.8,
    )
  } else {
    alert('Camera not ready. Please try again.')
  }
}

const closeCamera = () => {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    stream = null
  }
  if (video.value) {
    video.value.srcObject = null
  }
  showCameraDialog.value = false
}

// Upload file to Supabase storage
const uploadFile = async (file, folder, fileName) => {
  if (!file) return null

  const fileExt = file.name.split('.').pop()
  const timestamp = Date.now()
  const filePath = `${folder}/${fileName}_${timestamp}.${fileExt}`

  const { data, error } = await supabase.storage.from('rider_info').upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    console.error('Error uploading file:', error)
    throw error
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('rider_info').getPublicUrl(filePath)

  return publicUrl
}

// Submit application
const submitApplication = async () => {
  const missingDocs = []
  if (!documents.value.validId) missingDocs.push('Valid ID')
  if (!documents.value.driversLicense) missingDocs.push("Driver's License")
  if (!documents.value.orCr) missingDocs.push('OR/CR')

  if (missingDocs.length > 0) {
    const confirmSubmit = confirm(
      `⚠️ WARNING: You are missing the following required documents:\n\n` +
      `- ${missingDocs.join('\n- ')}\n\n` +
      `Your application may be REJECTED or DELAYED significantly.\n\n` +
      `Do you still want to submit your application?`
    )
    if (!confirmSubmit) return
  }

  submitting.value = true

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (profileError) throw new Error('Profile not found')

    if (!personalInfo.value.birthdate || personalInfo.value.birthdate === '') {
      throw new Error('Birthdate is required. Please go back to Step 1 and enter your birthdate.')
    }

    const userFolder = `users/${user.id}`

    let validIdUrl = null
    let driversLicenseUrl = null
    let orCrUrl = null
    let nbiClearanceUrl = null

    if (documents.value.validId) {
      validIdUrl = await uploadFile(documents.value.validId, userFolder, 'valid_id')
    }

    if (documents.value.driversLicense) {
      driversLicenseUrl = await uploadFile(documents.value.driversLicense, userFolder, 'drivers_license')
    }

    if (documents.value.orCr) {
      orCrUrl = await uploadFile(documents.value.orCr, userFolder, 'or_cr')
    }

    if (documents.value.nbiClearance) {
      nbiClearanceUrl = await uploadFile(documents.value.nbiClearance, userFolder, 'nbi_clearance')
    }

    const fullAddress = getFullAddress()

    const { data, error } = await supabase
      .from('Rider_Registration')
      .insert([
        {
          profile_id: profile.id,
          first_name: personalInfo.value.firstName,
          last_name: personalInfo.value.lastName,
          email: personalInfo.value.email,
          phone: personalInfo.value.phone,
          address: fullAddress,
          street_address: personalInfo.value.address,
          province: personalInfo.value.province_name,
          city: personalInfo.value.city_name,
          barangay: personalInfo.value.barangay_name,
          birthdate: personalInfo.value.birthdate,
          gender: personalInfo.value.gender,
          vehicle_type: vehicleInfo.value.vehicleType,
          vehicle_brand: vehicleInfo.value.brand,
          vehicle_model: vehicleInfo.value.model,
          vehicle_year: vehicleInfo.value.year,
          vehicle_color: vehicleInfo.value.color,
          vehicle_plate: vehicleInfo.value.plateNumber,
          vehicle_or_cr_number: vehicleInfo.value.orCrNumber,
          valid_id_url: validIdUrl,
          drivers_license_url: driversLicenseUrl,
          or_cr_url: orCrUrl,
          nbi_clearance_url: nbiClearanceUrl,
          status: 'pending',
          application_date: new Date().toISOString()
        }
      ])
      .select()
      .single()

    if (error) throw error

    applicationId.value = data.rider_id
    showSuccessDialog.value = true

  } catch (error) {
    console.error('Error submitting application:', error)
    alert(`Failed to submit application: ${error.message || 'Please try again.'}`)
  } finally {
    submitting.value = false
  }
}

const goToProfile = () => {
  router.push('/profile')
}

// Load user data and provinces on mount
onMounted(async () => {
  // Load provinces from PSGC API
  await fetchProvinces()

  if (authStore.userData) {
    personalInfo.value.firstName = authStore.userData.user_metadata?.first_name || ''
    personalInfo.value.lastName = authStore.userData.user_metadata?.last_name || ''
    personalInfo.value.email = authStore.userData.email || ''
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      personalInfo.value.firstName = user.user_metadata?.first_name || ''
      personalInfo.value.lastName = user.user_metadata?.last_name || ''
      personalInfo.value.email = user.email || ''
    }
  }
})
</script>

<template>
  <v-app>
    <v-main class="rider-application-main">
      <!-- Header with back button -->
      <div class="header-section">
        <v-btn icon variant="text" class="back-btn" @click="router.back()">
          <v-icon size="28">mdi-arrow-left</v-icon>
        </v-btn>
        <h1 class="page-title">Become a Rider</h1>
        <div class="placeholder"></div>
      </div>

      <!-- Progress Stepper -->
      <v-stepper v-model="currentStep" class="application-stepper" elevation="0">
        <v-stepper-header>
          <v-stepper-item :complete="currentStep > 1" :value="1">
            Personal Info
            <template #subtitle>Basic details</template>
          </v-stepper-item>

          <v-divider></v-divider>

          <v-stepper-item :complete="currentStep > 2" :value="2">
            Vehicle Details
            <template #subtitle>Your ride</template>
          </v-stepper-item>

          <v-divider></v-divider>

          <v-stepper-item :complete="currentStep > 3" :value="3">
            Documents
            <template #subtitle>Requirements</template>
          </v-stepper-item>

          <v-divider></v-divider>

          <v-stepper-item :value="4">
            Review & Submit
            <template #subtitle>Final check</template>
          </v-stepper-item>
        </v-stepper-header>

        <v-stepper-window v-model="currentStep">
          <!-- Step 1: Personal Information -->
          <v-stepper-window-item :value="1">
            <v-card class="form-card" elevation="2">
              <v-card-text>
                <v-form ref="personalForm" v-model="personalValid">
                  <div class="form-section">
                    <h3 class="section-title">
                      <v-icon class="mr-2">mdi-account-circle</v-icon>
                      Personal Information
                    </h3>

                    <v-row>
                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="personalInfo.firstName"
                          label="First Name"
                          :rules="[rules.required]"
                          variant="outlined"
                          prepend-inner-icon="mdi-account"
                        ></v-text-field>
                      </v-col>

                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="personalInfo.lastName"
                          label="Last Name"
                          :rules="[rules.required]"
                          variant="outlined"
                          prepend-inner-icon="mdi-account"
                        ></v-text-field>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="personalInfo.email"
                          label="Email Address"
                          :rules="[rules.required, rules.email]"
                          variant="outlined"
                          prepend-inner-icon="mdi-email"
                          readonly
                        ></v-text-field>
                      </v-col>

                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="personalInfo.phone"
                          label="Phone Number"
                          :rules="[rules.required, rules.phone]"
                          variant="outlined"
                          prepend-inner-icon="mdi-phone"
                          placeholder="09XXXXXXXXX"
                        ></v-text-field>
                      </v-col>
                    </v-row>

                    <!-- Address Section with PSGC API -->
                    <v-row>
                      <v-col cols="12">
                        <v-text-field
                          v-model="personalInfo.address"
                          label="House/Unit #, Street, Subdivision"
                          variant="outlined"
                          prepend-inner-icon="mdi-home"
                          placeholder="e.g., Block 1 Lot 2, Phase 3, Evergreen Subdivision"
                        ></v-text-field>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12" md="6">
                        <v-select
                          v-model="personalInfo.province_code"
                          :items="provinces"
                          item-title="name"
                          item-value="code"
                          label="Province"
                          :rules="[rules.required]"
                          variant="outlined"
                          :loading="loadingProvinces"
                          prepend-inner-icon="mdi-map"
                        >
                          <template v-slot:no-data>
                            <v-list-item>No provinces found</v-list-item>
                          </template>
                        </v-select>
                      </v-col>

                      <v-col cols="12" md="6">
                        <v-select
                          v-model="personalInfo.city_code"
                          :items="cities"
                          item-title="name"
                          item-value="code"
                          label="City/Municipality"
                          :rules="[rules.required]"
                          variant="outlined"
                          :disabled="!personalInfo.province_code"
                          :loading="loadingCities"
                          prepend-inner-icon="mdi-city"
                        >
                          <template v-slot:no-data>
                            <v-list-item>Select a province first</v-list-item>
                          </template>
                        </v-select>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12" md="6">
                        <v-select
                          v-model="personalInfo.barangay_code"
                          :items="barangays"
                          item-title="name"
                          item-value="code"
                          label="Barangay"
                          :rules="[rules.required]"
                          variant="outlined"
                          :disabled="!personalInfo.city_code"
                          :loading="loadingBarangays"
                          prepend-inner-icon="mdi-home-variant"
                        >
                          <template v-slot:no-data>
                            <v-list-item>Select a city/municipality first</v-list-item>
                          </template>
                        </v-select>
                      </v-col>

                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="personalInfo.birthdate"
                          label="Birthdate"
                          type="date"
                          :rules="[rules.required, rules.age]"
                          variant="outlined"
                          prepend-inner-icon="mdi-calendar"
                        ></v-text-field>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12" md="6">
                        <v-select
                          v-model="personalInfo.gender"
                          :items="['Male', 'Female', 'Prefer not to say']"
                          label="Gender"
                          :rules="[rules.required]"
                          variant="outlined"
                        ></v-select>
                      </v-col>
                    </v-row>

                    <div class="info-alert">
                      <v-alert type="info" variant="tonal" density="compact">
                        <strong>Address Format:</strong> Please provide your complete address starting with house/unit number, street, and subdivision/barangay.
                      </v-alert>
                    </div>
                  </div>
                </v-form>
              </v-card-text>

              <v-card-actions class="form-actions">
                <v-spacer></v-spacer>
                <v-btn color="primary" size="large" @click="nextStep" :disabled="!personalValid">
                  Next
                  <v-icon right>mdi-arrow-right</v-icon>
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-stepper-window-item>

          <!-- Step 2: Vehicle Details (same as before) -->
          <v-stepper-window-item :value="2">
            <v-card class="form-card" elevation="2">
              <v-card-text>
                <v-form ref="vehicleForm" v-model="vehicleValid">
                  <div class="form-section">
                    <h3 class="section-title">
                      <v-icon class="mr-2">mdi-motorbike</v-icon>
                      Vehicle Information
                    </h3>

                    <v-row>
                      <v-col cols="12" md="6">
                        <v-select
                          v-model="vehicleInfo.vehicleType"
                          :items="vehicleTypes"
                          label="Vehicle Type"
                          :rules="[rules.required]"
                          variant="outlined"
                          prepend-inner-icon="mdi-car-side"
                        ></v-select>
                      </v-col>

                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="vehicleInfo.brand"
                          label="Brand"
                          :rules="[rules.required]"
                          variant="outlined"
                          placeholder="e.g., Honda, Yamaha, Toyota"
                        ></v-text-field>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="vehicleInfo.model"
                          label="Model"
                          :rules="[rules.required]"
                          variant="outlined"
                          placeholder="e.g., Click 125i, Mio i125"
                        ></v-text-field>
                      </v-col>

                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="vehicleInfo.year"
                          label="Year Model"
                          :rules="[rules.required, rules.year]"
                          variant="outlined"
                          placeholder="YYYY"
                          maxlength="4"
                        ></v-text-field>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="vehicleInfo.color"
                          label="Color"
                          :rules="[rules.required]"
                          variant="outlined"
                          prepend-inner-icon="mdi-palette"
                        ></v-text-field>
                      </v-col>

                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="vehicleInfo.plateNumber"
                          label="Plate Number"
                          :rules="[rules.required, rules.plateNumber]"
                          variant="outlined"
                          prepend-inner-icon="mdi-license-plate"
                          placeholder="ABC-1234"
                        ></v-text-field>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12">
                        <v-text-field
                          v-model="vehicleInfo.orCrNumber"
                          label="OR/CR Number"
                          :rules="[rules.required]"
                          variant="outlined"
                          prepend-inner-icon="mdi-file-document"
                          placeholder="Official Receipt/Certificate of Registration Number"
                        ></v-text-field>
                      </v-col>
                    </v-row>

                    <div class="info-alert">
                      <v-alert type="info" variant="tonal" density="compact" class="mt-4">
                        <strong>Note:</strong> Your vehicle must be registered and in good
                        condition. We may request additional documents for verification.
                      </v-alert>
                    </div>
                  </div>
                </v-form>
              </v-card-text>

              <v-card-actions class="form-actions">
                <v-btn variant="text" @click="previousStep">
                  <v-icon left>mdi-arrow-left</v-icon>
                  Back
                </v-btn>
                <v-spacer></v-spacer>
                <v-btn color="primary" size="large" @click="nextStep" :disabled="!vehicleValid">
                  Next
                  <v-icon right>mdi-arrow-right</v-icon>
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-stepper-window-item>

          <!-- Step 3: Documents (same as before) -->
          <v-stepper-window-item :value="3">
            <v-card class="form-card" elevation="2">
              <v-card-text>
                <v-form ref="documentsForm" v-model="documentsValid">
                  <div class="form-section">
                    <h3 class="section-title">
                      <v-icon class="mr-2">mdi-folder-account</v-icon>
                      Required Documents
                    </h3>

                    <!-- Valid Government ID -->
                    <v-row>
                      <v-col cols="12">
                        <div class="document-upload-section">
                          <label class="document-label">Valid Government ID *</label>
                          <div class="upload-buttons">
                            <v-btn
                              color="primary"
                              variant="outlined"
                              @click="showFileOptions('validId')"
                              class="mr-2"
                            >
                              <v-icon left>mdi-plus-circle</v-icon>
                              Upload File
                            </v-btn>
                            <input
                              type="file"
                              ref="validIdInput"
                              style="display: none"
                              accept="image/*,.pdf"
                              @change="handleFileSelect($event, 'validId')"
                            />
                          </div>
                          <div v-if="documents.validId" class="file-preview mt-2">
                            <v-chip color="success" class="mr-2">
                              <v-icon left size="16">mdi-check-circle</v-icon>
                              {{ getFileName(documents.validId) }}
                            </v-chip>
                            <v-btn icon size="small" color="error" @click="removeFile('validId')">
                              <v-icon size="16">mdi-close</v-icon>
                            </v-btn>
                          </div>
                          <div v-if="documents.validIdPreview" class="image-preview mt-2">
                            <v-img
                              :src="documents.validIdPreview"
                              max-width="200"
                              max-height="150"
                              contain
                              class="preview-image"
                            ></v-img>
                          </div>
                        </div>
                      </v-col>
                    </v-row>

                    <!-- Driver's License -->
                    <v-row>
                      <v-col cols="12">
                        <div class="document-upload-section">
                          <label class="document-label">Driver's License *</label>
                          <div class="upload-buttons">
                            <v-btn
                              color="primary"
                              variant="outlined"
                              @click="showFileOptions('driversLicense')"
                              class="mr-2"
                            >
                              <v-icon left>mdi-plus-circle</v-icon>
                              Upload File
                            </v-btn>
                            <input
                              type="file"
                              ref="driversLicenseInput"
                              style="display: none"
                              accept="image/*,.pdf"
                              @change="handleFileSelect($event, 'driversLicense')"
                            />
                          </div>
                          <div v-if="documents.driversLicense" class="file-preview mt-2">
                            <v-chip color="success" class="mr-2">
                              <v-icon left size="16">mdi-check-circle</v-icon>
                              {{ getFileName(documents.driversLicense) }}
                            </v-chip>
                            <v-btn
                              icon
                              size="small"
                              color="error"
                              @click="removeFile('driversLicense')"
                            >
                              <v-icon size="16">mdi-close</v-icon>
                            </v-btn>
                          </div>
                          <div v-if="documents.driversLicensePreview" class="image-preview mt-2">
                            <v-img
                              :src="documents.driversLicensePreview"
                              max-width="200"
                              max-height="150"
                              contain
                              class="preview-image"
                            ></v-img>
                          </div>
                        </div>
                      </v-col>
                    </v-row>

                    <!-- OR/CR Document -->
                    <v-row>
                      <v-col cols="12">
                        <div class="document-upload-section">
                          <label class="document-label">OR/CR Document *</label>
                          <div class="upload-buttons">
                            <v-btn
                              color="primary"
                              variant="outlined"
                              @click="showFileOptions('orCr')"
                              class="mr-2"
                            >
                              <v-icon left>mdi-plus-circle</v-icon>
                              Upload File
                            </v-btn>
                            <input
                              type="file"
                              ref="orCrInput"
                              style="display: none"
                              accept="image/*,.pdf"
                              @change="handleFileSelect($event, 'orCr')"
                            />
                          </div>
                          <div v-if="documents.orCr" class="file-preview mt-2">
                            <v-chip color="success" class="mr-2">
                              <v-icon left size="16">mdi-check-circle</v-icon>
                              {{ getFileName(documents.orCr) }}
                            </v-chip>
                            <v-btn icon size="small" color="error" @click="removeFile('orCr')">
                              <v-icon size="16">mdi-close</v-icon>
                            </v-btn>
                          </div>
                          <div v-if="documents.orCrPreview" class="image-preview mt-2">
                            <v-img
                              :src="documents.orCrPreview"
                              max-width="200"
                              max-height="150"
                              contain
                              class="preview-image"
                            ></v-img>
                          </div>
                        </div>
                      </v-col>
                    </v-row>

                    <!-- NBI Clearance (Optional) -->
                    <v-row>
                      <v-col cols="12">
                        <div class="document-upload-section">
                          <label class="document-label">NBI Clearance (Optional)</label>
                          <div class="upload-buttons">
                            <v-btn
                              color="primary"
                              variant="outlined"
                              @click="showFileOptions('nbiClearance')"
                              class="mr-2"
                            >
                              <v-icon left>mdi-plus-circle</v-icon>
                              Upload File
                            </v-btn>
                            <input
                              type="file"
                              ref="nbiClearanceInput"
                              style="display: none"
                              accept="image/*,.pdf"
                              @change="handleFileSelect($event, 'nbiClearance')"
                            />
                          </div>
                          <div v-if="documents.nbiClearance" class="file-preview mt-2">
                            <v-chip color="success" class="mr-2">
                              <v-icon left size="16">mdi-check-circle</v-icon>
                              {{ getFileName(documents.nbiClearance) }}
                            </v-chip>
                            <v-btn
                              icon
                              size="small"
                              color="error"
                              @click="removeFile('nbiClearance')"
                            >
                              <v-icon size="16">mdi-close</v-icon>
                            </v-btn>
                          </div>
                          <div v-if="documents.nbiClearancePreview" class="image-preview mt-2">
                            <v-img
                              :src="documents.nbiClearancePreview"
                              max-width="200"
                              max-height="150"
                              contain
                              class="preview-image"
                            ></v-img>
                          </div>
                        </div>
                      </v-col>
                    </v-row>

                    <div class="info-alert">
                      <v-alert type="warning" variant="tonal" density="compact" class="mt-4">
                        <strong>Important:</strong> All documents must be clear and readable. Upload
                        only valid and up-to-date documents.
                      </v-alert>
                    </div>
                  </div>
                </v-form>
              </v-card-text>

              <v-card-actions class="form-actions">
                <v-btn variant="text" @click="previousStep">
                  <v-icon left>mdi-arrow-left</v-icon>
                  Back
                </v-btn>
                <v-spacer></v-spacer>
                <v-btn color="primary" size="large" @click="nextStep" :disabled="!documentsValid">
                  Next
                  <v-icon right>mdi-arrow-right</v-icon>
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-stepper-window-item>

          <!-- Step 4: Review & Submit (updated with new address format) -->
          <v-stepper-window-item :value="4">
            <v-card class="form-card" elevation="2">
              <v-card-text>
                <div class="form-section">
                  <h3 class="section-title">
                    <v-icon class="mr-2">mdi-clipboard-check</v-icon>
                    Review Your Application
                  </h3>

                  <!-- Personal Information Review -->
                  <v-expansion-panels variant="accordion" class="review-panels">
                    <v-expansion-panel>
                      <v-expansion-panel-title class="review-title">
                        <v-icon left class="mr-2">mdi-account-circle</v-icon>
                        Personal Information
                      </v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <v-table density="compact">
                          <tbody>
                            <tr>
                              <td class="font-weight-bold">Full Name:</td>
                              <td>{{ personalInfo.firstName }} {{ personalInfo.lastName }}</td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">Email:</td>
                              <td>{{ personalInfo.email }}</td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">Phone:</td>
                              <td>{{ personalInfo.phone }}</td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">Address:</td>
                              <td>
                                {{ personalInfo.address }},
                                {{ personalInfo.barangay_name }},
                                {{ personalInfo.city_name }},
                                {{ personalInfo.province_name }}
                              </td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">Birthdate:</td>
                              <td>{{ formatDate(personalInfo.birthdate) }}</td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">Gender:</td>
                              <td>{{ personalInfo.gender }}</td>
                            </tr>
                          </tbody>
                        </v-table>
                      </v-expansion-panel-text>
                    </v-expansion-panel>

                    <!-- Vehicle Information Review -->
                    <v-expansion-panel>
                      <v-expansion-panel-title class="review-title">
                        <v-icon left class="mr-2">mdi-motorbike</v-icon>
                        Vehicle Information
                      </v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <v-table density="compact">
                          <tbody>
                            <tr>
                              <td class="font-weight-bold">Vehicle Type:</td>
                              <td>{{ vehicleInfo.vehicleType }}</td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">Brand:</td>
                              <td>{{ vehicleInfo.brand }}</td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">Model:</td>
                              <td>{{ vehicleInfo.model }}</td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">Year:</td>
                              <td>{{ vehicleInfo.year }}</td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">Color:</td>
                              <td>{{ vehicleInfo.color }}</td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">Plate Number:</td>
                              <td>{{ vehicleInfo.plateNumber }}</td>
                            </tr>
                            <tr>
                              <td class="font-weight-bold">OR/CR Number:</td>
                              <td>{{ vehicleInfo.orCrNumber }}</td>
                            </tr>
                          </tbody>
                        </v-table>
                      </v-expansion-panel-text>
                    </v-expansion-panel>

                    <!-- Documents Review -->
                    <v-expansion-panel>
                      <v-expansion-panel-title class="review-title">
                        <v-icon left class="mr-2">mdi-folder-account</v-icon>
                        Documents Uploaded
                      </v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <v-list>
                          <v-list-item v-if="documents.validId">
                            <template #prepend>
                              <v-icon color="success">mdi-check-circle</v-icon>
                            </template>
                            <v-list-item-title>Valid Government ID</v-list-item-title>
                            <v-list-item-subtitle>{{
                              getFileName(documents.validId)
                            }}</v-list-item-subtitle>
                          </v-list-item>

                          <v-list-item v-if="documents.driversLicense">
                            <template #prepend>
                              <v-icon color="success">mdi-check-circle</v-icon>
                            </template>
                            <v-list-item-title>Driver's License</v-list-item-title>
                            <v-list-item-subtitle>{{
                              getFileName(documents.driversLicense)
                            }}</v-list-item-subtitle>
                          </v-list-item>

                          <v-list-item v-if="documents.orCr">
                            <template #prepend>
                              <v-icon color="success">mdi-check-circle</v-icon>
                            </template>
                            <v-list-item-title>OR/CR Document</v-list-item-title>
                            <v-list-item-subtitle>{{
                              getFileName(documents.orCr)
                            }}</v-list-item-subtitle>
                          </v-list-item>

                          <v-list-item v-if="documents.nbiClearance">
                            <template #prepend>
                              <v-icon color="success">mdi-check-circle</v-icon>
                            </template>
                            <v-list-item-title>NBI Clearance</v-list-item-title>
                            <v-list-item-subtitle>{{
                              getFileName(documents.nbiClearance)
                            }}</v-list-item-subtitle>
                          </v-list-item>
                        </v-list>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>

                  <!-- Terms and Conditions -->
                  <div class="terms-section mt-6">
                    <v-checkbox
                      v-model="agreeTerms"
                      :rules="[(v) => !!v || 'You must agree to the terms and conditions']"
                    >
                      <template v-slot:label>
                        <span>
                          I agree to the
                          <a href="#" @click.prevent="showTermsDialog = true"
                            >Terms and Conditions</a
                          >
                          and confirm that all information provided is accurate and true.
                        </span>
                      </template>
                    </v-checkbox>
                  </div>
                </div>
              </v-card-text>

              <v-card-actions class="form-actions">
                <v-btn variant="text" @click="previousStep">
                  <v-icon left>mdi-arrow-left</v-icon>
                  Back
                </v-btn>
                <v-spacer></v-spacer>
                <v-btn
                  color="success"
                  size="large"
                  :loading="submitting"
                  @click="submitApplication"
                  :disabled="!agreeTerms"
                >
                  Submit Application
                  <v-icon right>mdi-check</v-icon>
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-stepper-window-item>
        </v-stepper-window>
      </v-stepper>
    </v-main>

    <!-- Rest of your dialogs remain the same -->
    <!-- File Selection Options Dialog -->
    <v-dialog v-model="showFileOptionsDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h5 primary-bg white--text"> Select File Source </v-card-title>
        <v-card-text class="text-center pa-6">
          <v-row>
            <v-col cols="12" class="text-center">
              <v-btn color="primary" size="large" block class="mb-4" @click="openCamera">
                <v-icon left size="24">mdi-camera</v-icon>
                Take Photo
              </v-btn>
            </v-col>
            <v-col cols="12" class="text-center">
              <v-btn color="secondary" size="large" block @click="openGallery">
                <v-icon left size="24">mdi-image-multiple</v-icon>
                Choose from Gallery
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey" @click="showFileOptionsDialog = false"> Cancel </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Camera Dialog -->
    <v-dialog v-model="showCameraDialog" max-width="500" persistent>
      <v-card>
        <v-card-title
          class="text-h5 primary-bg white--text d-flex justify-space-between align-center"
        >
          <span>Take Photo</span>
          <v-btn icon dark @click="closeCamera">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text class="pa-0">
          <video
            ref="video"
            autoplay
            playsinline
            class="camera-video"
            style="width: 100%; height: auto"
          ></video>
        </v-card-text>
        <v-card-actions>
          <v-btn color="error" @click="closeCamera"> Cancel </v-btn>
          <v-spacer></v-spacer>
          <v-btn color="success" @click="capturePhoto"> Capture </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Terms and Conditions Dialog -->
    <v-dialog v-model="showTermsDialog" max-width="600">
      <v-card>
        <v-card-title class="text-h5 primary-bg white--text"> Terms and Conditions </v-card-title>
        <v-card-text class="mt-4">
          <div class="terms-content">
            <h4>1. Eligibility</h4>
            <p>
              You must be at least 18 years old and possess a valid driver's license to become a
              rider.
            </p>

            <h4>2. Vehicle Requirements</h4>
            <p>Your vehicle must be properly registered, insured, and in good working condition.</p>

            <h4>3. Background Check</h4>
            <p>
              We reserve the right to conduct background checks and verify all submitted documents.
            </p>

            <h4>4. Code of Conduct</h4>
            <p>
              Riders must maintain professional conduct, follow traffic rules, and provide excellent
              service.
            </p>

            <h4>5. Fees and Commissions</h4>
            <p>
              A commission fee will be deducted from each successful delivery. Rates are subject to
              change with notice.
            </p>

            <h4>6. Termination</h4>
            <p>Violation of terms may result in immediate termination of rider status.</p>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" @click="showTermsDialog = false"> I Understand </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Success Dialog -->
    <v-dialog v-model="showSuccessDialog" persistent max-width="500">
      <v-card>
        <v-card-title class="text-h5 success-bg white--text"> Application Submitted! </v-card-title>
        <v-card-text class="text-center pa-6">
          <v-icon size="80" color="success" class="mb-4">mdi-check-circle</v-icon>
          <h3>Thank you for applying!</h3>
          <p class="mt-4">
            Your rider application has been submitted successfully. We will review your application
            and get back to you within 3-5 business days.
          </p>
          <v-alert type="info" variant="tonal" class="mt-4">
            Application ID: <strong>{{ applicationId }}</strong>
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" block @click="goToProfile" size="large"> Return to Profile </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<style scoped>
/* Your existing styles remain the same */
.rider-application-main {
  background: linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);
  min-height: 100vh;
  padding-bottom: 80px;
}

.header-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 16px;
  background: linear-gradient(135deg, #354d7c, #5276b0);
  color: white;
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-btn {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.placeholder {
  width: 40px;
}

.application-stepper {
  background: transparent;
  margin: 20px 16px;
}

.form-card {
  border-radius: 20px;
  margin: 20px 0;
  overflow: hidden;
}

.form-section {
  padding: 20px;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: #354d7c;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
}

.form-actions {
  padding: 16px 24px;
  background: #f8fafc;
  border-top: 1px solid #e0e0e0;
}

.review-panels {
  margin-top: 16px;
}

.review-title {
  font-weight: 600;
  color: #354d7c;
}

.terms-section {
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
}

.info-alert {
  margin-top: 16px;
}

.terms-content {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
}

.terms-content h4 {
  color: #354d7c;
  margin-top: 16px;
  margin-bottom: 8px;
}

.terms-content p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 12px;
}

.success-bg {
  background: linear-gradient(135deg, #4caf50, #45a049);
}

.primary-bg {
  background: linear-gradient(135deg, #354d7c, #5276b0);
}

.document-upload-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e0e0e0;
}

.document-label {
  font-weight: 600;
  color: #354d7c;
  margin-bottom: 12px;
  display: block;
}

.upload-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.file-preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.image-preview {
  margin-top: 8px;
}

.preview-image {
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.camera-video {
  width: 100%;
  height: auto;
  background: #000;
  min-height: 300px;
  object-fit: cover;
}

@media (max-width: 600px) {
  .page-title {
    font-size: 1.2rem;
  }

  .form-section {
    padding: 16px;
  }

  .section-title {
    font-size: 1rem;
  }

  .application-stepper {
    margin: 12px;
  }

  .document-upload-section {
    padding: 12px;
  }

  .upload-buttons {
    flex-direction: column;
  }

  .upload-buttons .v-btn {
    width: 100%;
  }

  .camera-video {
    min-height: 250px;
  }
}
</style>
