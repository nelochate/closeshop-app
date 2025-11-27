<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
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

// Handle photo upload - MISSING FUNCTION ADDED
const handlePhotoUpload = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return

  // For now, we'll just store the file names
  // In a real app, you would upload these files to storage and get URLs
  const fileNames = Array.from(input.files).map(file => file.name)
  newReview.value.photos = [...newReview.value.photos, ...fileNames]
  
  console.log('Photos selected:', fileNames)
  // Note: In production, you would need to:
  // 1. Upload files to Supabase Storage
  // 2. Get the public URLs
  // 3. Store those URLs in newReview.value.photos
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

    const { error } = await supabase.from('reviews').insert({
      product_id: newReview.value.product_id,
      rating: newReview.value.rating,
      comment: newReview.value.comment.trim(),
      photos: newReview.value.photos,
      user_id: userData.user.id,
      user_name: userData.user.user_metadata?.full_name || 
                `${userData.user.user_metadata?.first_name || ''} ${userData.user.user_metadata?.last_name || ''}`.trim() ||
                'Anonymous',
      user_avatar: userData.user.user_metadata?.avatar_url || null
    })

    if (error) throw error
    
    // Reset form and close dialog
    showReviewDialog.value = false
    newReview.value = {
      product_id: '',
      rating: 0,
      comment: '',
      photos: []
    }
    
    // Reload reviews
    await loadReviews()
  } catch (error) {
    console.error('Error submitting review:', error)
    alert('Failed to submit review. Please try again.')
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
  showReviewDialog.value = false
  selectedProduct.value = null
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

            <!-- Photo Upload (Optional) -->
            <div class="mb-4">
              <div class="text-body-2 mb-2">Add Photos (Optional)</div>
              <v-file-input
                multiple
                prepend-icon="mdi-camera"
                variant="outlined"
                label="Upload photos"
                accept="image/*"
                @change="handlePhotoUpload"
              />
              <div v-if="newReview.photos.length > 0" class="mt-2">
                <div class="text-caption text-grey">Selected photos:</div>
                <div class="text-caption">
                  {{ newReview.photos.join(', ') }}
                </div>
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