<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

// Router
const router = useRouter()
const route = useRoute()
const goBack = () => router.back()

// Mode check
const isEditMode = ref(false)
const productId = ref<number | null>(null)

// Form state
const productName = ref('')
const description = ref('')
const price = ref<number | null>(null)
const stock = ref<number | null>(null)
const availableSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const selectedSizes = ref<string[]>([])
const hasSizes = ref(false)
const hasVarieties = ref(false)
const hasSamePrice = ref(false)
const isSubmitting = ref(false)

// Main images
const mainProductImages = ref<File[]>([])
const mainImagePreviews = ref<string[]>([])
const mainPreviewDialog = ref(false)
const selectedMainImage = ref<string | null>(null)
const showPhotoPicker = ref(false)

// Varieties
type Variety = {
  id: number
  name: string
  price: number
  images: File[] | string[]
  previews: string[]
}
const varieties = ref<Variety[]>([])

// Snackbar
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error'>('success')

const showSnackbar = (message: string, type: 'success' | 'error') => {
  snackbarMessage.value = message
  snackbarColor.value = type
  snackbar.value = true
}

// -------------------- Image helpers --------------------
const pickProductImage = async (source: 'camera' | 'gallery') => {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    })

    if (!photo?.webPath) return
    if (mainProductImages.value.length >= 5) {
      alert('Max 5 images allowed')
      return
    }

    const response = await fetch(photo.webPath)
    const blob = await response.blob()
    const file = new File([blob], `${Date.now()}.png`, { type: blob.type })

    mainProductImages.value.push(file)
    mainImagePreviews.value.push(photo.webPath)
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
  if (confirm('Remove this image?')) {
    URL.revokeObjectURL(mainImagePreviews.value[index])
    mainProductImages.value.splice(index, 1)
    mainImagePreviews.value.splice(index, 1)
  }
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

// -------------------- Remove old images --------------------
const removeOldImages = async (urls: string[]) => {
  if (!urls?.length) return
  const paths = urls
    .map((url: string) => {
      const parts = url.split('/product_lists/')
      return parts[1] ? parts[1] : null
    })
    .filter((p: string | null) => p !== null) as string[]

  if (paths.length) {
    const { error } = await supabase.storage.from('product_lists').remove(paths)
    if (error) console.warn('⚠️ Failed to remove old images:', error.message)
  }
}

// -------------------- Submit --------------------
const submitForm = async () => {
  if (isSubmitting.value) return // prevent double-clicks
  isSubmitting.value = true

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('No user logged in')

    // find shop id
    const { data: shop } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!shop) throw new Error('No shop found. Please create a shop first.')

    const shopId = shop.id

    // upload new images
    const newImageUrls = mainProductImages.value.length
      ? await uploadImages(mainProductImages.value, 'main', shopId)
      : []
    const finalImageUrls = newImageUrls.length ? newImageUrls : mainImagePreviews.value

    // varieties
    const varietyData = []
    for (const v of varieties.value) {
      let urls: string[] = []
      if (Array.isArray(v.images) && v.images.length && v.images[0] instanceof File) {
        urls = await uploadImages(v.images as File[], 'varieties', shopId)
      } else if (Array.isArray(v.images)) {
        urls = v.images as string[]
      }

      // ✅ If hasSamePrice, use main price
      const varietyPrice = hasSamePrice.value ? price.value : v.price

      varietyData.push({ name: v.name, price: varietyPrice, images: urls })
    }

    if (isEditMode.value && productId.value) {
      const { data: oldProduct } = await supabase
        .from('products')
        .select('main_img_urls, varieties')
        .eq('id', productId.value)
        .single()

      const { error } = await supabase
        .from('products')
        .update({
          prod_name: productName.value,
          prod_description: description.value,
          price: price.value,
          stock: stock.value,
          main_img_urls: finalImageUrls,
          sizes: selectedSizes.value,
          varieties: varietyData,
        })
        .eq('id', productId.value)

      if (error) throw error

      if (newImageUrls.length && oldProduct?.main_img_urls) {
        await removeOldImages(oldProduct.main_img_urls)
      }
      if (oldProduct?.varieties) {
        for (const oldVariety of oldProduct.varieties) {
          const newVariety = varietyData.find((v) => v.name === oldVariety.name)
          if (newVariety && newVariety.images.length && oldVariety.images) {
            await removeOldImages(oldVariety.images)
          }
        }
      }

      showSnackbar('✅ Product updated successfully!', 'success')
    } else {
      await supabase.from('products').insert([
        {
          shop_id: shopId,
          prod_name: productName.value,
          prod_description: description.value,
          price: price.value,
          stock: stock.value,
          main_img_urls: finalImageUrls,
          sizes: hasSizes.value ? selectedSizes.value : [],
          varieties: hasVarieties.value ? varietyData : [],
        },
      ])
      showSnackbar('✅ Product added successfully!', 'success')
      resetForm()
    }
  } catch (err: any) {
    console.error('❌ Error saving product:', err.message)
    showSnackbar('❌ Something went wrong. Please try again.', 'error')
  } finally {
    isSubmitting.value = false // ✅ always re-enable button
  }
}

