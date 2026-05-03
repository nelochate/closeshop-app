<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { StatusBar, Style } from '@capacitor/status-bar'

// ------------------ Router ------------------
const router = useRouter()
const route = useRoute()
const goBack = () => router.back()

// ------------------ Mode check ------------------
const productId = ref<string | null>(null)
const isEditMode = ref(false)

// ------------------ Form state ------------------
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

// ------------------ Main images ------------------
const mainProductImages = ref<File[]>([])
const mainImagePreviews = ref<string[]>([])
const mainPreviewDialog = ref(false)
const selectedMainImage = ref<string | null>(null)
const showPhotoPicker = ref(false)
const isCameraActive = ref(false) // Track camera state

// Track which variety we're adding images to
const selectedVarietyForImage = ref<Variety | null>(null)

// ------------------ Varieties ------------------
type Variety = {
  id: number
  name: string
  price: number
  images: File[] | string[]
  previews: string[]
}
const varieties = ref<Variety[]>([])

// ------------------ Snackbar ------------------
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error'>('success')
const showSnackbar = (message: string, type: 'success' | 'error') => {
  snackbarMessage.value = message
  snackbarColor.value = type
  snackbar.value = true
}

// Helper to hide app bar and status bar
const hideAppBar = async () => {
  isCameraActive.value = true
  document.body.classList.add('camera-active')
  
  try {
    await StatusBar.hide()
  } catch (error) {
    console.log('StatusBar plugin not available on web')
  }
}

const showAppBar = async () => {
  isCameraActive.value = false
  document.body.classList.remove('camera-active')
  
  try {
    await StatusBar.show()
    await StatusBar.setStyle({ style: Style.Light })
  } catch (error) {
    console.log('StatusBar plugin not available on web')
  }
}

// Helper to process multiple images
const processImages = async (photos: any[], isVariety: boolean = false, variety?: Variety) => {
  const maxImages = isVariety ? 3 : 5
  const currentCount = isVariety ? (variety?.images.length || 0) : mainProductImages.value.length
  
  for (const photo of photos) {
    if (currentCount + mainProductImages.value.length >= maxImages) {
      showSnackbar(`Max ${maxImages} images allowed${isVariety ? ' per variety' : ''}`, 'error')
      break
    }
    
    if (photo?.webPath) {
      const response = await fetch(photo.webPath)
      const blob = await response.blob()
      const file = new File([blob], `${Date.now()}.png`, { type: blob.type })
      
      if (isVariety && variety) {
        variety.images.push(file)
        variety.previews.push(photo.webPath)
      } else {
        mainProductImages.value.push(file)
        mainImagePreviews.value.push(photo.webPath)
      }
    }
  }
  
  showSnackbar(`Added ${photos.length} image(s) successfully`, 'success')
}

// ------------------ Main Image Helpers ------------------
const openPhotoPickerForMain = async () => {
  showPhotoPicker.value = false
  
  setTimeout(async () => {
    await pickProductImages()
  }, 100)
}

const pickProductImages = async () => {
  try {
    await hideAppBar()
    
    // First try to pick multiple photos from gallery
    const photos = await Camera.pickImages({
      quality: 90,
      limit: 5, // Max 5 images
      presentationStyle: 'fullscreen'
    })
    
    await showAppBar()
    
    if (photos && photos.photos && photos.photos.length > 0) {
      await processImages(photos.photos, false)
    }
  } catch (error: any) {
    await showAppBar()
    console.error('Error picking images:', error)
    
    // If pickImages fails or user cancels, try single photo picker as fallback
    if (error.message?.toLowerCase().includes('not implemented') || 
        error.message?.toLowerCase().includes('unavailable')) {
      // Fallback to single photo picker
      await pickSingleProductImage()
    } else if (!error.message?.toLowerCase().includes('cancel')) {
      showSnackbar('Failed to pick images', 'error')
    }
  }
}

