<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()
const productId = route.params.id as string

// State
const product = ref<any>(null)
const shop = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedImage = ref('')
const quantity = ref(1)
const addingToCart = ref(false)
const activeTab = ref('details') // 'details', 'specifications', 'reviews'

// Fetch product details with enhanced data
const fetchProduct = async () => {
  try {
    loading.value = true
    error.value = null

    console.log('🛍️ Fetching product:', productId)

    // Enhanced query with more product details
    const { data: productData, error: productError } = await supabase
      .from('products')
      .select(`
        *,
        shop:shops (
          id,
          business_name,
          logo_url,
          description,
          open_time,
          close_time,
          open_days,
          meetup_details,
          delivery_options,
          owner_id,
          street,
          barangay,
          city,
          province,
          contact_number,
          email
        ),
        product_reviews (
          id,
          rating,
          comment,
          created_at,
          user:profiles (
            first_name,
            last_name,
            avatar_url
          )
        )
      `)
      .eq('id', productId)
      .single()

    if (productError) {
      console.error('❌ Supabase error:', productError)
      throw productError
    }
    
    if (!productData) {
      throw new Error('Product not found')
    }

    product.value = productData
    shop.value = productData.shop

    // Set default selected image
    const images = getProductImages(productData)
    selectedImage.value = images[0] || '/placeholder.png'

    console.log('✅ Product loaded:', product.value)
    console.log('🏪 Shop info:', shop.value)

  } catch (err: any) {
    console.error('❌ Error fetching product:', err)
    error.value = err.message || 'Failed to load product'
  } finally {
    loading.value = false
  }
}

// Get product images
const getProductImages = (productData: any): string[] => {
  if (!productData?.main_img_urls) return ['/placeholder.png']
  
  try {
    if (typeof productData.main_img_urls === 'string') {
      try {
        const parsed = JSON.parse(productData.main_img_urls)
        return Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        return [productData.main_img_urls]
      }
    }
    
    if (Array.isArray(productData.main_img_urls)) {
      return productData.main_img_urls
    }
    
    return ['/placeholder.png']
  } catch {
    return ['/placeholder.png']
  }
}

// Enhanced shop information
const shopInfo = computed(() => {
  if (!shop.value) return null
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const openDays = shop.value.open_days?.map((dayIndex: number) => days[dayIndex]) || []
  
  const addressParts = [
    shop.value.street,
    shop.value.barangay,
    shop.value.city,
    shop.value.province
  ].filter(Boolean)
  
  const fullAddress = addressParts.join(', ') || 'Address not specified'

  return {
    openDays,
    openTime: formatTime(shop.value.open_time) || '9:00 AM',
    closeTime: formatTime(shop.value.close_time) || '6:00 PM',
    meetupDetails: shop.value.meetup_details || 'Main Entrance',
    deliveryOptions: shop.value.delivery_options || ['meetup'],
    fullAddress,
    contact: shop.value.contact_number || 'Not provided',
    email: shop.value.email || 'Not provided'
  }
})

// Product specifications
const productSpecs = computed(() => {
  if (!product.value) return []
  
  const specs = []
  if (product.value.category) specs.push({ label: 'Category', value: product.value.category })
  if (product.value.weight) specs.push({ label: 'Weight', value: product.value.weight })
  if (product.value.dimensions) specs.push({ label: 'Dimensions', value: product.value.dimensions })
  if (product.value.material) specs.push({ label: 'Material', value: product.value.material })
  if (product.value.brand) specs.push({ label: 'Brand', value: product.value.brand })
  
  return specs
})

// Review statistics
const reviewStats = computed(() => {
  if (!product.value?.product_reviews?.length) return null
  
  const reviews = product.value.product_reviews
  const totalReviews = reviews.length
  const averageRating = reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / totalReviews
  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  
  reviews.forEach((review: any) => {
    ratingCounts[review.rating as keyof typeof ratingCounts]++
  })
  
  return {
    averageRating: averageRating.toFixed(1),
    totalReviews,
    ratingCounts
  }
})

