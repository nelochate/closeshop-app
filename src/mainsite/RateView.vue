<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'
import {
  buildAvatarFallback,
  getAuthUserAvatarUrl,
  getAuthUserDisplayName,
  getProfileDisplayName,
  normalizeIdentityText,
} from '@/utils/accountIdentity'
import { syncProfileFromAuthUser } from '@/utils/profileSync'

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
const currentUserId = ref<string | null>(null)
const draftRatings = ref<Record<string, number>>({})
const editingReviewId = ref<string | null>(null)
const existingPhotoUrls = ref<string[]>([])

// Image upload state
const uploadingImages = ref(false)
const imagePreviews = ref<{ id: string; file: File; url: string }[]>([])
const selectedUploadFiles = ref<File[]>([])
const uploadProgress = ref(0)

const ratingFilterOptions = [
  { title: 'All Ratings', value: 'all' },
  { title: '5 Stars', value: '5' },
  { title: '4 Stars', value: '4' },
  { title: '3 Stars', value: '3' },
  { title: '2 Stars', value: '2' },
  { title: '1 Star', value: '1' },
]

const sortOptions = [
  { title: 'Latest', value: 'latest' },
  { title: 'Highest', value: 'highest' },
  { title: 'Lowest', value: 'lowest' },
  { title: 'Most Liked', value: 'most_liked' },
]

const ratingLabels: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
}

// New review form
const newReview = ref({
  product_id: '',
  rating: 0,
  comment: '',
  photos: [] as string[],
})

const isEditingReview = computed(() => !!editingReviewId.value)
const totalAttachedPhotoCount = computed(
  () => existingPhotoUrls.value.length + imagePreviews.value.length,
)

const normalizeReviewPhotos = (photos: unknown) => {
  if (Array.isArray(photos)) {
    return photos.filter((photo): photo is string => typeof photo === 'string' && photo.trim())
  }

  if (typeof photos === 'string') {
    try {
      const parsed = JSON.parse(photos)
      if (Array.isArray(parsed)) {
        return parsed.filter((photo): photo is string => typeof photo === 'string' && photo.trim())
      }
    } catch {
      return photos.trim() ? [photos] : []
    }
  }

  return []
}