// Fallback: Single image picker for older devices or web
const pickSingleProductImage = async () => {
  try {
    await hideAppBar()
    
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: CameraSource.Photos,
      allowEditing: false,
      presentationStyle: 'fullscreen',
      width: 1920,
      height: 1080,
      saveToGallery: false,
      correctOrientation: true
    })
    
    await showAppBar()
    
    if (photo?.webPath) {
      if (mainProductImages.value.length >= 5) {
        showSnackbar('Max 5 images allowed', 'error')
        return
      }
      
      const response = await fetch(photo.webPath)
      const blob = await response.blob()
      const file = new File([blob], `${Date.now()}.png`, { type: blob.type })
      
      mainProductImages.value.push(file)
      mainImagePreviews.value.push(photo.webPath)
      showSnackbar('Image added successfully', 'success')
    }
  } catch (error) {
    await showAppBar()
    console.error('Error picking single image:', error)
    if (error instanceof Error && !error.message.toLowerCase().includes('cancel')) {
      showSnackbar('Failed to pick image', 'error')
    }
  }
}

// Option to take photo with camera (single photo)
const takePhotoWithCamera = async () => {
  try {
    await hideAppBar()
    
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      allowEditing: false,
      presentationStyle: 'fullscreen',
      width: 1920,
      height: 1080,
      saveToGallery: false,
      correctOrientation: true
    })
    
    await showAppBar()
    
    if (photo?.webPath) {
      if (mainProductImages.value.length >= 5) {
        showSnackbar('Max 5 images allowed', 'error')
        return
      }
      
      const response = await fetch(photo.webPath)
      const blob = await response.blob()
      const file = new File([blob], `${Date.now()}.png`, { type: blob.type })
      
      mainProductImages.value.push(file)
      mainImagePreviews.value.push(photo.webPath)
      showSnackbar('Image added successfully', 'success')
    }
  } catch (error) {
    await showAppBar()
    console.error('Error taking photo:', error)
    if (error instanceof Error && !error.message.toLowerCase().includes('cancel')) {
      showSnackbar('Failed to take photo', 'error')
    }
  }
}

// Show image source dialog for main images
const showImageSourceDialog = () => {
  // Create a custom dialog for image source selection
  const actionSheet = document.createElement('div')
  actionSheet.className = 'image-source-dialog'
  actionSheet.innerHTML = `
    <div class="image-source-overlay" onclick="this.parentElement.remove()"></div>
    <div class="image-source-options">
      <div class="image-source-title">Add Photos</div>
      <button class="image-source-btn gallery-btn" id="galleryBtn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="20" height="20" rx="2"></rect>
          <circle cx="8.5" cy="8.5" r="2.5"></circle>
          <polyline points="2 17 8 11 13 16 17 12 22 17"></polyline>
        </svg>
        <span>Choose from Gallery (Multiple)</span>
      </button>
      <button class="image-source-btn camera-btn" id="cameraBtn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
        <span>Take Photo (Single)</span>
      </button>
      <button class="image-source-btn cancel-btn" id="cancelBtn">Cancel</button>
    </div>
  `
  document.body.appendChild(actionSheet)
  
  document.getElementById('galleryBtn')?.addEventListener('click', () => {
    actionSheet.remove()
    pickProductImages()
  })
  
  document.getElementById('cameraBtn')?.addEventListener('click', () => {
    actionSheet.remove()
    takePhotoWithCamera()
  })
  
  document.getElementById('cancelBtn')?.addEventListener('click', () => {
    actionSheet.remove()
  })
}

// Variety Image Helpers - Multiple selection for variety images
const openPhotoPickerForVariety = async (variety: Variety) => {
  selectedVarietyForImage.value = variety
  setTimeout(async () => {
    await pickVarietyImages()
  }, 100)
}