// Format time
const formatTime = (timeString: string) => {
  if (!timeString) return null
  try {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const period = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${period}`
  } catch {
    return timeString
  }
}

// Format date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Add to cart function
const addToCart = async () => {
  try {
    addingToCart.value = true

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Check if item already exists in cart
    const { data: existingItem, error: checkError } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking cart:', checkError)
      throw checkError
    }

    if (existingItem) {
      // Update quantity
      const { error: updateError } = await supabase
        .from('cart_items')
        .update({ 
          quantity: existingItem.quantity + quantity.value,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingItem.id)

      if (updateError) throw updateError
    } else {
      // Add new item
      const { error: insertError } = await supabase
        .from('cart_items')
        .insert({
          user_id: user.id,
          product_id: productId,
          quantity: quantity.value,
          created_at: new Date().toISOString()
        })

      if (insertError) throw insertError
    }

    alert(`Added ${quantity.value} ${product.value.prod_name} to cart!`)
    
  } catch (err: any) {
    console.error('❌ Error adding to cart:', err)
    alert('Error adding product to cart: ' + (err.message || 'Unknown error'))
  } finally {
    addingToCart.value = false
  }
}

// Buy now function
const buyNow = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    router.push({
      name: 'purchaseview',
      state: {
        items: [{
          id: product.value.id,
          product_id: product.value.id,
          name: product.value.prod_name,
          price: product.value.price,
          quantity: quantity.value,
          image: selectedImage.value,
          shop_id: shop.value?.id,
          product: product.value
        }],
        fromCart: false
      }
    })
    
  } catch (err) {
    console.error('❌ Error in buy now:', err)
    alert('Error processing purchase')
  }
}

// Contact seller function
const contactSeller = async () => {
  try {
    if (!shop.value?.owner_id) {
      alert('Shop information not available')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Find or create conversation
    const { data: existingConversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(user1.eq.${user.id},user2.eq.${shop.value.owner_id}),and(user1.eq.${shop.value.owner_id},user2.eq.${user.id})`)
      .maybeSingle()

    let conversationId = existingConversation?.id

    if (!conversationId) {
      const { data: newConversation, error: createError } = await supabase
        .from('conversations')
        .insert({ 
          user1: user.id, 
          user2: shop.value.owner_id 
        })
        .select('id')
        .single()

      if (createError) throw createError
      conversationId = newConversation.id
    }

    // Navigate to chat view
    router.push({
      name: 'chatview',
      params: { id: shop.value.owner_id }
    })

  } catch (err: any) {
    console.error('❌ Error contacting seller:', err)
    alert('Error starting conversation: ' + (err.message || 'Unknown error'))
  }
}

// Quantity controls
const increaseQuantity = () => {
  quantity.value++
}

const decreaseQuantity = () => {
  if (quantity.value > 1) {
    quantity.value--
  }
}

// Navigation
const goBack = () => router.back()

const goToShop = () => {
  if (shop.value?.id) {
    router.push(`/shop/${shop.value.id}`)
  }
}

// Share product function
const shareProduct = () => {
  if (navigator.share) {
    navigator.share({
      title: product.value.prod_name,
      text: product.value.description,
      url: window.location.href,
    })
  } else {
    navigator.clipboard.writeText(window.location.href)
    alert('Product link copied to clipboard!')
  }
}