// Load order items
const loadOrderItems = async () => {
  if (!orderId.value) return

  try {
    const { data, error } = await supabase
      .from('order_items')
      .select(
        `
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
      `,
      )
      .eq('order_id', orderId.value)

    if (error) throw error

    orderItems.value =
      data?.map((item) => ({
        ...item,
        product: item.products,
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
    const productIds = orderItems.value.map((item) => item.product_id)

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

    const reviewRows = data || []
    const reviewerIds = [...new Set(reviewRows.map((review) => review.user_id).filter(Boolean))]
    let profilesById = new Map<string, any>()

    if (reviewerIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, full_name, avatar_url')
        .in('id', reviewerIds)

      if (profileError) {
        console.warn('Could not load reviewer profiles:', profileError)
      } else {
        profilesById = new Map((profileRows || []).map((profile) => [profile.id, profile]))
      }
    }

    reviews.value = reviewRows.map((review) => {
      const reviewerProfile = review.user_id ? profilesById.get(review.user_id) : null
      const reviewerName =
        getProfileDisplayName(reviewerProfile) ||
        normalizeIdentityText(review.user_name) ||
        'Customer'
      const reviewerAvatar =
        normalizeIdentityText(reviewerProfile?.avatar_url) ||
        normalizeIdentityText(review.user_avatar) ||
        buildAvatarFallback(reviewerName)

      return {
        ...review,
        rating: Number(review.rating || 0),
        likes: Number(review.likes || 0),
        photos: normalizeReviewPhotos(review.photos),
        reviewer_name: reviewerName,
        reviewer_avatar: reviewerAvatar,
      }
    })
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
      rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    }
  }

  const total = reviews.value.length
  const average = reviews.value.reduce((sum, review) => sum + review.rating, 0) / total

  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  reviews.value.forEach((review) => {
    distribution[review.rating as keyof typeof distribution]++
  })

  return {
    average_rating: Math.round(average * 10) / 10,
    total_reviews: total,
    rating_distribution: distribution,
  }
})

// Filtered and sorted reviews
const filteredReviews = computed(() => {
  let filtered = [...reviews.value]

  // Apply rating filter
  if (filter.value !== 'all') {
    const rating = parseInt(filter.value)
    filtered = filtered.filter((review) => review.rating === rating)
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
  return reviews.value.filter((review) => review.product_id === productId)
}

// Get product average rating
const getProductRating = (productId: string) => {
  const productReviews = getProductReviews(productId)
  if (productReviews.length === 0) return 0
  return productReviews.reduce((sum, review) => sum + review.rating, 0) / productReviews.length
}

// Open review dialog for a product
const getRatingLabel = (rating: number) => ratingLabels[rating] || 'Select rating'

const clearDraftRating = (productId?: string | null) => {
  if (!productId) return

  const nextDraftRatings = { ...draftRatings.value }
  delete nextDraftRatings[productId]
  draftRatings.value = nextDraftRatings
}

const resetReviewForm = () => {
  clearDraftRating(selectedProduct.value?.id)
  cleanupImagePreviews()
  editingReviewId.value = null
  existingPhotoUrls.value = []
  showReviewDialog.value = false
  selectedProduct.value = null
  newReview.value = {
    product_id: '',
    rating: 0,
    comment: '',
    photos: [],
  }
}

const getUserReview = (productId: string) => {
  return (
    reviews.value.find(
      (review) => review.product_id === productId && review.user_id === currentUserId.value,
    ) || null
  )
}

const openReviewDialog = (product: any, initialRating = 0) => {
  const existingReview = getUserReview(product.id)
  if (existingReview) {
    openEditReviewDialog(product, existingReview)
    return
  }

  if (initialRating > 0) {
    draftRatings.value = {
      ...draftRatings.value,
      [product.id]: initialRating,
    }
  }

  cleanupImagePreviews()
  selectedProduct.value = product
  editingReviewId.value = null
  existingPhotoUrls.value = []
  newReview.value = {
    product_id: product.id,
    rating: initialRating,
    comment: '',
    photos: [],
  }
  showReviewDialog.value = true
}

const openEditReviewDialog = (product: any, review: any) => {
  const reviewPhotos = normalizeReviewPhotos(review?.photos)

  cleanupImagePreviews()
  selectedProduct.value = product
  editingReviewId.value = review?.id || null
  existingPhotoUrls.value = [...reviewPhotos]
  newReview.value = {
    product_id: product.id,
    rating: Number(review?.rating || 0),
    comment: review?.comment || '',
    photos: [...reviewPhotos],
  }
  showReviewDialog.value = true
}

const handleInlineRating = (product: any, value: number) => {
  const rating = Number(value || 0)

  if (!product?.id || !rating) {
    return
  }

  openReviewDialog(product, rating)
}

// Check if user has already reviewed a product
const hasUserReviewed = (productId: string) => {
  return !!getUserReview(productId)
}

const getProductForReview = (review: any) => {
  const matchingOrderItem = orderItems.value.find((item) => item.product_id === review.product_id)

  return (
    matchingOrderItem?.product || {
      id: review.product_id,
      prod_name: review.product_name || 'Product',
      main_img_urls: review.product_img || '/placeholder-product.png',
      description: '',
    }
  )
}

// Handle photo upload
const handlePhotoUpload = (value: File[] | File | null) => {
  const files = Array.isArray(value) ? value : value ? [value] : []

  if (files.length === 0) {
    selectedUploadFiles.value = []
    return
  }

  // Validate file count
  const totalFiles = totalAttachedPhotoCount.value + files.length
  if (totalFiles > 5) {
    alert('Maximum 5 images allowed')
    selectedUploadFiles.value = []
    return
  }

  // Validate file sizes and types
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
      alert(`File ${file.name} is too large. Maximum size is 5MB.`)
      selectedUploadFiles.value = []
      return
    }

    if (!file.type.startsWith('image/')) {
      alert(`File ${file.name} is not an image.`)
      selectedUploadFiles.value = []
      return
    }
  }

  // Create previews
  files.forEach((file) => {
    const preview = {
      id: Math.random().toString(36).substr(2, 9),
      file: file,
      url: URL.createObjectURL(file),
    }
    imagePreviews.value.push(preview)
  })

  // Clear the input for future selections
  selectedUploadFiles.value = []
}

// Remove image from preview
const removeImage = (index: number) => {
  URL.revokeObjectURL(imagePreviews.value[index].url)
  imagePreviews.value.splice(index, 1)
}

const removeExistingPhoto = (index: number) => {
  existingPhotoUrls.value.splice(index, 1)
  newReview.value.photos = [...existingPhotoUrls.value]
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
      const { data, error } = await supabase.storage.from('review-images').upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

      if (error) {
        console.error('Error uploading image:', error)
        throw new Error(`Failed to upload ${file.name}: ${error.message}`)
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('review-images').getPublicUrl(data.path)

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
  imagePreviews.value.forEach((preview) => {
    URL.revokeObjectURL(preview.url)
  })
  imagePreviews.value = []
  selectedUploadFiles.value = []
}

// Submit a new review
const submitReview = async () => {
  if (!newReview.value.rating) {
    alert('Please select a star rating')
    return
  }

  if (!isEditingReview.value && hasUserReviewed(newReview.value.product_id)) {
    alert('You have already reviewed this product.')
    return
  }

  isSubmitting.value = true
  try {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) throw new Error('User not authenticated')
    const syncedProfile = await syncProfileFromAuthUser({ user: userData.user })
    const trimmedComment = newReview.value.comment.trim()
    const reviewerName =
      getProfileDisplayName(syncedProfile) ||
      getAuthUserDisplayName(userData.user) ||
      'Anonymous'
    const reviewerAvatar =
      normalizeIdentityText(syncedProfile?.avatar_url) ||
      getAuthUserAvatarUrl(userData.user) ||
      buildAvatarFallback(reviewerName)

    // Upload images first if any
    let uploadedPhotoUrls: string[] = []
    if (imagePreviews.value.length > 0) {
      uploadedPhotoUrls = await uploadImagesToStorage()
    }

    const finalPhotoUrls = [...existingPhotoUrls.value, ...uploadedPhotoUrls]

    const reviewData = {
      rating: newReview.value.rating,
      comment: trimmedComment || '',
      photos: finalPhotoUrls.length > 0 ? finalPhotoUrls : null,
      user_name: reviewerName,
      user_avatar: reviewerAvatar,
      is_verified: true,
    }
    const wasEditingReview = isEditingReview.value

    let data: any = null
    let error: any = null

    if (wasEditingReview && editingReviewId.value) {
      const response = await supabase
        .from('reviews')
        .update(reviewData)
        .eq('id', editingReviewId.value)
        .eq('user_id', userData.user.id)
        .select()
        .single()

      data = response.data
      error = response.error
    } else {
      const response = await supabase
        .from('reviews')
        .insert({
          ...reviewData,
          product_id: newReview.value.product_id,
          user_id: userData.user.id,
        })
        .select()
        .single()

      data = response.data
      error = response.error
    }

    if (error) throw error

    resetReviewForm()

    // Reload reviews
    await loadReviews()

    window.dispatchEvent(
      new CustomEvent('profile:review-submitted', {
        detail: {
          userId: userData.user.id,
          orderId: orderId.value,
          productId: data.product_id,
          reviewId: data.id,
          action: wasEditingReview ? 'updated' : 'created',
        },
      }),
    )

    console.log(
      wasEditingReview ? 'Review updated successfully:' : 'Review submitted successfully:',
      finalPhotoUrls,
    )
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
      review_uuid: reviewId,
    })

    if (error) throw error

    // Update local state
    const reviewIndex = reviews.value.findIndex((r) => r.id === reviewId)
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
  resetReviewForm()
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
    day: 'numeric',
  })
}

