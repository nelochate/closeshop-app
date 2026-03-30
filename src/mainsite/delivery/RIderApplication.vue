<template>
  <v-app>
    <v-main class="rider-application-main">
      <!-- Header with back button -->
      <div class="header-section">
        <v-btn
          icon
          variant="text"
          class="back-btn"
          @click="router.back()"
        >
          <v-icon size="28">mdi-arrow-left</v-icon>
        </v-btn>
        <h1 class="page-title">Become a Rider</h1>
        <div class="placeholder"></div>
      </div>

      <!-- Progress Stepper -->
      <v-stepper v-model="currentStep" class="application-stepper" elevation="0">
        <v-stepper-header>
          <v-stepper-step :complete="currentStep > 1" step="1">
            Personal Info
            <small>Basic details</small>
          </v-stepper-step>

          <v-divider></v-divider>

          <v-stepper-step :complete="currentStep > 2" step="2">
            Vehicle Details
            <small>Your ride</small>
          </v-stepper-step>

          <v-divider></v-divider>

          <v-stepper-step :complete="currentStep > 3" step="3">
            Documents
            <small>Requirements</small>
          </v-stepper-step>

          <v-divider></v-divider>

          <v-stepper-step step="4">
            Review & Submit
            <small>Final check</small>
          </v-stepper-step>
        </v-stepper-header>

        <v-stepper-window v-model="currentStep">
          <!-- Step 1: Personal Information -->
          <v-stepper-window-item step="1">
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

                    <v-row>
                      <v-col cols="12">
                        <v-text-field
                          v-model="personalInfo.address"
                          label="Complete Address"
                          :rules="[rules.required]"
                          variant="outlined"
                          prepend-inner-icon="mdi-map-marker"
                          placeholder="Street, Barangay, City/Municipality, Province"
                        ></v-text-field>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="personalInfo.city"
                          label="City/Municipality"
                          :rules="[rules.required]"
                          variant="outlined"
                        ></v-text-field>
                      </v-col>
                      
                      <v-col cols="12" md="6">
                        <v-select
                          v-model="personalInfo.province"
                          :items="provinces"
                          label="Province"
                          :rules="[rules.required]"
                          variant="outlined"
                        ></v-select>
                      </v-col>
                    </v-row>

                    <v-row>
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
                  </div>
                </v-form>
              </v-card-text>
              
              <v-card-actions class="form-actions">
                <v-spacer></v-spacer>
                <v-btn
                  color="primary"
                  size="large"
                  @click="nextStep"
                  :disabled="!personalValid"
                >
                  Next
                  <v-icon right>mdi-arrow-right</v-icon>
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-stepper-window-item>

          <!-- Step 2: Vehicle Details -->
          <v-stepper-window-item step="2">
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
                      <v-alert
                        type="info"
                        variant="tonal"
                        density="compact"
                        class="mt-4"
                      >
                        <strong>Note:</strong> Your vehicle must be registered and in good condition. We may request additional documents for verification.
                      </v-alert>
                    </div>
                  </div>
                </v-form>
              </v-card-text>
              
              <v-card-actions class="form-actions">
                <v-btn
                  variant="text"
                  @click="previousStep"
                >
                  <v-icon left>mdi-arrow-left</v-icon>
                  Back
                </v-btn>
                <v-spacer></v-spacer>
                <v-btn
                  color="primary"
                  size="large"
                  @click="nextStep"
                  :disabled="!vehicleValid"
                >
                  Next
                  <v-icon right>mdi-arrow-right</v-icon>
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-stepper-window-item>

          <!-- Step 3: Documents -->
          <v-stepper-window-item step="3">
            <v-card class="form-card" elevation="2">
              <v-card-text>
                <v-form ref="documentsForm" v-model="documentsValid">
                  <div class="form-section">
                    <h3 class="section-title">
                      <v-icon class="mr-2">mdi-folder-account</v-icon>
                      Required Documents
                    </h3>
                    
                    <v-row>
                      <v-col cols="12">
                        <v-file-input
                          v-model="documents.validId"
                          label="Valid Government ID"
                          :rules="[rules.required, rules.fileSize]"
                          variant="outlined"
                          prepend-inner-icon="mdi-card-account-details"
                          accept="image/*,.pdf"
                          show-size
                          counter
                        >
                          <template v-slot:selection="{ fileNames }">
                            <template v-for="(fileName, index) in fileNames" :key="index">
                              <v-chip
                                v-if="index < 2"
                                color="primary"
                                size="small"
                                class="mr-2"
                              >
                                {{ fileName }}
                              </v-chip>
                            </template>
                          </template>
                        </v-file-input>
                        <small class="text-grey">Accepted formats: JPG, PNG, PDF (Max 5MB)</small>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12">
                        <v-file-input
                          v-model="documents.driversLicense"
                          label="Driver's License"
                          :rules="[rules.required, rules.fileSize]"
                          variant="outlined"
                          prepend-inner-icon="mdi-card-account-details-outline"
                          accept="image/*,.pdf"
                          show-size
                          counter
                        >
                          <template v-slot:selection="{ fileNames }">
                            <template v-for="(fileName, index) in fileNames" :key="index">
                              <v-chip
                                v-if="index < 2"
                                color="primary"
                                size="small"
                                class="mr-2"
                              >
                                {{ fileName }}
                              </v-chip>
                            </template>
                          </template>
                        </v-file-input>
                        <small class="text-grey">Front and back of driver's license</small>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12">
                        <v-file-input
                          v-model="documents.orCr"
                          label="OR/CR Document"
                          :rules="[rules.required, rules.fileSize]"
                          variant="outlined"
                          prepend-inner-icon="mdi-file-document-outline"
                          accept="image/*,.pdf"
                          show-size
                          counter
                        >
                          <template v-slot:selection="{ fileNames }">
                            <template v-for="(fileName, index) in fileNames" :key="index">
                              <v-chip
                                v-if="index < 2"
                                color="primary"
                                size="small"
                                class="mr-2"
                              >
                                {{ fileName }}
                              </v-chip>
                            </template>
                          </template>
                        </v-file-input>
                        <small class="text-grey">Official Receipt and Certificate of Registration</small>
                      </v-col>
                    </v-row>

                    <v-row>
                      <v-col cols="12">
                        <v-file-input
                          v-model="documents.nbiClearance"
                          label="NBI Clearance (Optional)"
                          variant="outlined"
                          prepend-inner-icon="mdi-shield-check"
                          accept="image/*,.pdf"
                          show-size
                          counter
                        >
                          <template v-slot:selection="{ fileNames }">
                            <template v-for="(fileName, index) in fileNames" :key="index">
                              <v-chip
                                v-if="index < 2"
                                color="primary"
                                size="small"
                                class="mr-2"
                              >
                                {{ fileName }}
                              </v-chip>
                            </template>
                          </template>
                        </v-file-input>
                      </v-col>
                    </v-row>

                    <div class="info-alert">
                      <v-alert
                        type="warning"
                        variant="tonal"
                        density="compact"
                        class="mt-4"
                      >
                        <strong>Important:</strong> All documents must be clear and readable. Upload only valid and up-to-date documents.
                      </v-alert>
                    </div>
                  </div>
                </v-form>
              </v-card-text>
              
              <v-card-actions class="form-actions">
                <v-btn
                  variant="text"
                  @click="previousStep"
                >
                  <v-icon left>mdi-arrow-left</v-icon>
                  Back
                </v-btn>
                <v-spacer></v-spacer>
                <v-btn
                  color="primary"
                  size="large"
                  @click="nextStep"
                  :disabled="!documentsValid"
                >
                  Next
                  <v-icon right>mdi-arrow-right</v-icon>
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-stepper-window-item>

          <!-- Step 4: Review & Submit -->
          <v-stepper-window-item step="4">
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
                        <v-simple-table>
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
                              <td>{{ personalInfo.address }}, {{ personalInfo.city }}, {{ personalInfo.province }}</td>
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
                        </v-simple-table>
                      </v-expansion-panel-text>
                    </v-expansion-panel>

                    <!-- Vehicle Information Review -->
                    <v-expansion-panel>
                      <v-expansion-panel-title class="review-title">
                        <v-icon left class="mr-2">mdi-motorbike</v-icon>
                        Vehicle Information
                      </v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <v-simple-table>
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
                        </v-simple-table>
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
                            <v-list-item-icon>
                              <v-icon color="success">mdi-check-circle</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                              <v-list-item-title>Valid Government ID</v-list-item-title>
                              <v-list-item-subtitle>{{ getFileName(documents.validId) }}</v-list-item-subtitle>
                            </v-list-item-content>
                          </v-list-item>
                          
                          <v-list-item v-if="documents.driversLicense">
                            <v-list-item-icon>
                              <v-icon color="success">mdi-check-circle</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                              <v-list-item-title>Driver's License</v-list-item-title>
                              <v-list-item-subtitle>{{ getFileName(documents.driversLicense) }}</v-list-item-subtitle>
                            </v-list-item-content>
                          </v-list-item>
                          
                          <v-list-item v-if="documents.orCr">
                            <v-list-item-icon>
                              <v-icon color="success">mdi-check-circle</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                              <v-list-item-title>OR/CR Document</v-list-item-title>
                              <v-list-item-subtitle>{{ getFileName(documents.orCr) }}</v-list-item-subtitle>
                            </v-list-item-content>
                          </v-list-item>
                          
                          <v-list-item v-if="documents.nbiClearance">
                            <v-list-item-icon>
                              <v-icon color="success">mdi-check-circle</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                              <v-list-item-title>NBI Clearance</v-list-item-title>
                              <v-list-item-subtitle>{{ getFileName(documents.nbiClearance) }}</v-list-item-subtitle>
                            </v-list-item-content>
                          </v-list-item>
                        </v-list>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>

                  <!-- Terms and Conditions -->
                  <div class="terms-section mt-6">
                    <v-checkbox
                      v-model="agreeTerms"
                      :rules="[v => !!v || 'You must agree to the terms and conditions']"
                    >
                      <template v-slot:label>
                        <span>
                          I agree to the 
                          <a href="#" @click.prevent="showTermsDialog = true">Terms and Conditions</a>
                          and confirm that all information provided is accurate and true.
                        </span>
                      </template>
                    </v-checkbox>
                  </div>
                </div>
              </v-card-text>
              
              <v-card-actions class="form-actions">
                <v-btn
                  variant="text"
                  @click="previousStep"
                >
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

    <!-- Terms and Conditions Dialog -->
    <v-dialog v-model="showTermsDialog" max-width="600">
      <v-card>
        <v-card-title class="text-h5 primary-bg white--text">
          Terms and Conditions
        </v-card-title>
        <v-card-text class="mt-4">
          <div class="terms-content">
            <h4>1. Eligibility</h4>
            <p>You must be at least 18 years old and possess a valid driver's license to become a rider.</p>
            
            <h4>2. Vehicle Requirements</h4>
            <p>Your vehicle must be properly registered, insured, and in good working condition.</p>
            
            <h4>3. Background Check</h4>
            <p>We reserve the right to conduct background checks and verify all submitted documents.</p>
            
            <h4>4. Code of Conduct</h4>
            <p>Riders must maintain professional conduct, follow traffic rules, and provide excellent service.</p>
            
            <h4>5. Fees and Commissions</h4>
            <p>A commission fee will be deducted from each successful delivery. Rates are subject to change with notice.</p>
            
            <h4>6. Termination</h4>
            <p>Violation of terms may result in immediate termination of rider status.</p>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" @click="showTermsDialog = false">
            I Understand
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Success Dialog -->
    <v-dialog v-model="showSuccessDialog" persistent max-width="500">
      <v-card>
        <v-card-title class="text-h5 success-bg white--text">
          Application Submitted!
        </v-card-title>
        <v-card-text class="text-center pa-6">
          <v-icon size="80" color="success" class="mb-4">mdi-check-circle</v-icon>
          <h3>Thank you for applying!</h3>
          <p class="mt-4">
            Your rider application has been submitted successfully. 
            We will review your application and get back to you within 3-5 business days.
          </p>
          <v-alert type="info" variant="tonal" class="mt-4">
            Application ID: <strong>{{ applicationId }}</strong>
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" block @click="goToProfile" size="large">
            Return to Profile
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script setup>
import { ref, onMounted } from 'vue'
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

