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
const activeTab = ref('details') // 'details', 'specifications'

// Fetch product details - CORRECTED QUERY
const fetchProduct = async () => {
  try {
    loading.value = true
    error.value = null

    console.log('🛍️ Fetching product:', productId)

    // CORRECTED QUERY - using only existing columns from your shops table
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
          postal,
          building,
          house_no,
          region,
          latitude,
          longitude,
          physical_store,
          detected_address,
          status
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

// Get product images - UPDATED FOR JSONB FIELD
const getProductImages = (productData: any): string[] => {
  if (!productData?.main_img_urls) return ['/placeholder.png']
  
  try {
    // Since main_img_urls is JSONB, it might already be parsed
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
    
    // Handle JSONB object case
    if (typeof productData.main_img_urls === 'object') {
      return Object.values(productData.main_img_urls)
    }
    
    return ['/placeholder.png']
  } catch {
    return ['/placeholder.png']
  }
}

// Enhanced shop information - UPDATED TO USE ACTUAL COLUMNS
const shopInfo = computed(() => {
  if (!shop.value) return null
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const openDays = shop.value.open_days?.map((dayIndex: number) => days[dayIndex]) || []
  
  // Build address from available columns
  const addressParts = [
    shop.value.house_no,
    shop.value.building,
    shop.value.street,
    shop.value.barangay,
    shop.value.city,
    shop.value.province,
    shop.value.postal
  ].filter(Boolean)
  
  const fullAddress = addressParts.join(', ') || shop.value.detected_address || 'Address not specified'

  return {
    openDays,
    openTime: formatTime(shop.value.open_time) || '9:00 AM',
    closeTime: formatTime(shop.value.close_time) || '6:00 PM',
    meetupDetails: shop.value.meetup_details || 'Main Entrance',
    deliveryOptions: shop.value.delivery_options || ['meetup'],
    fullAddress,
    // REMOVED contact since contact_number doesn't exist
    email: shop.value.email || 'Not provided',
    hasPhysicalStore: shop.value.physical_store === 'yes'
  }
})

// Product specifications - UPDATED FOR YOUR SCHEMA
const productSpecs = computed(() => {
  if (!product.value) return []
  
  const specs = []
  
  // Check for varieties
  if (product.value.varieties) {
    try {
      const varieties = typeof product.value.varieties === 'string' 
        ? JSON.parse(product.value.varieties) 
        : product.value.varieties
      if (Array.isArray(varieties) && varieties.length > 0) {
        specs.push({ label: 'Varieties', value: varieties.join(', ') })
      }
    } catch (e) {
      console.log('Error parsing varieties:', e)
    }
  }
  
  // Check for sizes
  if (product.value.sizes) {
    try {
      const sizes = typeof product.value.sizes === 'string' 
        ? JSON.parse(product.value.sizes) 
        : product.value.sizes
      if (Array.isArray(sizes) && sizes.length > 0) {
        specs.push({ label: 'Sizes', value: sizes.join(', ') })
      }
    } catch (e) {
      console.log('Error parsing sizes:', e)
    }
  }
  
  // Check stock (using 'stock' field from your schema, not 'stock_quantity')
  if (product.value.stock !== undefined) {
    specs.push({ label: 'Stock', value: `${product.value.stock} units` })
  }
  
  // Check sold count
  if (product.value.sold) {
    specs.push({ label: 'Sold', value: product.value.sold.toString() })
  }

  // Check if has varieties or sizes
  if (product.value.has_varieties) {
    specs.push({ label: 'Has Varieties', value: 'Yes' })
  }
  
  if (product.value.has_sizes) {
    specs.push({ label: 'Has Sizes', value: 'Yes' })
  }
  
  return specs
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
      text: product.value.prod_description || product.value.description,
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
                <v-chip size="small" :color="product.stock > 0 ? 'success' : 'error'">
                  {{ product.stock > 0 ? `${product.stock} units available` : 'Out of stock' }}
                </v-chip>
                <div class="product-sold" v-if="product.sold">
                  {{ product.sold }} sold
                </div>
              </div>
            </div>

            <!-- Tabs Navigation -->
            <div class="tabs-section">
              <v-tabs v-model="activeTab" color="primary">
                <v-tab value="details">Details</v-tab>
                <v-tab value="specifications">Specifications</v-tab>
              </v-tabs>

              <v-window v-model="activeTab">
                <!-- Details Tab -->
                <v-window-item value="details">
                  <div class="tab-content">
                    <div class="description-section">
                      <h3 class="section-title">Product Description</h3>
                      <p class="product-description">{{ product.prod_description || product.description || 'No description available.' }}</p>
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
                          <!-- REMOVED contact number since it doesn't exist -->
                          <div class="shop-email" v-if="shopInfo?.email && shopInfo.email !== 'Not provided'">
                            <v-icon small>mdi-email</v-icon>
                            {{ shopInfo.email }}
                          </div>
                          <div class="shop-address" v-if="shopInfo?.fullAddress">
                            <v-icon small>mdi-map-marker</v-icon>
                            {{ shopInfo.fullAddress }}
                          </div>
                          <div class="shop-status" v-if="shop.status">
                            <v-chip size="x-small" :color="shop.status === 'approved' ? 'success' : 'warning'">
                              {{ shop.status }}
                            </v-chip>
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
                        <div class="schedule-item" v-if="shopInfo.hasPhysicalStore">
                          <v-icon small color="primary">mdi-store</v-icon>
                          <span>Physical Store Available</span>
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
                  :disabled="product.stock !== undefined && quantity >= product.stock"
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
          :disabled="!product || product.stock === 0"
        >
          <v-icon left>mdi-cart</v-icon>
          Add to Cart
        </v-btn>
        
        <v-btn
          color="primary"
          variant="flat"
          class="buy-btn"
          @click="buyNow"
          :disabled="!product || product.stock === 0"
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

.shop-email {
  font-size: 0.85rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}

.shop-status {
  margin-top: 4px;
}

/* Rest of your CSS remains unchanged */
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
</style>