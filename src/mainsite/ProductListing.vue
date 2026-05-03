<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const goBack = () => router.back()

type Product = {
  id: string
  prod_name: string
  prod_description: string
  price: number
  stock: number
  main_img_urls: string[]
  sizes: string[]
  varieties: any[]
  image: string
}

const products = ref<Product[]>([])
const loading = ref(true)
const deleting = ref(false)
const isMobile = ref(window.innerWidth < 768)

const confirmDialog = ref(false)
const productToDelete = ref<Product | null>(null)

const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error'>('success')

const showSnackbar = (msg: string, type: 'success' | 'error') => {
  snackbarMessage.value = msg
  snackbarColor.value = type
  snackbar.value = true
}

// Update mobile state
const updateMobileState = () => {
  isMobile.value = window.innerWidth < 768
}

// Fetch products
const fetchProducts = async () => {
  loading.value = true
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    showSnackbar('Please log in to manage products', 'error')
    loading.value = false;
    return
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!shop) {
    showSnackbar('No shop found for your account', 'error')
    products.value = [];
    loading.value = false;
    return
  }

  const { data, error } = await supabase
    .from('products')
    .select('id, prod_name, prod_description, price, stock, main_img_urls, sizes, varieties')
    .eq('shop_id', shop.id)

  if (!error && data) {
    products.value = data.map((p: any) => ({
      ...p,
      image: p.main_img_urls?.[0] || 'https://via.placeholder.com/300x300?text=No+Image',
      varieties: p.varieties || []
    }))
  } else if (error) {
    showSnackbar('Error loading products', 'error')
  }
  loading.value = false
}

// Stock status helper
const getStockStatus = (stock: number) => {
  if (stock <= 0) return { text: 'Out of Stock', color: 'error', icon: 'mdi-package-variant-closed', bg: '#ef4444' }
  if (stock < 10) return { text: 'Low Stock', color: 'warning', icon: 'mdi-alert', bg: '#f59e0b' }
  return { text: 'In Stock', color: 'success', icon: 'mdi-check-circle', bg: '#10b981' }
}

// Format price
const formatPrice = (price: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(price)
}

const requestDelete = (product: Product) => {
  productToDelete.value = product
  confirmDialog.value = true
}

// Delete product with RLS-aware error handling
const deleteProductConfirmed = async () => {
  if (!productToDelete.value) return
  const productId = productToDelete.value.id
  deleting.value = true

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: userShop } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!userShop) throw new Error('No shop found for your account')

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('shop_id')
      .eq('id', productId)
      .single()

    if (productError) throw new Error('Product not found')
    if (product.shop_id !== userShop.id) throw new Error('You do not own this product')

    // Delete from referencing tables first
    const referenceTables = [
      { name: 'cart_items', column: 'product_id' },
      { name: 'order_items', column: 'product_id' },
      { name: 'reviews', column: 'product_id' }
    ]

    for (const table of referenceTables) {
      const { error: deleteRefError } = await supabase
        .from(table.name)
        .delete()
        .eq(table.column, productId)

      if (deleteRefError && !deleteRefError.message.includes('0 rows')) {
        console.warn(`Could not delete from ${table.name}:`, deleteRefError.message)
      }
    }

    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)

    if (deleteError) {
      if (deleteError.code === '42501') {
        throw new Error('Permission denied. Please check RLS policies.')
      } else if (deleteError.code === '23503') {
        throw new Error('Product is still referenced in other tables.')
      } else {
        throw new Error(`Database error: ${deleteError.message}`)
      }
    }

    products.value = products.value.filter(p => p.id !== productId)
    showSnackbar('Product deleted successfully', 'success')

  } catch (err: any) {
    console.error('Delete failed:', err)
    showSnackbar(err.message, 'error')
  } finally {
    deleting.value = false
    confirmDialog.value = false
    productToDelete.value = null
  }
}

const editProduct = (id: string) => {
  router.push({ name: 'AddItem', params: { id } })
}

// Add window resize listener
onMounted(() => {
  fetchProducts()
  window.addEventListener('resize', updateMobileState)
})
</script>

