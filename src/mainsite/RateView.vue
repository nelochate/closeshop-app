<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()

// State
const reviews = ref<any[]>([])
const isLoading = ref(false)
const filter = ref('all')
const sortBy = ref('latest')
const showReviewDialog = ref(false)

// Load reviews for a specific product
const loadReviews = async (productId?: string) => {
  isLoading.value = true
  try {
    let query = supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })

    // If productId is provided, filter by product
    if (productId) {
      query = query.eq('product_id', productId)
    }

    const { data, error } = await query

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

// Submit a new review
const submitReview = async (reviewData: {
  product_id: string
  rating: number
  comment: string
  photos?: string[]
}) => {
  try {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) throw new Error('User not authenticated')

    const { error } = await supabase.from('reviews').insert({
      ...reviewData,
      user_id: userData.user.id,
      user_name: userData.user.user_metadata?.full_name || 'Anonymous',
      user_avatar: userData.user.user_metadata?.avatar_url || null
    })

    if (error) throw error
    
    // Reload reviews
    await loadReviews(reviewData.product_id)
    return true
  } catch (error) {
    console.error('Error submitting review:', error)
    return false
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

onMounted(() => {
  // Load reviews for current product or all reviews
  const productId = router.currentRoute.value.params.productId as string
  loadReviews(productId)
})
</script>

<template>
  <v-dialog v-model="showDialog" max-width="800px" @click:outside="close">
    <v-card>
      <v-card-actions class="d-flex justify-end pa-2">
        <v-btn icon @click="close">
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
</template>