// Initialize
onMounted(async () => {
  const { data: userData } = await supabase.auth.getUser()
  currentUserId.value = userData.user?.id || null
  if (userData.user) {
    await syncProfileFromAuthUser({ user: userData.user })
  }
  await loadOrderItems()
  await loadReviews()
})

// Clean up on unmount
onUnmounted(() => {
  cleanupImagePreviews()
})
</script>

<template>
  <v-app>
    <v-app-bar flat elevation="0" class="top-nav" color="#3f83c7">
      <v-btn variant="text" icon @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="font-weight-bold">Rate Your Order</v-toolbar-title>
      <v-spacer />
    </v-app-bar>

    <v-main class="rate-page">
      <v-container max-width="1200" class="rate-container">
        <v-card class="mb-6 intro-card" elevation="0" rounded="xl">
          <v-card-text class="pa-5 pa-sm-6">
            <div class="d-flex align-start justify-space-between flex-wrap ga-3">
              <div>
                <div class="text-overline text-primary font-weight-bold">Order feedback</div>
                <div class="text-h5 font-weight-bold text-grey-darken-4 mb-2">
                  Share your experience
                </div>
                <div class="text-body-1 text-grey-darken-2">
                  Help other customers by reviewing the products from order #{{ orderId }}.
                </div>
              </div>
              <v-chip color="primary" variant="tonal" size="small" class="font-weight-bold">
                Order #{{ orderId }}
              </v-chip>
            </div>
          </v-card-text>
        </v-card>

        <!-- Order Items to Review -->
        <v-card class="mb-6 section-card" elevation="2">
          <v-card-title class="bg-blue-lighten-5">
            <v-icon left>mdi-package-variant</v-icon>
            Products to Review
          </v-card-title>
          <v-card-text class="pa-0">
            <v-list>
              <v-list-item v-for="item in orderItems" :key="item.id" class="border-b product-review-item">
                <template v-slot:prepend>
                  <v-avatar rounded="lg" size="64" class="ma-2">
                    <v-img
                      :src="
                        Array.isArray(item.product?.main_img_urls)
                          ? item.product.main_img_urls[0]
                          : item.product?.main_img_urls || '/placeholder-product.png'
                      "
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
                  <div v-if="hasUserReviewed(item.product_id)" class="mt-2">
                    <v-chip color="success" variant="tonal" size="small">
                      <v-icon start size="14">mdi-check-circle</v-icon>
                      You already reviewed this product
                    </v-chip>
                  </div>
                  <div v-else class="mt-2 quick-rate-row">
                    <v-rating
                      :model-value="draftRatings[item.product_id] || 0"
                      hover
                      density="compact"
                      color="amber"
                      active-color="amber"
                      size="small"
                      @update:model-value="handleInlineRating(item.product, $event)"
                    />
                    <span class="text-caption text-grey">
                      {{
                        draftRatings[item.product_id]
                          ? `${getRatingLabel(draftRatings[item.product_id])} selected. Add details if you want.`
                          : 'Tap the stars to rate this product.'
                      }}
                    </span>
                  </div>
                </v-list-item-subtitle>

                <template v-slot:append>
                  <v-btn
                    :color="hasUserReviewed(item.product_id) ? 'secondary' : 'primary'"
                    variant="outlined"
                    @click="
                      hasUserReviewed(item.product_id)
                        ? openEditReviewDialog(item.product, getUserReview(item.product_id))
                        : openReviewDialog(item.product, draftRatings[item.product_id] || 0)
                    "
                    class="review-action-btn"
                  >
                    <v-icon left small>mdi-pencil</v-icon>
                    {{ hasUserReviewed(item.product_id) ? 'Edit Review' : 'Add Details' }}
                  </v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>

        <!-- Review Statistics -->
        <v-row v-if="reviews.length > 0" class="mb-6">
          <v-col cols="12" md="4">
            <v-card elevation="2" class="text-center pa-4 section-card">
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
              <div class="text-body-2 text-grey">{{ reviewStats.total_reviews }} reviews</div>
            </v-card>
          </v-col>

          <v-col cols="12" md="8">
            <v-card elevation="2" class="pa-4 section-card">
              <v-card-title class="text-h6">Rating Distribution</v-card-title>
              <div v-for="rating in [5, 4, 3, 2, 1]" :key="rating" class="d-flex align-center mb-2">
                <span class="text-caption mr-2" style="min-width: 20px">{{ rating }}</span>
                <v-icon color="amber">mdi-star</v-icon>
                <v-progress-linear
                  :model-value="
                    (reviewStats.rating_distribution[
                      rating as keyof typeof reviewStats.rating_distribution
                    ] /
                      reviewStats.total_reviews) *
                    100
                  "
                  color="amber"
                  height="8"
                  class="mx-2"
                  rounded
                />
                <span class="text-caption text-grey" style="min-width: 40px">
                  {{
                    reviewStats.rating_distribution[
                      rating as keyof typeof reviewStats.rating_distribution
                    ]
                  }}
                </span>
              </div>
            </v-card>
          </v-col>
        </v-row>

        <!-- Reviews Section -->
        <v-card elevation="2" class="section-card">
          <v-card-title class="d-flex flex-wrap align-center gap-2 review-section-header">
            <span>Customer Reviews</span>
            <v-spacer></v-spacer>
            <v-select
              v-model="filter"
              :items="ratingFilterOptions"
              item-title="title"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              class="review-filter-select"
            />
            <v-select
              v-model="sortBy"
              :items="sortOptions"
              item-title="title"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              class="review-filter-select"
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
                class="mb-4 review-entry-card"
                variant="outlined"
              >
                <v-card-text class="pa-4">
                  <div class="d-flex align-start">
                    <!-- User Avatar -->
                    <v-avatar size="48" class="mr-4">
                      <v-img :src="review.reviewer_avatar" alt="User avatar" />
                    </v-avatar>

                    <!-- Review Content -->
                    <div class="flex-grow-1">
                      <div class="d-flex align-center flex-wrap mb-2">
                        <div class="font-weight-medium mr-2">{{ review.reviewer_name }}</div>
                        <v-chip v-if="review.is_verified" size="x-small" color="green" class="ml-1">
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
                      <div v-if="review.comment?.trim()" class="text-body-1 mb-3">
                        {{ review.comment }}
                      </div>
                      <div v-else class="text-body-2 text-medium-emphasis mb-3">
                        Rated this product without a written review.
                      </div>

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
                        <v-btn
                          v-if="review.user_id === currentUserId"
                          variant="text"
                          size="small"
                          color="secondary"
                          @click="openEditReviewDialog(getProductForReview(review), review)"
                        >
                          <v-icon left small>mdi-pencil</v-icon>
                          Edit review
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
            <span>{{ isEditingReview ? 'Edit Your Review' : 'Write a Review' }}</span>
            <v-btn icon @click="closeReviewDialog">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-card-title>

          <v-card-text class="pa-4">
            <!-- Product Info -->
            <div
              v-if="selectedProduct"
              class="d-flex align-center mb-4 pa-3 bg-grey-lighten-4 rounded"
            >
              <v-avatar size="48" rounded class="mr-3">
                <v-img
                  :src="
                    Array.isArray(selectedProduct.main_img_urls)
                      ? selectedProduct.main_img_urls[0]
                      : selectedProduct.main_img_urls || '/placeholder-product.png'
                  "
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
              <div class="text-h6 mb-2">
                {{ isEditingReview ? 'Update your rating' : 'How would you rate this product?' }}
              </div>
              <div class="text-body-2 text-medium-emphasis mb-3">
                Tap a star to rate. Writing a review and uploading photos are optional.
              </div>
              <v-rating
                v-model="newReview.rating"
                size="large"
                color="amber"
                active-color="amber"
                hover
                class="mb-2"
              />
              <div class="text-caption text-grey">
                {{ getRatingLabel(newReview.rating) }}
              </div>
            </div>

            <!-- Comment -->
            <v-textarea
              v-model="newReview.comment"
              label="Write a review (optional)"
              variant="outlined"
              rows="3"
              auto-grow
              placeholder="What did you like or dislike about this product?"
              class="mb-4"
            />

            <!-- Photo Upload Section -->
            <div class="mb-4">
              <div class="text-body-2 mb-2">Add Photos (Optional)</div>

              <div v-if="existingPhotoUrls.length > 0" class="mt-3">
                <div class="text-caption text-grey mb-2">Current photos</div>
                <v-row dense>
                  <v-col
                    v-for="(photo, index) in existingPhotoUrls"
                    :key="`existing-${index}`"
                    cols="4"
                    sm="3"
                    md="2"
                  >
                    <v-card variant="outlined" class="image-preview-card">
                      <v-img :src="photo" aspect-ratio="1" cover class="rounded-t" />
                      <v-card-actions class="pa-1 justify-center">
                        <v-btn
                          icon
                          size="x-small"
                          color="error"
                          @click="removeExistingPhoto(index)"
                          :disabled="uploadingImages"
                        >
                          <v-icon>mdi-delete</v-icon>
                        </v-btn>
                      </v-card-actions>
                    </v-card>
                  </v-col>
                </v-row>
              </div>

              <!-- File Input -->
              <v-file-input
                v-model="selectedUploadFiles"
                multiple
                prepend-icon="mdi-camera"
                variant="outlined"
                label="Upload photos (optional)"
                accept="image/*"
                :loading="uploadingImages"
                :disabled="uploadingImages || totalAttachedPhotoCount >= 5"
                @update:model-value="handlePhotoUpload"
                :rules="[
                  () => totalAttachedPhotoCount <= 5 || 'Maximum 5 images allowed',
                  (files: File[]) =>
                    !files ||
                    Array.from(files).every((file) => file.size <= 5 * 1024 * 1024) ||
                    'Each file must be less than 5MB',
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
                  {{ totalAttachedPhotoCount }} image{{ totalAttachedPhotoCount !== 1 ? 's' : '' }}
                  attached ({{ 5 - totalAttachedPhotoCount }} remaining)
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
                      <v-img :src="preview.url" aspect-ratio="1" cover class="rounded-t" />
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
                • Maximum 5 images<br />
                • Each image should be less than 5MB<br />
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
              :disabled="!newReview.rating"
            >
              {{
                isEditingReview
                  ? 'Save Changes'
                  : newReview.comment.trim() || totalAttachedPhotoCount
                    ? 'Submit Review'
                    : 'Submit Rating'
              }}
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
            <v-img :src="currentImage" max-height="600" contain class="rounded-b" />
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
:root {
  --rate-safe-top: env(safe-area-inset-top, 0px);
  --rate-safe-right: env(safe-area-inset-right, 0px);
  --rate-safe-bottom: env(safe-area-inset-bottom, 0px);
  --rate-safe-left: env(safe-area-inset-left, 0px);
}

