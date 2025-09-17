<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { createClient } from '@supabase/supabase-js'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

// --- Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Router
const router = useRouter()
const goBack = () => router.back()

// Form state
const productName = ref('')
const description = ref('')
const price = ref<number | null>(null)
const stock = ref<number | null>(null)

// Sizes (optional)
const availableSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const selectedSizes = ref<string[]>([])

// -------------------- Main Product Photos --------------------
const mainProductImages = ref<File[]>([])
const mainImagePreviews = ref<string[]>([])
const mainPreviewDialog = ref(false)
const selectedMainImage = ref<string | null>(null)
const showPhotoPicker = ref(false)

const dataURItoBlob = (dataURI: string) => {
  const byteString = atob(dataURI.split(',')[1])
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
  return new Blob([ab], { type: mimeString })
}

const pickProductImage = async (source: 'camera' | 'gallery') => {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    })

    if (!photo?.dataUrl) return
    if (mainProductImages.value.length >= 5) {
      alert('Max 5 images allowed')
      return
    }

    const blob = dataURItoBlob(photo.dataUrl)
    const file = new File([blob], `${Date.now()}.png`, { type: blob.type })

    mainProductImages.value.push(file)
    mainImagePreviews.value.push(URL.createObjectURL(file))
    showPhotoPicker.value = false
  } catch (err) {
    console.error(err)
  }
}

const openMainPreview = (image: string) => {
  selectedMainImage.value = image
  mainPreviewDialog.value = true
}

const removeMainImage = (index: number) => {
  URL.revokeObjectURL(mainImagePreviews.value[index])
  mainProductImages.value.splice(index, 1)
  mainImagePreviews.value.splice(index, 1)
}

// -------------------- Varieties --------------------
type Variety = {
  id: number
  name: string
  price: number
  images: File[]
  previews: string[]
}

const varieties = ref<Variety[]>([])

const addVariety = () => {
  varieties.value.push({
    id: Date.now(),
    name: '',
    price: 0,
    images: [],
    previews: [],
  })
}

const pickVarietyImage = async (variety: Variety, source: 'camera' | 'gallery') => {
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    })

    if (!photo?.dataUrl) return
    if (variety.images.length >= 3) {
      alert('Max 3 images per variety')
      return
    }

    const blob = dataURItoBlob(photo.dataUrl)
    const file = new File([blob], `${Date.now()}.png`, { type: blob.type })

    variety.images.push(file)
    variety.previews.push(URL.createObjectURL(file))
  } catch (err) {
    console.error(err)
  }
}

const removeVarietyImage = (variety: Variety, index: number) => {
  URL.revokeObjectURL(variety.previews[index])
  variety.images.splice(index, 1)
  variety.previews.splice(index, 1)
}

