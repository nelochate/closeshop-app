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

// Fetch product details with your schema
const fetchProduct = async () => {
  try {
    loading.value = true
    error.value = null

    console.log('🛍️ Fetching product:', productId)

    // Using your actual table structure
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
          province
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

    // Set default selected image using your main_img_urls field
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

// Get product images from your main_img_urls field
const getProductImages = (productData: any): string[] => {
  if (!productData?.main_img_urls) return ['/placeholder.png']
  
  try {
    // Handle different formats of main_img_urls
    if (typeof productData.main_img_urls === 'string') {
      // Try to parse as JSON array
      try {
        const parsed = JSON.parse(productData.main_img_urls)
        return Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        // If it's a single URL string
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

// Get shop schedule from your shops table
const shopSchedule = computed(() => {
  if (!shop.value) return null
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const openDays = shop.value.open_days?.map((dayIndex: number) => days[dayIndex]) || []
  
  // Format address from your shops table columns
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
    fullAddress
  }
})

// Format time from your time columns
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

// Add to cart function using your cart_items table
const addToCart = async () => {
  try {
    addingToCart.value = true

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    console.log('🛒 Adding to cart for user:', user.id)

    // Check if item already exists in cart using your cart_items table
    const { data: existingItem, error: checkError } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('❌ Error checking cart:', checkError)
      throw checkError
    }

    if (existingItem) {
      // Update quantity if item exists
      const { error: updateError } = await supabase
        .from('cart_items')
        .update({ 
          quantity: existingItem.quantity + quantity.value,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingItem.id)

      if (updateError) {
        console.error('❌ Error updating cart:', updateError)
        throw updateError
      }
      
      console.log('✅ Cart item quantity updated')
    } else {
      // Add new item to cart using your cart_items schema
      const { error: insertError } = await supabase
        .from('cart_items')
        .insert({
          user_id: user.id,
          product_id: productId,
          quantity: quantity.value,
          created_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('❌ Error adding to cart:', insertError)
        throw insertError
      }
      
      console.log('✅ New item added to cart')
    }

    // Show success message
    alert(`Added ${quantity.value} ${product.value.prod_name} to cart!`)
    
  } catch (err: any) {
    console.error('❌ Error adding to cart:', err)
    alert('Error adding product to cart: ' + (err.message || 'Unknown error'))
  } finally {
    addingToCart.value = false
  }
}

// Buy now function - navigates to your existing purchase view
const buyNow = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    console.log('🚀 Buying now, navigating to purchase view')

    // Navigate to your existing purchase view with this product
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

// Contact seller function - uses your conversations/messages schema
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

    console.log('💬 Contacting seller:', shop.value.owner_id)

    // Find or create conversation (using your existing logic)
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

      if (createError) {
        console.error('❌ Error creating conversation:', createError)
        throw createError
      }
      
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
    // You might want to create a ShopView component
    console.log('Navigating to shop:', shop.value.id)
    // router.push(`/shop/${shop.value.id}`)
    alert('Shop view coming soon!')
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
    // Fallback: copy to clipboard
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
        <p class="text-h6 mt-4">Loading product...</p>
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
              <div v-if="product.stock_quantity !== undefined" class="stock-info">
                <v-chip size="small" :color="product.stock_quantity > 0 ? 'success' : 'error'">
                  {{ product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock' }}
                </v-chip>
              </div>
            </div>

            <!-- Description -->
            <div class="description-section">
              <h3 class="section-title">Description</h3>
              <p class="product-description">{{ product.description || 'No description available.' }}</p>
            </div>

            <!-- Shop Info -->
            <div class="shop-section" v-if="shop">
              <h3 class="section-title">Sold by</h3>
              <div class="shop-info" @click="goToShop">
                <v-avatar size="48" class="shop-avatar">
                  <v-img :src="shop.logo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(shop.business_name)}&background=random`" />
                </v-avatar>
                <div class="shop-details">
                  <div class="shop-name">{{ shop.business_name }}</div>
                  <div class="shop-address" v-if="shopSchedule?.fullAddress">
                    {{ shopSchedule.fullAddress }}
                  </div>
                </div>
                <v-icon>mdi-chevron-right</v-icon>
              </div>
            </div>

            <!-- Shop Schedule -->
            <div class="schedule-section" v-if="shopSchedule">
              <h3 class="section-title">Shop Information</h3>
              <div class="schedule-info">
                <div class="schedule-item">
                  <v-icon small>mdi-clock-outline</v-icon>
                  <span>Open {{ shopSchedule.openTime }} - {{ shopSchedule.closeTime }}</span>
                </div>
                <div class="schedule-item">
                  <v-icon small>mdi-calendar</v-icon>
                  <span>Open: {{ shopSchedule.openDays.join(', ') }}</span>
                </div>
                <div class="schedule-item">
                  <v-icon small>mdi-map-marker</v-icon>
                  <span>Meetup: {{ shopSchedule.meetupDetails }}</span>
                </div>
              </div>
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
          Chat
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

<!-- Keep the same styles as previous version -->
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
  margin-top: 8px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

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

.shop-address {
  font-size: 0.85rem;
  color: #666;
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
  gap: 12px;
}

.schedule-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #666;
  font-size: 0.9rem;
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