.rate-page {
  background: linear-gradient(180deg, #f8fafc 0%, #eef5ff 38%, #f8fafc 100%);
  min-height: 100dvh;
}

.top-nav {
  padding-top: var(--rate-safe-top);
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12) !important;
}

.top-nav :deep(.v-toolbar__content) {
  min-height: 56px !important;
  height: 56px !important;
  padding: 0 max(8px, var(--rate-safe-right)) 0 max(8px, var(--rate-safe-left)) !important;
}

.top-nav :deep(.v-toolbar-title) {
  font-size: 1.05rem;
  letter-spacing: 0.2px;
}

.top-nav :deep(.v-btn),
.top-nav :deep(.v-toolbar-title) {
  color: white !important;
}

@supports (padding-top: env(safe-area-inset-top)) {
  .top-nav {
    height: calc(56px + env(safe-area-inset-top)) !important;
  }
}

@supports (padding-top: constant(safe-area-inset-top)) {
  .top-nav {
    padding-top: constant(safe-area-inset-top);
    height: calc(56px + constant(safe-area-inset-top)) !important;
  }
}

.rate-container {
  padding-top: calc(72px + var(--rate-safe-top)) !important;
  padding-bottom: calc(28px + var(--rate-safe-bottom)) !important;
  padding-left: max(12px, var(--rate-safe-left)) !important;
  padding-right: max(12px, var(--rate-safe-right)) !important;
}