<template>
  <v-app>
    <v-app-bar class="top-bar" flat color="#3f83c7" dark elevation="0" :height="isMobile ? '56' : '64'">
      <v-btn icon @click="goBack" size="small" class="back-btn">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-subtitle-1 font-weight-bold">
        Products
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn color="white" variant="text" @click="fetchProducts" :loading="loading" size="small" class="refresh-btn">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main class="background-gradient">
      <v-container :class="isMobile ? 'px-3 py-3' : 'pa-6'" fluid>
        <!-- Stats Header -->
        <div class="stats-header mb-4">
          <div class="d-flex align-center justify-space-between">
            <div>
              <h1 :class="isMobile ? 'text-h6 font-weight-bold' : 'text-h4 font-weight-bold'" class="text-primary mb-1">
                My Products
              </h1>
              <div class="d-flex align-center gap-2">
                <v-chip size="x-small" color="primary" variant="flat" class="product-count-chip">
                  <v-icon start size="12">mdi-package-variant</v-icon>
                  {{ products.length }} {{ products.length === 1 ? 'item' : 'items' }}
                </v-chip>
                <v-chip v-if="products.filter(p => p.stock < 10 && p.stock > 0).length > 0" size="x-small" color="warning" variant="flat">
                  <v-icon start size="12">mdi-alert</v-icon>
                  {{ products.filter(p => p.stock < 10 && p.stock > 0).length }} low stock
                </v-chip>
              </div>
            </div>
            
            <!-- IMPROVED ADD PRODUCT BUTTON -->
            <button 
              @click="router.push('/additem')"
              class="add-product-btn"
              :class="{ 'mobile-btn': isMobile }"
            >
              <div class="btn-content">
                <svg class="plus-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <span class="btn-text">Add Product</span>
              </div>
              <div class="btn-shine"></div>
            </button>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="loading-container">
          <div class="loading-content">
            <div class="loading-spinner"></div>
            <p class="loading-text">Loading your products...</p>
          </div>
        </div>

        <!-- No Products State -->
        <v-card v-else-if="products.length === 0" class="empty-state-card" :rounded="isMobile ? 'lg' : 'xl'" elevation="0">
          <v-card-text class="text-center py-8">
            <div class="empty-state-icon">
              <v-icon :size="isMobile ? 56 : 80" color="#cbd5e1">mdi-package-variant-closed</v-icon>
            </div>
            <h3 :class="isMobile ? 'text-subtitle-1' : 'text-h5'" class="font-weight-bold mb-2">No products yet</h3>
            <p class="text-caption text-grey mb-4">Start selling by adding your first product</p>
            <v-btn color="#3f83c7" prepend-icon="mdi-plus" @click="router.push('/additem')" size="default" rounded="lg" class="px-6">
              Add Product
            </v-btn>
          </v-card-text>
        </v-card>

        <!-- Products Grid - 2 columns on mobile -->
        <v-row v-else :dense="isMobile" class="products-grid">
          <v-col 
            v-for="product in products" 
            :key="product.id" 
            :cols="isMobile ? 6 : 12" 
            :md="6" 
            :lg="4"
            :xl="3"
            class="product-col"
          >
            <div class="product-card">
              <!-- Product Image -->
              <div class="product-image-container">
                <v-img 
                  :src="product.image" 
                  :height="isMobile ? 140 : 180" 
                  cover 
                  class="product-image"
                  :lazy-src="product.image"
                >
                  <template #placeholder>
                    <div class="image-placeholder">
                      <v-icon :size="isMobile ? 32 : 40" color="#94a3b8">mdi-image-off</v-icon>
                    </div>
                  </template>
                </v-img>
                
                <!-- Stock Badge -->
                <div class="stock-badge" :style="{ background: getStockStatus(product.stock).bg }">
                  <v-icon size="10" class="mr-1">{{ getStockStatus(product.stock).icon }}</v-icon>
                  <span>{{ isMobile ? getStockStatus(product.stock).text.charAt(0) : getStockStatus(product.stock).text }}</span>
                </div>

                <!-- Edit Overlay (Desktop only) -->
                <div class="image-overlay" @click="editProduct(product.id)">
                  <v-icon size="24" color="white">mdi-pencil</v-icon>
                </div>
              </div>

              <!-- Product Info -->
              <div class="product-info" :class="isMobile ? 'p-2' : 'p-3'">
                <div class="product-header">
                  <h3 class="product-name line-clamp-1">{{ product.prod_name }}</h3>
                  <span class="stock-number">{{ product.stock }} pcs</span>
                </div>

                <div class="product-price">
                  {{ formatPrice(product.price) }}
                </div>

                <p v-if="!isMobile && product.prod_description" class="product-description line-clamp-2">
                  {{ product.prod_description }}
                </p>

                <!-- Varieties Badge -->
                <div v-if="product.varieties?.length > 0 && !isMobile" class="varieties-badge">
                  <v-icon size="12" class="mr-1">mdi-tag-multiple</v-icon>
                  <span>{{ product.varieties.length }} varieties</span>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="product-actions" :class="isMobile ? 'p-2' : 'p-3'">
                <button class="action-btn edit-btn" @click="editProduct(product.id)">
                  <v-icon :size="isMobile ? 16 : 18">mdi-pencil</v-icon>
                  <span v-if="!isMobile">Edit</span>
                </button>
                <button class="action-btn delete-btn" @click="requestDelete(product)" :disabled="deleting && productToDelete?.id === product.id">
                  <v-icon :size="isMobile ? 16 : 18" class="mr-0">mdi-delete</v-icon>
                  <span v-if="!isMobile">Delete</span>
                </button>
              </div>
            </div>
          </v-col>
        </v-row>

        <!-- Confirm Delete Dialog -->
        <v-dialog v-model="confirmDialog" max-width="380" persistent>
          <v-card :rounded="isMobile ? 'lg' : 'xl'" class="delete-dialog">
            <div class="dialog-icon">
              <div class="icon-circle">
                <v-icon size="32" color="#ef4444">mdi-trash-can-outline</v-icon>
              </div>
            </div>
            <v-card-title class="dialog-title">Delete Product?</v-card-title>
            <v-card-text class="dialog-text">
              "<strong>{{ productToDelete?.prod_name }}</strong>" will be permanently removed.
            </v-card-text>
            <v-card-actions class="dialog-actions">
              <button class="dialog-btn cancel-btn" @click="confirmDialog = false" :disabled="deleting">
                Cancel
              </button>
              <button class="dialog-btn confirm-delete-btn" @click="deleteProductConfirmed" :disabled="deleting">
                <v-icon v-if="deleting" size="16" class="mr-1">mdi-loading mdi-spin</v-icon>
                Delete
              </button>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Snackbar -->
        <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000" location="bottom" variant="flat" rounded="lg">
          <div class="d-flex align-center">
            <v-icon start size="18" class="mr-2">
              {{ snackbarColor === 'success' ? 'mdi-check-circle' : 'mdi-alert-circle' }}
            </v-icon>
            {{ snackbarMessage }}
          </div>
        </v-snackbar>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.background-gradient {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  min-height: 100vh;
}

