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
  if (stock <= 0) return { text: 'Out of Stock', color: 'error', icon: 'mdi-package-variant-closed' }
  if (stock < 10) return { text: 'Low Stock', color: 'warning', icon: 'mdi-alert' }
  return { text: 'In Stock', color: 'success', icon: 'mdi-check-circle' }
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
    <v-app-bar class="top-bar" flat color="primary" dark elevation="2" :height="isMobile ? '56' : '64'">
      <v-btn icon @click="goBack" size="small">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-subtitle-1 font-weight-bold">
        Product Management
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn color="white" variant="text" @click="fetchProducts" :loading="loading" size="small">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main class="background-gradient">
      <v-container :class="isMobile ? 'pa-3' : 'pa-6'">
        <!-- Header Section -->
        <div class="d-flex align-center justify-space-between mb-6 flex-wrap gap-3">
          <div>
            <h1 :class="isMobile ? 'text-h6 font-weight-bold' : 'text-h4 font-weight-bold'" class="text-primary">
              My Products
            </h1>
            <p class="text-caption text-medium-emphasis mt-1">
              {{ products.length }} {{ products.length === 1 ? 'product' : 'products' }} in your catalog
            </p>
          </div>
          <v-btn 
            color="primary" 
            :rounded="isMobile ? 'lg' : 'xl'" 
            :size="isMobile ? 'large' : 'x-large'"
            prepend-icon="mdi-plus" 
            @click="router.push('/additem')"
            class="add-btn"
            elevation="2"
          >
            Add New Item
          </v-btn>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="text-center py-12">
          <v-progress-circular indeterminate color="primary" :size="isMobile ? 48 : 64" />
          <div class="mt-3 text-body-2 text-medium-emphasis">Loading your products...</div>
        </div>

        <!-- No Products State -->
        <v-card v-else-if="products.length === 0" class="empty-state-card" :rounded="isMobile ? 'lg' : 'xl'" elevation="2">
          <v-card-text class="text-center py-12">
            <v-icon :size="isMobile ? 64 : 96" color="grey-lighten-2" class="mb-4">mdi-package-variant-closed</v-icon>
            <h3 :class="isMobile ? 'text-h6' : 'text-h5'" class="mb-2">No Products Yet</h3>
            <p class="text-caption text-medium-emphasis mb-4">
              Get started by adding your first product to your shop.
            </p>
            <v-btn color="primary" prepend-icon="mdi-plus" @click="router.push('/additem')" size="large" rounded="lg">
              Add Your First Product
            </v-btn>
          </v-card-text>
        </v-card>

        <!-- Products Grid -->
        <v-row v-else>
          <v-col 
            v-for="product in products" 
            :key="product.id" 
            :cols="12" 
            :md="6" 
            :lg="4"
            :xl="3"
            class="product-col"
          >
            <v-card class="product-card" :rounded="isMobile ? 'lg' : 'xl'" elevation="2">
              <!-- Product Image with hover effect -->
              <div class="product-image-wrapper">
                <v-img 
                  :src="product.image" 
                  height="200" 
                  cover 
                  class="product-image"
                  gradient="to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.3)"
                >
                  <template #placeholder>
                    <div class="d-flex align-center justify-center fill-height bg-grey-lighten-3">
                      <v-icon size="48" color="grey-lighten-1">mdi-image-off</v-icon>
                    </div>
                  </template>
                </v-img>
                
                <!-- Stock Status Overlay -->
                <div class="stock-badge" :class="`stock-${getStockStatus(product.stock).color}`">
                  <v-icon :size="isMobile ? 12 : 14" class="mr-1">{{ getStockStatus(product.stock).icon }}</v-icon>
                  <span>{{ getStockStatus(product.stock).text }}</span>
                </div>
              </div>

              <v-card-text :class="isMobile ? 'pa-3' : 'pa-4'">
                <!-- Product Title -->
                <div class="d-flex justify-space-between align-start mb-2">
                  <h3 class="text-subtitle-1 font-weight-bold text-primary line-clamp-1">
                    {{ product.prod_name }}
                  </h3>
                  <v-chip size="x-small" color="grey-lighten-2" variant="flat">
                    Stock: {{ product.stock }}
                  </v-chip>
                </div>

                <!-- Product Description -->
                <p class="text-caption text-medium-emphasis mb-3 line-clamp-2">
                  {{ product.prod_description || 'No description provided' }}
                </p>

                <!-- Price -->
                <div class="mb-3">
                  <span class="text-h6 font-weight-bold text-primary">{{ formatPrice(product.price) }}</span>
                </div>

                <!-- Varieties & Sizes Tags -->
                <div v-if="product.varieties?.length > 0 || product.sizes?.length > 0" class="mb-3">
                  <div v-if="product.varieties?.length > 0" class="d-flex flex-wrap gap-1 mb-1">
                    <v-chip v-for="variety in product.varieties.slice(0, 2)" :key="variety" size="x-small" variant="outlined">
                      {{ variety }}
                    </v-chip>
                    <v-chip v-if="product.varieties.length > 2" size="x-small" variant="outlined">
                      +{{ product.varieties.length - 2 }}
                    </v-chip>
                  </div>
                  <div v-if="product.sizes?.length > 0" class="d-flex flex-wrap gap-1">
                    <v-chip v-for="size in product.sizes.slice(0, 3)" :key="size" size="x-small" variant="flat" color="grey-lighten-3">
                      {{ size }}
                    </v-chip>
                    <v-chip v-if="product.sizes.length > 3" size="x-small" variant="flat" color="grey-lighten-3">
                      +{{ product.sizes.length - 3 }}
                    </v-chip>
                  </div>
                </div>
              </v-card-text>

              <v-divider></v-divider>

              <!-- Action Buttons - FIXED: Both buttons now visible -->
              <v-card-actions :class="isMobile ? 'pa-3' : 'pa-4'">
                <div class="action-buttons-container">
                  <v-btn 
                    color="primary" 
                    variant="tonal" 
                    :size="isMobile ? 'small' : 'default'"
                    :rounded="isMobile ? 'md' : 'lg'"
                    @click="editProduct(product.id)"
                    class="edit-btn"
                  >
                    <v-icon start size="18">mdi-pencil</v-icon>
                    Edit
                  </v-btn>
                  <v-btn 
                    color="error" 
                    variant="tonal" 
                    :size="isMobile ? 'small' : 'default'"
                    :rounded="isMobile ? 'md' : 'lg'"
                    @click="requestDelete(product)"
                    :loading="deleting && productToDelete?.id === product.id"
                    class="delete-btn"
                  >
                    <v-icon start size="18">mdi-delete</v-icon>
                    Delete
                  </v-btn>
                </div>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>

        <!-- Confirm Delete Dialog -->
        <v-dialog v-model="confirmDialog" max-width="500" persistent>
          <v-card :rounded="isMobile ? 'lg' : 'xl'">
            <v-card-title class="text-h6 d-flex align-center pa-4 bg-error-lighten-5">
              <v-icon color="error" size="28" class="mr-2">mdi-alert-circle</v-icon>
              Confirm Delete
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text class="pa-4">
              <div class="mb-3">
                Are you sure you want to delete <strong class="text-primary">"{{ productToDelete?.prod_name }}"</strong>?
              </div>
              <v-alert type="warning" density="compact" rounded="lg">
                <div class="d-flex align-center">
                  <v-icon size="18" class="mr-2">mdi-alert</v-icon>
                  This action is permanent and cannot be undone.
                </div>
              </v-alert>
            </v-card-text>
            <v-divider></v-divider>
            <v-card-actions class="pa-4">
              <v-spacer></v-spacer>
              <v-btn variant="outlined" @click="confirmDialog = false" :disabled="deleting" rounded="lg">
                Cancel
              </v-btn>
              <v-btn color="error" @click="deleteProductConfirmed" :loading="deleting" rounded="lg" variant="flat">
                <v-icon start>mdi-delete</v-icon>
                Delete Permanently
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Snackbar -->
        <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="5000" location="bottom right" rounded="lg">
          <div class="d-flex align-center">
            <v-icon start size="20" class="mr-2">
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
/* Base Styles */
.background-gradient {
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
  min-height: 100vh;
}