// Initialize
onMounted(() => {
  fetchProduct()
})
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat color="white" elevation="1">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="font-weight-bold">Product Details</v-toolbar-title>
      <v-spacer />
      <v-btn icon>
        <v-icon>mdi-heart-outline</v-icon>
      </v-btn>
      <v-btn icon @click="shareProduct">
        <v-icon>mdi-share-variant</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <!-- Loading State -->
      <div v-if="loading" class="loading-container">
        <v-progress-circular indeterminate color="primary" size="64" />
        <p class="text-h6 mt-4">Loading product information...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-container">
        <v-icon color="error" size="64">mdi-alert-circle-outline</v-icon>
        <p class="text-h6 mt-4">{{ error }}</p>
        <v-btn color="primary" class="mt-4" @click="fetchProduct">
          Try Again
        </v-btn>
        <v-btn variant="outlined" class="mt-2" @click="goBack">
          Go Back
        </v-btn>
      </div>

      <!-- Product Content -->
      <div v-else-if="product" class="product-content">
        <!-- Image Gallery -->
        <div class="image-section">
          <v-img
            :src="selectedImage"
            :alt="product.prod_name"
            class="main-image"
            cover
            height="400"
          />
          
          <!-- Thumbnail Images -->
          <div v-if="getProductImages(product).length > 1" class="thumbnail-container">
            <v-img
              v-for="(img, index) in getProductImages(product)"
              :key="index"
              :src="img"
              :alt="`${product.prod_name} ${index + 1}`"
              class="thumbnail"
              :class="{ 'thumbnail-active': img === selectedImage }"
              @click="selectedImage = img"
              cover
            />
          </div>
        </div>

        <!-- Product Info -->
        <div class="product-info">
          <v-card variant="flat" class="info-card">
            <!-- Price and Name -->
            <div class="price-section">
              <h1 class="product-name">{{ product.prod_name }}</h1>
              <div class="price">₱{{ product.price?.toFixed(2) }}</div>
              <div class="stock-info">
                <v-chip size="small" :color="product.stock_quantity > 0 ? 'success' : 'error'">
                  {{ product.stock_quantity > 0 ? `${product.stock_quantity} units available` : 'Out of stock' }}
                </v-chip>
                <div class="product-sku" v-if="product.sku">
                  SKU: {{ product.sku }}
                </div>
              </div>
            </div>

            <!-- Tabs Navigation -->
            <div class="tabs-section">
              <v-tabs v-model="activeTab" color="primary">
                <v-tab value="details">Details</v-tab>
                <v-tab value="specifications">Specifications</v-tab>
                <v-tab value="reviews">Reviews</v-tab>
              </v-tabs>

              <v-window v-model="activeTab">
                <!-- Details Tab -->
                <v-window-item value="details">
                  <div class="tab-content">
                    <div class="description-section">
                      <h3 class="section-title">Product Description</h3>
                      <p class="product-description">{{ product.description || 'No description available.' }}</p>
                    </div>

                    <!-- Shop Information -->
                    <div class="shop-section" v-if="shop">
                      <h3 class="section-title">Seller Information</h3>
                      <div class="shop-info" @click="goToShop">
                        <v-avatar size="48" class="shop-avatar">
                          <v-img :src="shop.logo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(shop.business_name)}&background=random`" />
                        </v-avatar>
                        <div class="shop-details">
                          <div class="shop-name">{{ shop.business_name }}</div>
                          <div class="shop-contact">
                            <v-icon small>mdi-phone</v-icon>
                            {{ shopInfo?.contact }}
                          </div>
                          <div class="shop-address" v-if="shopInfo?.fullAddress">
                            <v-icon small>mdi-map-marker</v-icon>
                            {{ shopInfo.fullAddress }}
                          </div>
                        </div>
                        <v-icon>mdi-chevron-right</v-icon>
                      </div>
                    </div>

                    <!-- Shop Schedule -->
                    <div class="schedule-section" v-if="shopInfo">
                      <h3 class="section-title">Business Hours & Delivery</h3>
                      <div class="schedule-info">
                        <div class="schedule-item">
                          <v-icon small color="primary">mdi-clock-outline</v-icon>
                          <div>
                            <div class="schedule-time">{{ shopInfo.openTime }} - {{ shopInfo.closeTime }}</div>
                            <div class="schedule-days">{{ shopInfo.openDays.join(', ') }}</div>
                          </div>
                        </div>
                        <div class="schedule-item">
                          <v-icon small color="primary">mdi-map-marker</v-icon>
                          <span>Meetup: {{ shopInfo.meetupDetails }}</span>
                        </div>
                        <div class="schedule-item">
                          <v-icon small color="primary">mdi-truck-delivery</v-icon>
                          <span>Delivery Options: {{ Array.isArray(shopInfo.deliveryOptions) ? shopInfo.deliveryOptions.join(', ') : shopInfo.deliveryOptions }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </v-window-item>

                <!-- Specifications Tab -->
                <v-window-item value="specifications">
                  <div class="tab-content">
                    <div class="specs-section">
                      <h3 class="section-title">Product Specifications</h3>
                      <div class="specs-list" v-if="productSpecs.length > 0">
                        <div v-for="spec in productSpecs" :key="spec.label" class="spec-item">
                          <span class="spec-label">{{ spec.label }}:</span>
                          <span class="spec-value">{{ spec.value }}</span>
                        </div>
                      </div>
                      <div v-else class="no-specs">
                        <v-icon>mdi-information-outline</v-icon>
                        <p>No specifications available for this product.</p>
                      </div>
                    </div>
                  </div>
                </v-window-item>

                <!-- Reviews Tab -->
                <v-window-item value="reviews">
                  <div class="tab-content">
                    <div class="reviews-section">
                      <!-- Review Statistics -->
                      <div v-if="reviewStats" class="review-stats">
                        <div class="rating-overview">
                          <div class="average-rating">
                            <span class="rating-number">{{ reviewStats.averageRating }}</span>
                            <div class="rating-stars">
                              <v-icon v-for="n in 5" :key="n" small :color="n <= Math.round(parseFloat(reviewStats.averageRating)) ? 'amber' : 'grey'">
                                mdi-star
                              </v-icon>
                            </div>
                            <span class="total-reviews">{{ reviewStats.totalReviews }} reviews</span>
                          </div>
                        </div>
                      </div>

                      <!-- Reviews List -->
                      <div class="reviews-list" v-if="product.product_reviews?.length > 0">
                        <div v-for="review in product.product_reviews" :key="review.id" class="review-item">
                          <div class="review-header">
                            <v-avatar size="32" class="review-avatar">
                              <v-img :src="review.user?.avatar_url || `https://ui-avatars.com/api/?name=${review.user?.first_name}+${review.user?.last_name}&background=random`" />
                            </v-avatar>
                            <div class="reviewer-info">
                              <div class="reviewer-name">
                                {{ review.user?.first_name }} {{ review.user?.last_name }}
                              </div>
                              <div class="review-date">{{ formatDate(review.created_at) }}</div>
                            </div>
                            <div class="review-rating">
                              <v-icon v-for="n in 5" :key="n" x-small :color="n <= review.rating ? 'amber' : 'grey'">
                                mdi-star
                              </v-icon>
                            </div>
                          </div>
                          <div class="review-comment" v-if="review.comment">
                            {{ review.comment }}
                          </div>
                        </div>
                      </div>
                      <div v-else class="no-reviews">
                        <v-icon>mdi-comment-outline</v-icon>
                        <p>No reviews yet for this product.</p>
                      </div>
                    </div>
                  </div>
                </v-window-item>
              </v-window>
            </div>

            <!-- Quantity Selector -->
            <div class="quantity-section">
              <h3 class="section-title">Quantity</h3>
              <div class="quantity-controls">
                <v-btn
                  icon
                  variant="outlined"
                  color="primary"
                  @click="decreaseQuantity"
                  :disabled="quantity <= 1"
                >
                  <v-icon>mdi-minus</v-icon>
                </v-btn>
                <span class="quantity-display">{{ quantity }}</span>
                <v-btn
                  icon
                  variant="outlined"
                  color="primary"
                  @click="increaseQuantity"
                >
                  <v-icon>mdi-plus</v-icon>
                </v-btn>
              </div>
            </div>
          </v-card>
        </div>
      </div>
    </v-main>

    <!-- Bottom Action Bar -->
    <v-footer app class="action-bar pa-3" color="white" elevation="6">
      <div class="action-content">
        <v-btn
          variant="outlined"
          color="primary"
          class="action-btn"
          @click="contactSeller"
        >
          <v-icon left>mdi-message</v-icon>
          Chat Seller
        </v-btn>
        
        <v-btn
          variant="outlined"
          color="primary"
          class="action-btn"
          @click="addToCart"
          :loading="addingToCart"
          :disabled="product?.stock_quantity === 0"
        >
          <v-icon left>mdi-cart</v-icon>
          Add to Cart
        </v-btn>
        
        <v-btn
          color="primary"
          variant="flat"
          class="buy-btn"
          @click="buyNow"
          :disabled="product?.stock_quantity === 0"
        >
          <v-icon left>mdi-shopping</v-icon>
          Buy Now
        </v-btn>
      </div>
    </v-footer>
  </v-app>
</template>

<style scoped>
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  text-align: center;
}