.top-bar {
  padding-top: env(safe-area-inset-top, 0px);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05) !important;
}

.back-btn,
.refresh-btn {
  transition: all 0.2s ease;
}

.back-btn:active,
.refresh-btn:active {
  transform: scale(0.95);
}

/* Stats Header */
.stats-header {
  margin-bottom: 20px;
}

.product-count-chip {
  font-weight: 500;
}

/* IMPROVED ADD PRODUCT BUTTON */
.add-product-btn {
  position: relative;
  background: linear-gradient(135deg, #3f83c7 0%, #2563eb 100%);
  border: none;
  border-radius: 14px;
  padding: 12px 24px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}

.add-product-btn .btn-content {
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
  z-index: 2;
}

.plus-icon {
  width: 20px;
  height: 20px;
  color: white;
  transition: transform 0.3s ease;
}

.btn-text {
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
  letter-spacing: 0.3px;
}

/* Shine effect */
.btn-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s ease;
  z-index: 1;
}

.add-product-btn:hover .btn-shine {
  left: 100%;
}

/* Hover effects */
.add-product-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.35);
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
}

/* Active/Press effect */
.add-product-btn:active {
  transform: translateY(1px);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
}

/* Glow animation */
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

.add-product-btn:focus {
  animation: pulse 0.5s ease-out;
  outline: none;
}

/* Ripple effect on click */
.add-product-btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition: width 0.4s ease, height 0.4s ease;
}

.add-product-btn:active::after {
  width: 200px;
  height: 200px;
}

/* Gradient animation */
@keyframes gradientShift {
  0% {
    background: linear-gradient(135deg, #3f83c7 0%, #2563eb 100%);
  }
  50% {
    background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
  }
  100% {
    background: linear-gradient(135deg, #3f83c7 0%, #2563eb 100%);
  }
}

.add-product-btn {
  animation: gradientShift 4s ease infinite;
  background-size: 200% 200%;
}

/* Mobile version */
.add-product-btn.mobile-btn {
  padding: 10px 18px;
  border-radius: 12px;
}

.add-product-btn.mobile-btn .btn-text {
  font-size: 0.8rem;
}

.add-product-btn.mobile-btn .plus-icon {
  width: 18px;
  height: 18px;
}

/* Loading State */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.loading-content {
  text-align: center;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 12px;
  border: 3px solid #e2e8f0;
  border-top-color: #3f83c7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: #64748b;
  font-size: 0.875rem;
}

/* Empty State */
.empty-state-card {
  background: white;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
}

.empty-state-icon {
  margin-bottom: 16px;
}

/* Products Grid */
.products-grid {
  margin: 0 -4px;
}

.product-col {
  padding: 6px !important;
}

.product-card {
  background: white;
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.25s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.product-card:active {
  transform: scale(0.98);
}

/* Product Image */
.product-image-container {
  position: relative;
  overflow: hidden;
  background: #f8fafc;
}

.product-image {
  transition: transform 0.3s ease;
}

.product-card:hover .product-image {
  transform: scale(1.05);
}

.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
}

/* Stock Badge */
.stock-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  backdrop-filter: blur(4px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  color: white;
  letter-spacing: 0.3px;
}

/* Image Overlay (Desktop) */
.image-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  cursor: pointer;
}

.product-image-container:hover .image-overlay {
  opacity: 1;
}

/* Product Info */
.product-info {
  flex: 1;
  padding: 12px;
}

.product-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  gap: 8px;
}