const pickVarietyImages = async () => {
  if (!selectedVarietyForImage.value) return
  
  try {
    await hideAppBar()
    
    const photos = await Camera.pickImages({
      quality: 90,
      limit: 3, // Max 3 images per variety
      presentationStyle: 'fullscreen'
    })
    
    await showAppBar()
    
    if (photos && photos.photos && photos.photos.length > 0) {
      const variety = selectedVarietyForImage.value
      const remainingSlots = 3 - variety.images.length
      const photosToAdd = photos.photos.slice(0, remainingSlots)
      
      if (photosToAdd.length > 0) {
        await processImages(photosToAdd, true, variety)
      }
      
      if (photos.photos.length > remainingSlots) {
        showSnackbar(`Only added ${remainingSlots} of ${photos.photos.length} images (max 3 per variety)`, 'error')
      }
    }
  } catch (error: any) {
    await showAppBar()
    console.error('Error picking variety images:', error)
    
    // Fallback to single image picker
    if (error.message?.toLowerCase().includes('not implemented') || 
        error.message?.toLowerCase().includes('unavailable')) {
      await pickSingleVarietyImage()
    } else if (!error.message?.toLowerCase().includes('cancel')) {
      showSnackbar('Failed to pick images', 'error')
    }
  } finally {
    selectedVarietyForImage.value = null
  }
}

// Fallback: Single image picker for variety
const pickSingleVarietyImage = async () => {
  if (!selectedVarietyForImage.value) return
  
  try {
    await hideAppBar()
    
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: CameraSource.Photos,
      allowEditing: false,
      presentationStyle: 'fullscreen',
      width: 1920,
      height: 1080,
      saveToGallery: false,
      correctOrientation: true
    })
    
    await showAppBar()
    
    if (photo?.webPath) {
      const variety = selectedVarietyForImage.value
      if (variety.images.length >= 3) {
        showSnackbar('Max 3 images per variety', 'error')
        return
      }
      
      const response = await fetch(photo.webPath)
      const blob = await response.blob()
      const file = new File([blob], `${Date.now()}.png`, { type: blob.type })
      variety.images.push(file)
      variety.previews.push(photo.webPath)
      showSnackbar('Image added successfully', 'success')
    }
  } catch (error) {
    await showAppBar()
    console.error('Error picking variety image:', error)
    if (error instanceof Error && !error.message.toLowerCase().includes('cancel')) {
      showSnackbar('Failed to pick image', 'error')
    }
  }
}

// Take photo for variety (single)
const takeVarietyPhoto = async (variety: Variety) => {
  selectedVarietyForImage.value = variety
  
  try {
    await hideAppBar()
    
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      allowEditing: false,
      presentationStyle: 'fullscreen',
      width: 1920,
      height: 1080,
      saveToGallery: false,
      correctOrientation: true
    })
    
    await showAppBar()
    
    if (photo?.webPath) {
      if (variety.images.length >= 3) {
        showSnackbar('Max 3 images per variety', 'error')
        return
      }
      
      const response = await fetch(photo.webPath)
      const blob = await response.blob()
      const file = new File([blob], `${Date.now()}.png`, { type: blob.type })
      variety.images.push(file)
      variety.previews.push(photo.webPath)
      showSnackbar('Photo added successfully', 'success')
    }
  } catch (error) {
    await showAppBar()
    console.error('Error taking photo:', error)
    if (error instanceof Error && !error.message.toLowerCase().includes('cancel')) {
      showSnackbar('Failed to take photo', 'error')
    }
  } finally {
    selectedVarietyForImage.value = null
  }
}