.product-content {
  padding-bottom: 80px;
}

/* Image Section */
.image-section {
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.main-image {
  width: 100%;
  object-fit: cover;
}

.thumbnail-container {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  overflow-x: auto;
}

.thumbnail {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid transparent;
  flex-shrink: 0;
}

.thumbnail-active {
  border-color: #2196f3;
}

/* Product Info */
.product-info {
  padding: 16px;
}

.info-card {
  background: transparent !important;
}

.price-section {
  margin-bottom: 20px;
}

.product-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
  margin-bottom: 8px;
  line-height: 1.3;
}

.price {
  font-size: 1.75rem;
  font-weight: 700;
  color: #2196f3;
  margin-bottom: 8px;
}

.stock-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.product-sku {
  font-size: 0.85rem;
  color: #666;
  background: #f5f5f5;
  padding: 4px 8px;
  border-radius: 4px;
}

/* Tabs Section */
.tabs-section {
  margin-bottom: 24px;
}

.tab-content {
  padding: 16px 0;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

/* Description Section */
.description-section {
  margin-bottom: 24px;
}

.product-description {
  color: #666;
  line-height: 1.6;
  font-size: 0.95rem;
}

/* Shop Section */
.shop-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 12px;
}

.shop-info {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: background-color 0.2s;
}