.intro-card {
  background: linear-gradient(135deg, rgba(63, 131, 199, 0.12), rgba(255, 255, 255, 0.95));
  border: 1px solid rgba(63, 131, 199, 0.12);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}

.section-card {
  border-radius: 20px !important;
  overflow: hidden;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.06) !important;
}

.border-b {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.cursor-pointer {
  cursor: pointer;
}

.reviews-list {
  display: grid;
  gap: 16px;
}

.image-preview-card {
  position: relative;
  transition: all 0.3s ease;
}

.image-preview-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.review-entry-card {
  border-radius: 18px !important;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.review-entry-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08) !important;
}

.review-filter-select {
  max-width: 150px;
  min-width: 140px;
}

.review-action-btn {
  text-transform: none;
  font-weight: 600;
}

.quick-rate-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.review-section-header {
  gap: 12px;
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

@media (max-width: 600px) {
  .rate-container {
    padding-top: calc(68px + var(--rate-safe-top)) !important;
  }

  .review-section-header {
    align-items: stretch !important;
  }

  .review-filter-select {
    max-width: none;
    min-width: 0;
    width: 100%;
  }

  .quick-rate-row {
    align-items: flex-start;
  }

  .product-review-item :deep(.v-list-item__append) {
    width: 100%;
    margin-top: 12px;
  }

  .product-review-item :deep(.v-list-item__append .v-btn) {
    width: 100%;
  }

  .review-entry-card :deep(.v-card-text > .d-flex) {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