// Show image source dialog for variety
const showVarietyImageSourceDialog = (variety: Variety) => {
  const actionSheet = document.createElement('div')
  actionSheet.className = 'image-source-dialog'
  actionSheet.innerHTML = `
    <div class="image-source-overlay" onclick="this.parentElement.remove()"></div>
    <div class="image-source-options">
      <div class="image-source-title">Add Photos for ${variety.name || 'Variety'}</div>
      <button class="image-source-btn gallery-btn" id="galleryBtn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="20" height="20" rx="2"></rect>
          <circle cx="8.5" cy="8.5" r="2.5"></circle>
          <polyline points="2 17 8 11 13 16 17 12 22 17"></polyline>
        </svg>
        <span>Choose from Gallery (Multiple)</span>
      </button>
      <button class="image-source-btn camera-btn" id="cameraBtn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
        <span>Take Photo (Single)</span>
      </button>
      <button class="image-source-btn cancel-btn" id="cancelBtn">Cancel</button>
    </div>
  `
  document.body.appendChild(actionSheet)
  
  document.getElementById('galleryBtn')?.addEventListener('click', () => {
    actionSheet.remove()
    selectedVarietyForImage.value = variety
    pickVarietyImages()
  })
  
  document.getElementById('cameraBtn')?.addEventListener('click', () => {
    actionSheet.remove()
    takeVarietyPhoto(variety)
  })
  
  document.getElementById('cancelBtn')?.addEventListener('click', () => {
    actionSheet.remove()
  })
}

const openMainPreview = (image: string) => {
  selectedMainImage.value = image
  mainPreviewDialog.value = true
}

const removeMainImage = (index: number) => {
  if (confirm('Remove this image?')) {
    if (mainImagePreviews.value[index] && mainImagePreviews.value[index].startsWith('blob:')) {
      URL.revokeObjectURL(mainImagePreviews.value[index])
    }
    mainProductImages.value.splice(index, 1)
    mainImagePreviews.value.splice(index, 1)
  }
}

const removeVarietyImage = (variety: Variety, index: number) => {
  if (confirm('Remove this image?')) {
    if (variety.previews[index] && variety.previews[index].startsWith('blob:')) {
      URL.revokeObjectURL(variety.previews[index])
    }
    variety.images.splice(index, 1)
    variety.previews.splice(index, 1)
  }
}