// Form references
const personalForm = ref(null)
const vehicleForm = ref(null)
const documentsForm = ref(null)

// Form data
const personalInfo = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  province: '',
  birthdate: '',
  gender: ''
})

const vehicleInfo = ref({
  vehicleType: '',
  brand: '',
  model: '',
  year: '',
  color: '',
  plateNumber: '',
  orCrNumber: ''
})

const documents = ref({
  validId: null,
  driversLicense: null,
  orCr: null,
  nbiClearance: null
})

// Options
const vehicleTypes = [
  'Motorcycle - Under 200cc',
  'Motorcycle - 200cc and above',
  'Scooter',
  'Electric Bike',
  'Car',
  'Van',
  'Bicycle'
]

const provinces = [
  'Metro Manila',
  'Bulacan',
  'Cavite',
  'Laguna',
  'Rizal',
  'Pampanga',
  'Batangas',
  'Quezon'
]

// Validation rules
const rules = {
  required: (v) => !!v || 'This field is required',
  email: (v) => /.+@.+\..+/.test(v) || 'Invalid email address',
  phone: (v) => /^09\d{9}$/.test(v) || 'Invalid phone number (must be 09XXXXXXXXX)',
  age: (v) => {
    if (!v) return true
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
  fileSize: (v) => {
    if (!v) return true
    return (v.size / 1024 / 1024) <= 5 || 'File size must be less than 5MB'
  }
}

// Helper functions
const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const getFileName = (file) => {
  if (!file) return ''
  return file.name
}

const nextStep = () => {
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

// Upload file to Supabase storage
const uploadFile = async (file, folder, fileName) => {
  if (!file) return null
  
  const fileExt = file.name.split('.').pop()
  const filePath = `${folder}/${fileName}.${fileExt}`
  
  const { data, error } = await supabase.storage
    .from('rider-documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    })
  
  if (error) {
    console.error('Error uploading file:', error)
    throw error
  }
  
  const { data: { publicUrl } } = supabase.storage
    .from('rider-documents')
    .getPublicUrl(filePath)
  
  return publicUrl
}

// Submit application
const submitApplication = async () => {
  submitting.value = true
  
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')
    
    // Upload documents
    const validIdUrl = documents.value.validId ? 
      await uploadFile(documents.value.validId, 'valid-ids', `${user.id}_valid_id`) : null
    
    const driversLicenseUrl = documents.value.driversLicense ? 
      await uploadFile(documents.value.driversLicense, 'licenses', `${user.id}_license`) : null
    
    const orCrUrl = documents.value.orCr ? 
      await uploadFile(documents.value.orCr, 'or-cr', `${user.id}_or_cr`) : null
    
    const nbiClearanceUrl = documents.value.nbiClearance ? 
      await uploadFile(documents.value.nbiClearance, 'nbi', `${user.id}_nbi`) : null
    
    // Insert rider application
    const { data, error } = await supabase
      .from('riders')
      .insert([
        {
          user_id: user.id,
          first_name: personalInfo.value.firstName,
          last_name: personalInfo.value.lastName,
          email: personalInfo.value.email,
          phone: personalInfo.value.phone,
          address: personalInfo.value.address,
          city: personalInfo.value.city,
          province: personalInfo.value.province,
          birthdate: personalInfo.value.birthdate,
          gender: personalInfo.value.gender,
          vehicle_type: vehicleInfo.value.vehicleType,
          vehicle_brand: vehicleInfo.value.brand,
          vehicle_model: vehicleInfo.value.model,
          vehicle_year: vehicleInfo.value.year,
          vehicle_color: vehicleInfo.value.color,
          vehicle_plate: vehicleInfo.value.plateNumber,
          vehicle_or_cr: vehicleInfo.value.orCrNumber,
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
    
    applicationId.value = data.id
    showSuccessDialog.value = true
    
  } catch (error) {
    console.error('Error submitting application:', error)
    alert('Failed to submit application. Please try again.')
  } finally {
    submitting.value = false
  }
}

const goToProfile = () => {
  router.push('/profile')
}

// Load user data on mount
onMounted(async () => {
  if (authStore.userData) {
    personalInfo.value.firstName = authStore.userData.user_metadata?.first_name || ''
    personalInfo.value.lastName = authStore.userData.user_metadata?.last_name || ''
    personalInfo.value.email = authStore.userData.email || ''
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      personalInfo.value.firstName = user.user_metadata?.first_name || ''
      personalInfo.value.lastName = user.user_metadata?.last_name || ''
      personalInfo.value.email = user.email || ''
    }
  }
})
</script>

<style scoped>
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

/* Responsive */
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
  
  :deep(.v-stepper__step) {
    padding: 12px 8px;
  }
  
  :deep(.v-stepper__step__label) {
    font-size: 0.7rem;
  }
  
  :deep(.v-stepper__step small) {
    display: none;
  }
}
</style>