// -------------------- Prefill if editing --------------------
onMounted(async () => {
  if (productId.value) {
    isEditMode.value = true

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId.value)
      .single()

    if (!error && data) {
      productName.value = data.prod_name
      description.value = data.prod_description
      price.value = data.price
      stock.value = data.stock
      selectedSizes.value = data.sizes || []
      mainImagePreviews.value = data.main_img_urls || []

      // 🟢 Check for varieties
      if (data.varieties && data.varieties.length > 0) {
        hasVarieties.value = true

        // 🟢 Auto-detect if all variety prices are the same as the main product
        hasSamePrice.value = data.varieties.every((v: any) => v.price === data.price)

        // 🟢 Map varieties back into editable form
        varieties.value = data.varieties.map((v: any, idx: number) => ({
          id: idx,
          name: v.name,
          price: v.price,
          images: v.images || [],
          previews: v.images || [],
        }))
      }
    }
  }
})

const addVariety = () => {
  varieties.value.push({
    id: Date.now(),
    name: '',
    price: 0,
    images: [],
    previews: [],
  })
}

// -------------------- Variety image helpers --------------------
const pickVarietyImage = async (variety: Variety, source: 'camera' | 'gallery') => {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    })

    if (!photo?.webPath) return
    if (variety.images.length >= 3) {
      alert('Max 3 images per variety')
      return
    }

    const response = await fetch(photo.webPath)
    const blob = await response.blob()
    const file = new File([blob], `${Date.now()}.png`, { type: blob.type })

    variety.images.push(file)
    variety.previews.push(photo.webPath)
  } catch (err) {
    console.error('Error picking variety image:', err)
  }
}

const removeVarietyImage = (variety: Variety, index: number) => {
  URL.revokeObjectURL(variety.previews[index])
  variety.images.splice(index, 1)
  variety.previews.splice(index, 1)
}

// reset form
const resetForm = () => {
  productName.value = ''
  description.value = ''
  price.value = null
  stock.value = null
  selectedSizes.value = []
  hasSizes.value = false
  hasVarieties.value = false
  hasSamePrice.value = false
  mainProductImages.value = []
  mainImagePreviews.value = []
  varieties.value = []

  // scroll to top after reset
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>
<template>
  <v-app>
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title class="text-h6">{{
        isEditMode ? 'Edit Product' : 'Add Product'
      }}</v-toolbar-title>
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

          <!-- Camera/Gallery Picker -->
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

          <!-- --- Sizes Option --- -->
          <v-switch v-model="hasSizes" label="Has Sizes?" color="primary" inset />

          <!-- Sizes Section -->
          <v-expand-transition>
            <div v-if="hasSizes">
              <v-label class="mt-2 mb-2 font-medium">Available Sizes</v-label>
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
            </div>
          </v-expand-transition>

          <!-- --- Varieties Option --- -->
          <v-switch v-model="hasVarieties" label="Has Varieties?" color="primary" inset />

          <v-expand-transition>
            <div v-if="hasVarieties">
              <!-- Same Price Switch -->
              <v-switch
                v-model="hasSamePrice"
                label="Same price as main product?"
                color="primary"
                inset
              />

              <v-card class="mt-4" rounded="xl" elevation="2">
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

                        <!-- Conditionally show price input -->
                        <v-expand-transition>
                          <div v-if="!hasSamePrice">
                            <v-text-field
                              v-model="variety.price"
                              label="Variety Price"
                              type="number"
                              prefix="₱"
                              variant="outlined"
                              hide-details
                            />
                          </div>
                        </v-expand-transition>

                        <!-- Image inputs -->
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
            </div>
          </v-expand-transition>

          <!-- Submit -->
          <v-btn
            type="submit"
            color="primary"
            rounded="lg"
            prepend-icon="mdi-content-save"
            class="mt-4"
            block
            :loading="isSubmitting"
            :disabled="isSubmitting"
          >
            {{ isEditMode ? 'Update Product' : 'Add Product' }}
          </v-btn>
        </v-form>

        <!-- Snackbar -->
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