// ------------------ Upload images ------------------
const uploadImages = async (files: File[], folder = 'products', shopId: string) => {
  const urls: string[] = []
  for (const file of files) {
    const filePath = `${shopId}/${folder}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('product_lists').upload(filePath, file)
    if (!error) {
      const { data } = supabase.storage.from('product_lists').getPublicUrl(filePath)
      urls.push(data.publicUrl)
    }
  }
  return urls
}

// ------------------ Remove old images ------------------
const removeOldImages = async (urls: string[]) => {
  if (!urls?.length) return
  const paths = urls
    .map(url => url.split('/product_lists/')[1])
    .filter(Boolean) as string[]
  if (paths.length) {
    const { error } = await supabase.storage.from('product_lists').remove(paths)
    if (error) console.warn('Failed to remove old images:', error.message)
  }
}

// ------------------ Submit form ------------------
const submitForm = async () => {
  if (isSubmitting.value) return
  isSubmitting.value = true

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (!user || userError) throw new Error('No user logged in')

    const { data: shop } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!shop) throw new Error('No shop found. Please create a shop first.')

    const shopId = shop.id

    const newImageUrls = mainProductImages.value.length
      ? await uploadImages(mainProductImages.value, 'main', shopId)
      : []

    const finalImageUrls = newImageUrls.length ? newImageUrls : mainImagePreviews.value

    const varietyData: { name: string; price: number; images: string[] }[] = []

    for (const v of varieties.value) {
      let urls: string[] = []

      if (Array.isArray(v.images) && v.images[0] instanceof File) {
        urls = await uploadImages(v.images as File[], 'varieties', shopId)
      } else if (Array.isArray(v.images)) {
        urls = v.images as string[]
      }

      const varietyPrice = hasSamePrice.value ? price.value! : v.price

      varietyData.push({
        name: v.name,
        price: varietyPrice,
        images: urls
      })
    }

    if (isEditMode.value && productId.value) {
      const { data: oldProduct, error: fetchError } = await supabase
        .from('products')
        .select('main_img_urls, varieties')
        .eq('id', productId.value)
        .single()
      if (fetchError) throw fetchError

      const { error: updateError } = await supabase
        .from('products')
        .update({
          prod_name: productName.value,
          prod_description: description.value,
          price: price.value,
          stock: stock.value,
          main_img_urls: finalImageUrls,
          sizes: hasSizes.value ? selectedSizes.value : [],
          varieties: hasVarieties.value ? varietyData : [],
        })
        .eq('id', productId.value)
      if (updateError) throw updateError

      if (newImageUrls.length && oldProduct?.main_img_urls) {
        await removeOldImages(oldProduct.main_img_urls)
      }

      if (oldProduct?.varieties) {
        for (const oldVariety of oldProduct.varieties) {
          const newVariety = varietyData.find(v => v.name === oldVariety.name)
          if (newVariety && newVariety.images.length && oldVariety.images) {
            await removeOldImages(oldVariety.images)
          }
        }
      }

      showSnackbar('✅ Product updated successfully!', 'success')
    } else {
      const { error: insertError } = await supabase.from('products').insert([{
        shop_id: shopId,
        prod_name: productName.value,
        prod_description: description.value,
        price: price.value,
        stock: stock.value,
        main_img_urls: finalImageUrls,
        sizes: hasSizes.value ? selectedSizes.value : [],
        varieties: hasVarieties.value ? varietyData : [],
      }])

      if (insertError) throw insertError

      showSnackbar('✅ Product added successfully!', 'success')
      resetForm()
    }
  } catch (err: any) {
    console.error('❌ Error saving product:', err)
    showSnackbar(`❌ ${err.message || 'Something went wrong'}`, 'error')
  } finally {
    isSubmitting.value = false
  }
}

// ------------------ Reset form ------------------
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
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ------------------ Prefill for edit ------------------
onMounted(async () => {
  const id = route.params.id as string
  if (id) {
    isEditMode.value = true
    productId.value = id

    const { data, error } = await supabase.from('products').select('*').eq('id', id).single()
    if (!error && data) {
      productName.value = data.prod_name
      description.value = data.prod_description
      price.value = data.price
      stock.value = data.stock
      selectedSizes.value = data.sizes || []
      mainImagePreviews.value = data.main_img_urls || []

      if (data.varieties && data.varieties.length > 0) {
        hasVarieties.value = true
        hasSamePrice.value = data.varieties.every((v: any) => v.price === data.price)
        varieties.value = data.varieties.map((v: any, idx: number) => ({
          id: idx,
          name: v.name,
          price: v.price,
          images: v.images || [],
          previews: v.images || []
        }))
      }
    }
  }
})

// ------------------ Add new variety ------------------
const addVariety = () => {
  varieties.value.push({
    id: Date.now(),
    name: '',
    price: 0,
    images: [],
    previews: []
  })
}
</script>

<template>
  <v-app>
    <!-- App bar with conditional hiding -->
    <v-app-bar 
      class="top-bar" 
      flat 
      color="primary" 
      dark
      :class="{ 'app-bar-hidden': isCameraActive }"
    >
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title class="text-h6">{{
        isEditMode ? 'Edit Product' : 'Add Product'
      }}</v-toolbar-title>
    </v-app-bar>

    <v-main :class="{ 'main-shifted': isCameraActive }">
      <v-container class="py-6">
        <v-form @submit.prevent="submitForm">
          <!-- Main Product Photos -->
          <v-label class="mb-2 font-weight-medium">Main Product Photos (max 5)</v-label>
          <div class="d-flex gap-2 flex-wrap">
            <v-btn
              color="primary"
              prepend-icon="mdi-image-multiple"
              rounded="lg"
              @click="showImageSourceDialog"
            >
              Add Photos
            </v-btn>
          </div>

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
            <v-card>
              <v-img :src="selectedMainImage" aspect-ratio="1" contain />
            </v-card>
          </v-dialog>

          <!-- Product Info -->
          <v-text-field 
            v-model="productName" 
            label="Product Name" 
            variant="outlined" 
            required 
            class="mt-4"
          />
          <v-textarea 
            v-model="description" 
            label="Description" 
            variant="outlined" 
            rows="3" 
          />
          <v-text-field
            v-model="price"
            label="Price"
            type="number"
            prefix="₱"
            variant="outlined"
            required
          />
          <v-text-field 
            v-model="stock" 
            label="Stock / Quantity" 
            type="number" 
            variant="outlined" 
          />

          <!-- --- Sizes Option --- -->
          <v-switch v-model="hasSizes" label="Has Sizes?" color="primary" inset />

          <!-- Sizes Section -->
          <v-expand-transition>
            <div v-if="hasSizes">
              <v-label class="mt-2 mb-2 font-weight-medium">Available Sizes</v-label>
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
                              class="mt-2"
                            />
                          </div>
                        </v-expand-transition>

                        <!-- Image inputs -->
                        <v-label class="mt-3 mb-2 font-weight-medium">Images (max 3)</v-label>
                        <div class="d-flex gap-2">
                          <v-btn
                            size="small"
                            color="primary"
                            variant="tonal"
                            @click="showVarietyImageSourceDialog(variety)"
                          >
                            <v-icon start>mdi-image-multiple</v-icon> Add Images
                          </v-btn>
                        </div>

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
          location="bottom"
          rounded="lg"
        >
          {{ snackbarMessage }}
        </v-snackbar>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.top-bar {
  padding-top: env(safe-area-inset-top, 0px);
  transition: transform 0.3s ease;
}

/* Hide app bar when camera is active */
.top-bar.app-bar-hidden {
  transform: translateY(-100%);
  display: none;
}

.main-shifted {
  margin-top: 0;
}

.font-weight-medium {
  font-weight: 500;
}

.remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
}

.gap-2 {
  gap: 8px;
}
</style>

<style>
/* Global styles to ensure app bar is hidden when camera is active */
body.camera-active .v-app-bar {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  transform: translateY(-100%) !important;
}

body.camera-active {
  overflow: hidden;
}

/* Image Source Dialog Styles */
.image-source-dialog {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-source-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.image-source-options {
  position: relative;
  background: white;
  border-radius: 20px;
  width: 90%;
  max-width: 320px;
  overflow: hidden;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(100px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.image-source-title {
  padding: 20px;
  text-align: center;
  font-weight: 600;
  font-size: 1.1rem;
  border-bottom: 1px solid #e5e7eb;
  color: #1f2937;
}

.image-source-btn {
  width: 100%;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  background: white;
  cursor: pointer;
  transition: background 0.2s ease;
  font-size: 1rem;
  color: #374151;
}

.image-source-btn:hover {
  background: #f3f4f6;
}

.image-source-btn:active {
  transform: scale(0.98);
}

.gallery-btn {
  border-bottom: 1px solid #e5e7eb;
}

.gallery-btn svg {
  color: #3b82f6;
}

.camera-btn svg {
  color: #10b981;
}

.cancel-btn {
  border-top: 1px solid #e5e7eb;
  color: #ef4444;
  font-weight: 500;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .image-source-options {
    background: #1f2937;
  }
  
  .image-source-title {
    color: #f3f4f6;
    border-bottom-color: #374151;
  }
  
  .image-source-btn {
    background: #1f2937;
    color: #d1d5db;
  }
  
  .image-source-btn:hover {
    background: #374151;
  }
  
  .gallery-btn,
  .camera-btn {
    border-bottom-color: #374151;
  }
  
  .cancel-btn {
    border-top-color: #374151;
  }
}
</style>