// -------------------- Upload images --------------------
const uploadImages = async (files: File[], folder = 'products', shopId: string) => {
  const urls: string[] = []
  for (const file of files) {
    const filePath = `${shopId}/${folder}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('product_lists').upload(filePath, file)
    if (error) {
      console.error('Upload failed:', error.message)
      continue
    }
    const { data } = supabase.storage.from('product_lists').getPublicUrl(filePath)
    urls.push(data.publicUrl)
  }
  return urls
}

// -------------------- Submit --------------------
const submitForm = async () => {
  try {
    // ✅ get user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('No user logged in')

    // ✅ upload main product images
    const imageUrls = await uploadImages(mainProductImages.value, 'main', user.id)

    // ✅ upload for each variety
    const varietyData = []
    for (const v of varieties.value) {
      const urls = await uploadImages(v.images, 'varieties', user.id)
      varietyData.push({
        name: v.name,
        price: v.price,
        images: urls,
      })
    }

    // ✅ insert product
    const { error } = await supabase.from('products').insert([
      {
        shop_id: user.id,
        prod_name: productName.value,
        prod_description: description.value,
        price: price.value,
        stock: stock.value,
        main_img_urls: imageUrls, // jsonb
        sizes: selectedSizes.value, // jsonb
        varieties: varietyData, // jsonb
      },
    ])

    if (error) {
      showSnackbar('❌ Failed to save product. Please try again.', 'error')
      throw error
    }

    // ✅ success
    showSnackbar('✅ Product saved successfully!', 'success')
    console.log('✅ Product saved!')
    router.push('/products')

  } catch (err: any) {
    console.error('❌ Error saving product:', err.message)
    showSnackbar('❌ Something went wrong. Please try again.', 'error')
  }
}

// for snackbar notifications // Snackbar state
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error'>('success')

const showSnackbar = (message: string, type: 'success' | 'error') => {
  snackbarMessage.value = message
  snackbarColor.value = type
  snackbar.value = true
}
</script>

<template>
  <v-app>
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title class="text-h6">Add Product</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <v-form @submit.prevent="submitForm">
          <!-- Main Product Photos -->
          <v-label class="mb-2 font-medium">Main Product Photos (max 5)</v-label>
          <v-btn
            color="primary"
            prepend-icon="mdi-plus"
            rounded="lg"
            @click="showPhotoPicker = true"
          >
            Add Photo
          </v-btn>

          <v-row class="mt-3" dense>
            <v-col v-for="(image, index) in mainImagePreviews" :key="index" cols="6" sm="4" md="3">
              <v-card class="pa-2" rounded="lg" elevation="2" @click="openMainPreview(image)">
                <v-img :src="image" aspect-ratio="1" class="rounded-lg" cover />
                <v-btn
                  icon="mdi-close"
                  size="small"
                  class="remove-btn"
                  color="red"
                  @click.stop="removeMainImage(index)"
                />
              </v-card>
            </v-col>
          </v-row>

          <!-- Fullscreen preview -->
          <v-dialog v-model="mainPreviewDialog" max-width="600">
            <v-card><v-img :src="selectedMainImage" aspect-ratio="1" contain /></v-card>
          </v-dialog>

          <!-- Camera/Gallery Picker for main -->
          <v-dialog v-model="showPhotoPicker" max-width="290">
            <v-card>
              <v-card-title class="headline">Pick Image Source</v-card-title>
              <v-card-actions>
                <v-btn color="primary" @click="pickProductImage('camera')">Use Camera</v-btn>
                <v-btn color="primary" @click="pickProductImage('gallery')">Use Gallery</v-btn>
              </v-card-actions>
            </v-card>
          </v-dialog>

          <!-- Product Info -->
          <v-text-field v-model="productName" label="Product Name" variant="outlined" required />
          <v-textarea v-model="description" label="Description" variant="outlined" rows="3" />
          <v-text-field
            v-model="price"
            label="Price"
            type="number"
            prefix="₱"
            variant="outlined"
            required
          />
          <v-text-field v-model="stock" label="Stock / Quantity" type="number" variant="outlined" />
          <!-- Sizes -->
          <v-label class="mt-4 mb-2 font-medium">
            Available Sizes (buyers will only see the sizes you check)
          </v-label>

          <v-row dense>
            <v-col v-for="size in availableSizes" :key="size" cols="6" sm="4" md="2">
              <v-checkbox
                v-model="selectedSizes"
                :label="size"
                :value="size"
                density="comfortable"
                hide-details
              />
            </v-col>
          </v-row>

          <!-- Varieties -->
          <v-card class="mt-6" rounded="xl" elevation="2">
            <v-card-title class="d-flex justify-between">
              <strong>Varieties</strong>
              <v-btn size="small" color="primary" variant="tonal" @click="addVariety">
                <v-icon start>mdi-plus</v-icon> Add
              </v-btn>
            </v-card-title>
            <v-divider />
            <v-card-text>
              <div v-if="varieties.length === 0" class="text-body-2 text-grey">
                No varieties yet.
              </div>
              <v-row v-else dense>
                <v-col v-for="variety in varieties" :key="variety.id" cols="12" sm="6" md="4">
                  <v-card class="pa-3" rounded="lg" elevation="1">
                    <v-text-field
                      v-model="variety.name"
                      label="Variety Name"
                      variant="outlined"
                      hide-details
                    />
                    <v-text-field
                      v-model="variety.price"
                      label="Variety Price"
                      type="number"
                      prefix="₱"
                      variant="outlined"
                      hide-details
                    />

                    <!-- Variety photos -->
                    <v-label class="mt-2 font-medium">Images (max 3)</v-label>
                    <v-btn
                      size="small"
                      color="primary"
                      @click="pickVarietyImage(variety, 'camera')"
                    >
                      <v-icon start>mdi-camera</v-icon> Camera
                    </v-btn>
                    <v-btn
                      size="small"
                      color="primary"
                      @click="pickVarietyImage(variety, 'gallery')"
                    >
                      <v-icon start>mdi-image</v-icon> Gallery
                    </v-btn>

                    <v-row class="mt-2" dense>
                      <v-col v-for="(img, idx) in variety.previews" :key="idx" cols="6">
                        <v-card class="pa-1" rounded="lg" elevation="1">
                          <v-img :src="img" aspect-ratio="1" cover />
                          <v-btn
                            icon="mdi-close"
                            size="x-small"
                            class="remove-btn"
                            color="red"
                            @click.stop="removeVarietyImage(variety, idx)"
                          />
                        </v-card>
                      </v-col>
                    </v-row>
                  </v-card>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <!-- Submit -->
          <v-btn
            type="submit"
            color="primary"
            rounded="lg"
            prepend-icon="mdi-content-save"
            class="mt-4"
            block
          >
            Save Product
          </v-btn>
        </v-form>

        <!--for alert
        -->
        <v-snackbar
          v-model="snackbar"
          :color="snackbarColor"
          timeout="3000"
          location="bottom right"
          rounded="lg"
        >
          {{ snackbarMessage }}
        </v-snackbar>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.font-medium {
  font-weight: 500;
}
.remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
}
</style>