.top-bar {
  padding-top: env(safe-area-inset-top, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}

/* Add Button */
.add-btn {
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.add-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* Empty State Card */
.empty-state-card {
  background: white;
  transition: all 0.3s ease;
}

/* Product Card */
.product-col {
  transition: transform 0.2s ease;
}

.product-card {
  transition: all 0.3s ease;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* Product Image Wrapper */
.product-image-wrapper {
  position: relative;
  overflow: hidden;
}

.product-image {
  transition: transform 0.3s ease;
}

.product-card:hover .product-image {
  transform: scale(1.05);
}

/* Stock Badge */
.stock-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  backdrop-filter: blur(4px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stock-success {
  background: rgba(76, 175, 80, 0.9);
  color: white;
}

.stock-warning {
  background: rgba(255, 152, 0, 0.9);
  color: white;
}

.stock-error {
  background: rgba(244, 67, 54, 0.9);
  color: white;
}

/* Action Buttons Container - FIXED: Shows both buttons */
.action-buttons-container {
  display: flex;
  gap: 12px;
  width: 100%;
}

.edit-btn,
.delete-btn {
  flex: 1;
  transition: all 0.2s ease;
}

.edit-btn:hover,
.delete-btn:hover {
  transform: scale(1.02);
}

/* Utility Classes */
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gap-1 {
  gap: 4px;
}

.gap-3 {
  gap: 12px;
}

/* Mobile Adjustments */
@media (max-width: 768px) {
  .product-card {
    margin-bottom: 12px;
  }
  
  .stock-badge {
    padding: 3px 8px;
    font-size: 0.65rem;
  }
  
  .action-buttons-container {
    gap: 8px;
  }
  
  .edit-btn,
  .delete-btn {
    font-size: 0.7rem;
    padding: 0 8px;
  }
  
  .edit-btn .v-icon,
  .delete-btn .v-icon {
    font-size: 16px;
  }
}

/* Extra Small Devices - Stack buttons vertically if needed */
@media (max-width: 360px) {
  .action-buttons-container {
    flex-direction: column;
    gap: 8px;
  }

  
  .edit-btn,
  .delete-btn {
    width: 100%;
  }
}

/* Tablet Adjustments */
@media (min-width: 769px) and (max-width: 1024px) {
  .product-col {
    margin-bottom: 16px;
  }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .product-card,
  .product-image,
  .add-btn,
  .edit-btn,
  .delete-btn {
    transition: none;
  }
  
  .product-card:hover {
    transform: none;
  }
  
  .product-card:hover .product-image {
    transform: none;
  }
}
</style>