.product-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #1e293b;
  flex: 1;
}

.stock-number {
  font-size: 0.7rem;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 12px;
  white-space: nowrap;
}

.product-price {
  font-size: 1rem;
  font-weight: 700;
  color: #3f83c7;
  margin-bottom: 6px;
}

.product-description {
  font-size: 0.7rem;
  color: #64748b;
  margin-top: 6px;
  line-height: 1.4;
}

.varieties-badge {
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.65rem;
  color: #475569;
  margin-top: 8px;
}

/* Action Buttons */
.product-actions {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #e2e8f0;
  background: #fafbfc;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:active {
  transform: scale(0.96);
}

.edit-btn {
  background: #eff6ff;
  color: #3f83c7;
}

.edit-btn:active {
  background: #dbeafe;
}

.delete-btn {
  background: #fef2f2;
  color: #ef4444;
}

.delete-btn:active {
  background: #fee2e2;
}

.delete-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Delete Dialog */
.delete-dialog {
  text-align: center;
  padding: 24px 20px 20px;
}

.dialog-icon {
  margin-bottom: 16px;
}

.icon-circle {
  width: 56px;
  height: 56px;
  margin: 0 auto;
  background: #fef2f2;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
  padding: 0;
}

.dialog-text {
  color: #475569;
  font-size: 0.875rem;
  margin-bottom: 20px;
  padding: 0;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  padding: 0;
  justify-content: center;
}

.dialog-btn {
  flex: 1;
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.dialog-btn:active {
  transform: scale(0.97);
}

.cancel-btn {
  background: #f1f5f9;
  color: #475569;
}

.confirm-delete-btn {
  background: #ef4444;
  color: white;
}

.confirm-delete-btn:active {
  background: #dc2626;
}

/* Utility Classes */
.p-2 {
  padding: 10px;
}

.p-3 {
  padding: 14px;
}

.gap-2 {
  gap: 8px;
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
  .product-name {
    font-size: 0.75rem;
  }
  
  .product-price {
    font-size: 0.85rem;
  }
  
  .action-btn {
    padding: 8px 12px;
  }
  
  .stock-badge {
    padding: 3px 8px;
    font-size: 0.6rem;
    top: 8px;
    right: 8px;
  }
  
  .stock-number {
    font-size: 0.65rem;
  }
  
  .product-info {
    padding: 10px;
  }
  
  .product-actions {
    padding: 10px;
  }
  
  .dialog-title {
    font-size: 1.1rem;
  }
}

/* Extra Small Devices */
@media (max-width: 360px) {
  .product-name {
    font-size: 0.7rem;
  }
  
  .product-price {
    font-size: 0.8rem;
  }
  
  .stock-badge span {
    display: none;
  }
  
  .stock-badge {
    padding: 3px 6px;
  }
  
  .stock-badge .v-icon {
    margin-right: 0 !important;
  }
  
  .action-btn {
    padding: 6px 8px;
  }
}

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  .background-gradient {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  }
  
  .product-card,
  .empty-state-card {
    background: #1e293b;
    border-color: #334155;
  }
  
  .product-name {
    color: #f1f5f9;
  }
  
  .stock-number {
    background: #334155;
    color: #94a3b8;
  }
  
  .product-description {
    color: #94a3b8;
  }
  
  .varieties-badge {
    background: #334155;
    color: #94a3b8;
  }
  
  .product-actions {
    background: #0f172a;
    border-top-color: #334155;
  }
  
  .edit-btn {
    background: #1e293b;
    color: #60a5fa;
  }
  
  .delete-btn {
    background: #1e293b;
    color: #f87171;
  }
  
  .delete-dialog {
    background: #1e293b;
  }
  
  .dialog-title {
    color: #f1f5f9;
  }
  
  .dialog-text {
    color: #94a3b8;
  }
  
  .cancel-btn {
    background: #334155;
    color: #cbd5e1;
  }
  
  .add-product-btn {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    box-shadow: 0 4px 12px rgba(29, 78, 216, 0.3);
  }
  
  .add-product-btn:hover {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  }
}
</style>