.shop-info:hover {
  background: rgba(0, 0, 0, 0.04);
}

.shop-details {
  flex: 1;
}

.shop-name {
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.shop-contact,
.shop-address {
  font-size: 0.85rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}

/* Schedule Section */
.schedule-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 12px;
}

.schedule-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.schedule-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: #666;
  font-size: 0.9rem;
}

.schedule-time {
  font-weight: 600;
  color: #333;
}

.schedule-days {
  font-size: 0.8rem;
  color: #666;
}

/* Specifications Section */
.specs-section {
  margin-bottom: 24px;
}

.specs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.spec-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.spec-label {
  font-weight: 600;
  color: #333;
}

.spec-value {
  color: #666;
}

.no-specs,
.no-reviews {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-specs .v-icon,
.no-reviews .v-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

/* Reviews Section */
.reviews-section {
  margin-bottom: 24px;
}

.review-stats {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 12px;
}

.rating-overview {
  display: flex;
  align-items: center;
  gap: 16px;
}

.average-rating {
  text-align: center;
}

.rating-number {
  font-size: 2rem;
  font-weight: 700;
  color: #333;
  display: block;
}

.rating-stars {
  margin: 4px 0;
}

.total-reviews {
  font-size: 0.85rem;
  color: #666;
}

.reviews-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.review-item {
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.review-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.reviewer-info {
  flex: 1;
}

.reviewer-name {
  font-weight: 600;
  color: #333;
}

.review-date {
  font-size: 0.8rem;
  color: #666;
}

.review-rating {
  display: flex;
  gap: 2px;
}

.review-comment {
  color: #666;
  line-height: 1.5;
}

/* Quantity Section */
.quantity-section {
  margin-bottom: 24px;
}

.quantity-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.quantity-display {
  font-size: 1.2rem;
  font-weight: 600;
  min-width: 40px;
  text-align: center;
}

/* Action Bar */
.action-bar {
  border-top: 1px solid #e0e0e0;
}

.action-content {
  display: flex;
  gap: 8px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.action-btn {
  flex: 1;
}

.buy-btn {
  flex: 2;
  font-weight: 600;
}

/* Responsive Design */
@media (max-width: 600px) {
  .product-name {
    font-size: 1.3rem;
  }
  
  .price {
    font-size: 1.5rem;
  }
  
  .action-content {
    flex-direction: column;
  }
  
  .action-btn,
  .buy-btn {
    width: 100%;
  }
  
  .thumbnail {
    width: 50px;
    height: 50px;
  }
  
  .stock-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .rating-overview {
    flex-direction: column;
    text-align: center;
  }
}

/* Scrollbar for thumbnails */
.thumbnail-container::-webkit-scrollbar {
  height: 4px;
}

.thumbnail-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 2px;
}

.thumbnail-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 2px;
}

.thumbnail-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>