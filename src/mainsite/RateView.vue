<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const route = useRoute()

// State
const orderId = ref(route.params.orderId as string)
const orderItems = ref<any[]>([])
const reviews = ref<any[]>([])
const isLoading = ref(false)
const isSubmitting = ref(false)
const filter = ref('all')
const sortBy = ref('latest')
const showReviewDialog = ref(false)
const showImageDialog = ref(false)
const currentImage = ref('')
const selectedProduct = ref<any>(null)

// Image upload state
const uploadingImages = ref(false)
const imagePreviews = ref<{id: string, file: File, url: string}[]>([])
const uploadProgress = ref(0)

// New review form
const newReview = ref({
  product_id: '',
  rating: 0,
  comment: '',
  photos: [] as string[]
})

// Load order items
const loadOrderItems = async () => {
  if (!orderId.value) return
  
  try {
    const { data, error } = await supabase
      .from('order_items')
      .select(`
        id,
        product_id,
        quantity,
        price,
        selected_size,
        selected_variety,
        products (
          id,
          prod_name,
          main_img_urls,
          description
        )
      `)
      .eq('order_id', orderId.value)

    if (error) throw error
    
    orderItems.value = data?.map(item => ({
      ...item,
      product: item.products
    })) || []
    
    console.log('Order items loaded:', orderItems.value)
  } catch (error) {
    console.error('Error loading order items:', error)
  }
}

// Load reviews for products in this order
const loadReviews = async () => {
  isLoading.value = true
  try {
    const productIds = orderItems.value.map(item => item.product_id)
    
    if (productIds.length === 0) {
      reviews.value = []
      return
    }

    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .in('product_id', productIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    reviews.value = data || []
  } catch (error) {
    console.error('Error loading reviews:', error)
  } finally {
    isLoading.value = false
  }
}

// Calculate review statistics
const reviewStats = computed(() => {
  if (reviews.value.length === 0) {
    return {
      average_rating: 0,
      total_reviews: 0,
      rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    }
  }

  const total = reviews.value.length
  const average = reviews.value.reduce((sum, review) => sum + review.rating, 0) / total
  
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  reviews.value.forEach(review => {
    distribution[review.rating as keyof typeof distribution]++
  })

  return {
    average_rating: Math.round(average * 10) / 10,
    total_reviews: total,
    rating_distribution: distribution
  }
})

// Filtered and sorted reviews
const filteredReviews = computed(() => {
  let filtered = [...reviews.value]

  // Apply rating filter
  if (filter.value !== 'all') {
    const rating = parseInt(filter.value)
    filtered = filtered.filter(review => review.rating === rating)
  }

  // Apply sort
  if (sortBy.value === 'latest') {
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  } else if (sortBy.value === 'highest') {
    filtered.sort((a, b) => b.rating - a.rating)
  } else if (sortBy.value === 'lowest') {
    filtered.sort((a, b) => a.rating - b.rating)
  } else if (sortBy.value === 'most_liked') {
    filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0))
  }

  return filtered
})

// Get reviews for a specific product
const getProductReviews = (productId: string) => {
  return reviews.value.filter(review => review.product_id === productId)
}

// Get product average rating
const getProductRating = (productId: string) => {
  const productReviews = getProductReviews(productId)
  if (productReviews.length === 0) return 0
  return productReviews.reduce((sum, review) => sum + review.rating, 0) / productReviews.length
}

// Open review dialog for a product
const openReviewDialog = (product: any) => {
  selectedProduct.value = product
  newReview.value = {
    product_id: product.id,
    rating: 0,
    comment: '',
    photos: []
  }
  showReviewDialog.value = true
}

// Handle photo upload
const handlePhotoUpload = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return

  const files = Array.from(input.files)
  
  // Validate file count
  const totalFiles = imagePreviews.value.length + files.length
  if (totalFiles > 5) {
    alert('Maximum 5 images allowed')
    input.value = '' // Reset input
    return
  }

  // Validate file sizes and types
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert(`File ${file.name} is too large. Maximum size is 5MB.`)
      input.value = '' // Reset input
      return
    }
    
    if (!file.type.startsWith('image/')) {
      alert(`File ${file.name} is not an image.`)
      input.value = '' // Reset input
      return
    }
  }

  // Create previews
  files.forEach(file => {
    const preview = {
      id: Math.random().toString(36).substr(2, 9),
      file: file,
      url: URL.createObjectURL(file)
    }
    imagePreviews.value.push(preview)
  })

  // Clear the input for future selections
  input.value = ''
}

// Remove image from preview
const removeImage = (index: number) => {
  URL.revokeObjectURL(imagePreviews.value[index].url)
  imagePreviews.value.splice(index, 1)
}

// Upload images to Supabase Storage
const uploadImagesToStorage = async (): Promise<string[]> => {
  if (imagePreviews.value.length === 0) return []

  uploadingImages.value = true
  uploadProgress.value = 0

  const uploadedUrls: string[] = []
  const totalFiles = imagePreviews.value.length

  try {
    for (let i = 0; i < imagePreviews.value.length; i++) {
      const preview = imagePreviews.value[i]
      const file = preview.file
      
      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substr(2, 9)}-${Date.now()}.${fileExt}`
      const filePath = `review-${newReview.value.product_id}/${fileName}`

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from('review-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('Error uploading image:', error)
        throw new Error(`Failed to upload ${file.name}: ${error.message}`)
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('review-images')
        .getPublicUrl(data.path)

      uploadedUrls.push(publicUrl)

      // Update progress
      uploadProgress.value = ((i + 1) / totalFiles) * 100
    }

    return uploadedUrls
  } catch (error) {
    console.error('Error uploading images:', error)
    throw error
  } finally {
    uploadingImages.value = false
    uploadProgress.value = 0
  }
}

// Clean up image previews
const cleanupImagePreviews = () => {
  imagePreviews.value.forEach(preview => {
    URL.revokeObjectURL(preview.url)
  })
  imagePreviews.value = []
}

// Submit a new review
const submitReview = async () => {
  if (!newReview.value.rating || !newReview.value.comment.trim()) {
    alert('Please provide both rating and comment')
    return
  }

  isSubmitting.value = true
  try {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) throw new Error('User not authenticated')

    // Upload images first if any
    let photoUrls: string[] = []
    if (imagePreviews.value.length > 0) {
      photoUrls = await uploadImagesToStorage()
    }

    // Insert review with image URLs
    const reviewData = {
      product_id: newReview.value.product_id,
      rating: newReview.value.rating,
      comment: newReview.value.comment.trim(),
      photos: photoUrls.length > 0 ? photoUrls : null,
      user_id: userData.user.id,
      user_name: userData.user.user_metadata?.full_name || 
                `${userData.user.user_metadata?.first_name || ''} ${userData.user.user_metadata?.last_name || ''}`.trim() ||
                'Anonymous',
      user_avatar: userData.user.user_metadata?.avatar_url || null,
      is_verified: true
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert(reviewData)
      .select()
      .single()

    if (error) throw error
    
    // Reset form and close dialog
    cleanupImagePreviews()
    showReviewDialog.value = false
    newReview.value = {
      product_id: '',
      rating: 0,
      comment: '',
      photos: []
    }
    
    // Reload reviews
    await loadReviews()
    
    console.log('Review submitted successfully with images:', photoUrls)
  } catch (error) {
    console.error('Error submitting review:', error)
    alert('Failed to submit review: ' + (error as Error).message)
  } finally {
    isSubmitting.value = false
  }
}

// Like a review
const likeReview = async (reviewId: string) => {
  try {
    const { error } = await supabase.rpc('increment_review_likes', {
      review_uuid: reviewId
    })
    
    if (error) throw error
    
    // Update local state
    const reviewIndex = reviews.value.findIndex(r => r.id === reviewId)
    if (reviewIndex !== -1) {
      reviews.value[reviewIndex].likes = (reviews.value[reviewIndex].likes || 0) + 1
    }
  } catch (error) {
    console.error('Error liking review:', error)
  }
}

// View image in dialog
const viewImage = (imageUrl: string) => {
  currentImage.value = imageUrl
  showImageDialog.value = true
}

// Close dialogs
const closeReviewDialog = () => {
  cleanupImagePreviews()
  showReviewDialog.value = false
  selectedProduct.value = null
  newReview.value = {
    product_id: '',
    rating: 0,
    comment: '',
    photos: []
  }
}

const closeImageDialog = () => {
  showImageDialog.value = false
  currentImage.value = ''
}

// Format date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Initialize
onMounted(async () => {
  await loadOrderItems()
  await loadReviews()
})

// Clean up on unmount
onUnmounted(() => {
  cleanupImagePreviews()
})

// Watch for order items changes
watch(orderItems, () => {
  loadReviews()
})
</script>

<template>
  <v-app>
    <v-main class="bg-grey-lighten-4">
      <v-container max-width="1200" class="pa-4">
        <!-- Header -->
        <v-card class="mb-6" elevation="2">
          <v-card-title class="d-flex justify-space-between align-center bg-primary">
            <span class="text-white">Rate Your Order</span>
            <v-btn @click="router.back()" variant="text" icon color="white">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-card-title>
          <v-card-text class="pa-4">
            <div class="text-body-1 text-grey-darken-2">
              Share your experience with the products from order #{{ orderId }}
            </div>
          </v-card-text>
        </v-card>

        <!-- Order Items to Review -->
        <v-card class="mb-6" elevation="2">
          <v-card-title class="bg-blue-lighten-5">
            <v-icon left>mdi-package-variant</v-icon>
            Products to Review
          </v-card-title>
          <v-card-text class="pa-0">
            <v-list>
              <v-list-item
                v-for="item in orderItems"
                :key="item.id"
                class="border-b"
              >
                <template v-slot:prepend>
                  <v-avatar rounded="lg" size="64" class="ma-2">
                    <v-img
                      :src="Array.isArray(item.product?.main_img_urls) 
                        ? item.product.main_img_urls[0] 
                        : item.product?.main_img_urls || '/placeholder-product.png'"
                      cover
                    />
                  </v-avatar>
                </template>

                <v-list-item-title class="font-weight-medium">
                  {{ item.product?.prod_name || 'Product' }}
                </v-list-item-title>
                <v-list-item-subtitle class="mt-1">
                  <div class="d-flex align-center mb-1">
                    <v-rating
                      :model-value="getProductRating(item.product_id)"
                      readonly
                      size="small"
                      color="amber"
                      density="compact"
                    />
                    <span class="text-caption text-grey ml-2">
                      ({{ getProductReviews(item.product_id).length }} reviews)
                    </span>
                  </div>
                  <div class="text-caption text-grey">
                    Qty: {{ item.quantity }} • ₱{{ item.price?.toLocaleString() }}
                  </div>
                  <div v-if="item.selected_size || item.selected_variety" class="mt-1">
                    <v-chip v-if="item.selected_size" size="x-small" class="mr-1">
                      {{ item.selected_size }}
                    </v-chip>
                    <v-chip v-if="item.selected_variety" size="x-small">
                      {{ item.selected_variety }}
                    </v-chip>
                  </div>
                </v-list-item-subtitle>

                <template v-slot:append>
                  <v-btn
                    color="primary"
                    variant="outlined"
                    @click="openReviewDialog(item.product)"
                  >
                    <v-icon left small>mdi-pencil</v-icon>
                    Review
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>

        <!-- Review Statistics -->
        <v-row v-if="reviews.length > 0" class="mb-6">
          <v-col cols="12" md="4">
            <v-card elevation="2" class="text-center pa-4">
              <div class="text-h3 text-primary font-weight-bold">
                {{ reviewStats.average_rating.toFixed(1) }}
              </div>
              <v-rating
                :model-value="reviewStats.average_rating"
                readonly
                size="small"
                color="amber"
                class="my-2"
              />
              <div class="text-body-2 text-grey">
                {{ reviewStats.total_reviews }} reviews
              </div>
            </v-card>
          </v-col>
          
          <v-col cols="12" md="8">
            <v-card elevation="2" class="pa-4">
              <v-card-title class="text-h6">Rating Distribution</v-card-title>
              <div v-for="rating in [5,4,3,2,1]" :key="rating" class="d-flex align-center mb-2">
                <span class="text-caption mr-2" style="min-width: 20px">{{ rating }}</span>
                <v-icon color="amber">mdi-star</v-icon>
                <v-progress-linear
                  :model-value="(reviewStats.rating_distribution[rating as keyof typeof reviewStats.rating_distribution] / reviewStats.total_reviews) * 100"
                  color="amber"
                  height="8"
                  class="mx-2"
                  rounded
                />
                <span class="text-caption text-grey" style="min-width: 40px">
                  {{ reviewStats.rating_distribution[rating as keyof typeof reviewStats.rating_distribution] }}
                </span>
              </div>
            </v-card>
          </v-col>
        </v-row>

        <!-- Reviews Section -->
        <v-card elevation="2">
          <v-card-title class="d-flex flex-wrap align-center gap-2">
            <span>Customer Reviews</span>
            <v-spacer></v-spacer>
            <v-select
              v-model="filter"
              :items="[
                { text: 'All Ratings', value: 'all' },
                { text: '5 Stars', value: '5' },
                { text: '4 Stars', value: '4' },
                { text: '3 Stars', value: '3' },
                { text: '2 Stars', value: '2' },
                { text: '1 Star', value: '1' }
              ]"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 140px;"
            />
            <v-select
              v-model="sortBy"
              :items="[
                { text: 'Latest', value: 'latest' },
                { text: 'Highest', value: 'highest' },
                { text: 'Lowest', value: 'lowest' },
                { text: 'Most Liked', value: 'most_liked' }
              ]"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 140px;"
            />
          </v-card-title>

          <v-card-text>
            <!-- Loading State -->
            <div v-if="isLoading" class="text-center py-8">
              <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
              <div class="text-body-1 mt-4">Loading reviews...</div>
            </div>

            <!-- Empty State -->
            <div v-else-if="filteredReviews.length === 0" class="text-center py-12">
              <v-icon size="64" color="grey-lighten-2">mdi-comment-outline</v-icon>
              <div class="text-h6 mt-4 text-grey">No reviews yet</div>
              <div class="text-body-2 text-grey">Be the first to leave a review!</div>
            </div>

            <!-- Reviews List -->
            <div v-else class="reviews-list">
              <v-card
                v-for="review in filteredReviews"
                :key="review.id"
                class="mb-4"
                variant="outlined"
              >
                <v-card-text class="pa-4">
                  <div class="d-flex align-start">
                    <!-- User Avatar -->
                    <v-avatar size="48" class="mr-4">
                      <v-img
                        :src="review.user_avatar || '/default-avatar.png'"
                        alt="User avatar"
                      />
                    </v-avatar>

                    <!-- Review Content -->
                    <div class="flex-grow-1">
                      <div class="d-flex align-center flex-wrap mb-2">
                        <div class="font-weight-medium mr-2">{{ review.user_name }}</div>
                        <v-chip
                          v-if="review.is_verified"
                          size="x-small"
                          color="green"
                          class="ml-1"
                        >
                          <v-icon left small>mdi-check</v-icon>
                          Verified
                        </v-chip>
                        <v-spacer></v-spacer>
                        <span class="text-caption text-grey">
                          {{ formatDate(review.created_at) }}
                        </span>
                      </div>

                      <!-- Rating -->
                      <v-rating
                        :model-value="review.rating"
                        readonly
                        size="small"
                        color="amber"
                        density="compact"
                        class="mb-2"
                      />

                      <!-- Comment -->
                      <div class="text-body-1 mb-3">{{ review.comment }}</div>

                      <!-- Photos -->
                      <div v-if="review.photos && review.photos.length > 0" class="mb-3">
                        <v-row dense>
                          <v-col
                            v-for="(photo, index) in review.photos"
                            :key="index"
                            cols="4"
                            sm="3"
                            md="2"
                          >
                            <v-img
                              :src="photo"
                              aspect-ratio="1"
                              cover
                              class="rounded-lg cursor-pointer"
                              @click="viewImage(photo)"
                            />
                          </v-col>
                        </v-row>
                      </div>

                      <!-- Actions -->
                      <div class="d-flex align-center">
                        <v-btn
                          variant="text"
                          size="small"
                          color="grey"
                          @click="likeReview(review.id)"
                        >
                          <v-icon left small>mdi-thumb-up</v-icon>
                          Helpful ({{ review.likes || 0 }})
                        </v-btn>
                      </div>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </v-card-text>
        </v-card>
      </v-container>

      <!-- Review Dialog -->
      <v-dialog v-model="showReviewDialog" max-width="600px" persistent>
        <v-card>
          <v-card-title class="d-flex justify-space-between align-center">
            <span>Write a Review</span>
            <v-btn icon @click="closeReviewDialog">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-card-title>

          <v-card-text class="pa-4">
            <!-- Product Info -->
            <div v-if="selectedProduct" class="d-flex align-center mb-4 pa-3 bg-grey-lighten-4 rounded">
              <v-avatar size="48" rounded class="mr-3">
                <v-img
                  :src="Array.isArray(selectedProduct.main_img_urls) 
                    ? selectedProduct.main_img_urls[0] 
                    : selectedProduct.main_img_urls || '/placeholder-product.png'"
                  cover
                />
              </v-avatar>
              <div>
                <div class="font-weight-medium">{{ selectedProduct.prod_name }}</div>
                <div class="text-caption text-grey">{{ selectedProduct.description }}</div>
              </div>
            </div>

            <!-- Rating -->
            <div class="text-center mb-4">
              <div class="text-h6 mb-2">How would you rate this product?</div>
              <v-rating
                v-model="newReview.rating"
                size="large"
                color="amber"
                class="mb-2"
              />
              <div class="text-caption text-grey">
                {{ newReview.rating === 0 ? 'Select rating' : 
                   newReview.rating === 1 ? 'Poor' :
                   newReview.rating === 2 ? 'Fair' :
                   newReview.rating === 3 ? 'Good' :
                   newReview.rating === 4 ? 'Very Good' : 'Excellent' }}
              </div>
            </div>

            <!-- Comment -->
            <v-textarea
              v-model="newReview.comment"
              label="Share your experience"
              variant="outlined"
              rows="4"
              placeholder="What did you like or dislike about this product?"
              class="mb-4"
            />

            <!-- Photo Upload Section -->
            <div class="mb-4">
              <div class="text-body-2 mb-2">Add Photos (Optional)</div>
              
              <!-- File Input -->
              <v-file-input
                multiple
                prepend-icon="mdi-camera"
                variant="outlined"
                label="Upload photos"
                accept="image/*"
                :loading="uploadingImages"
                :disabled="uploadingImages || imagePreviews.length >= 5"
                @change="handlePhotoUpload"
                :rules="[
                  (files: File[]) => !files || files.length <= 5 || 'Maximum 5 images allowed',
                  (files: File[]) => !files || Array.from(files).every(file => file.size <= 5 * 1024 * 1024) || 'Each file must be less than 5MB'
                ]"
              />

              <!-- Upload Progress -->
              <v-progress-linear
                v-if="uploadingImages && uploadProgress > 0"
                :model-value="uploadProgress"
                color="primary"
                height="8"
                class="mt-2"
                rounded
              >
                <template v-slot:default>
                  <span class="text-caption">{{ Math.round(uploadProgress) }}%</span>
                </template>
              </v-progress-linear>

              <!-- Image Previews -->
              <div v-if="imagePreviews.length > 0" class="mt-3">
                <div class="text-caption text-grey mb-2">
                  {{ imagePreviews.length }} image{{ imagePreviews.length !== 1 ? 's' : '' }} selected
                  ({{ 5 - imagePreviews.length }} remaining)
                </div>
                <v-row dense>
                  <v-col
                    v-for="(preview, index) in imagePreviews"
                    :key="preview.id"
                    cols="4"
                    sm="3"
                    md="2"
                  >
                    <v-card variant="outlined" class="image-preview-card">
                      <v-img
                        :src="preview.url"
                        aspect-ratio="1"
                        cover
                        class="rounded-t"
                      />
                      <v-card-actions class="pa-1 justify-center">
                        <v-btn
                          icon
                          size="x-small"
                          color="error"
                          @click="removeImage(index)"
                          :disabled="uploadingImages"
                        >
                          <v-icon>mdi-delete</v-icon>
                        </v-btn>
                      </v-card-actions>
                    </v-card>
                  </v-col>
                </v-row>
              </div>

              <!-- Help Text -->
              <div class="text-caption text-grey mt-2">
                • Maximum 5 images<br>
                • Each image should be less than 5MB<br>
                • Supported formats: JPG, PNG, WebP
              </div>
            </div>
          </v-card-text>

          <v-card-actions class="pa-4">
            <v-spacer></v-spacer>
            <v-btn @click="closeReviewDialog" variant="text">Cancel</v-btn>
            <v-btn
              @click="submitReview"
              color="primary"
              variant="flat"
              :loading="isSubmitting"
              :disabled="!newReview.rating || !newReview.comment.trim()"
            >
              Submit Review
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Image Dialog -->
      <v-dialog v-model="showImageDialog" max-width="800px" @click:outside="closeImageDialog">
        <v-card>
          <v-card-actions class="d-flex justify-end pa-2">
            <v-btn icon @click="closeImageDialog">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-card-actions>
          <v-card-text class="text-center pa-0">
            <v-img
              :src="currentImage"
              max-height="600"
              contain
              class="rounded-b"
            />
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
.border-b {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.cursor-pointer {
  cursor: pointer;
}

.reviews-list {
  max-height: 600px;
  overflow-y: auto;
}

.image-preview-card {
  position: relative;
  transition: all 0.3s ease;
}

.image-preview-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Custom scrollbar */
.reviews-list::-webkit-scrollbar {
  width: 6px;
}

.reviews-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

.reviews-list::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 10px;
}

.reviews-list::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>