<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const goBack = () => router.back()

// form state
const productName = ref('')
const description = ref('')
const price = ref<number | null>(null)
const stock = ref<number | null>(null)
const category = ref('')
const categories = ['Clothing', 'Food', 'Electronics', 'Accessories']

// sizes
const availableSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const selectedSizes = ref<string[]>([])

const productImage = ref<File | null>(null)

// handle file upload
const handleImageUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    productImage.value = target.files[0]
  }
}

// submit form
const submitForm = () => {
  console.log('Form submitted:', {
    productName: productName.value,
    description: description.value,
    price: price.value,
    stock: stock.value,
    category: category.value,
    sizes: selectedSizes.value, // ✅ store selected sizes
    image: productImage.value
  })

  // later: send to Supabase / backend
  router.push('/products') // redirect back after save
}
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6">Add Product</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <v-form @submit.prevent="submitForm" validate-on="input">
          <!-- Product Name -->
          <v-text-field
            v-model="productName"
            label="Product Name"
            variant="outlined"
            required
          />

          <!-- Description -->
          <v-textarea
            v-model="description"
            label="Description"
            variant="outlined"
            rows="3"
          />

          <!-- Price -->
          <v-text-field
            v-model="price"
            label="Price"
            type="number"
            prefix="₱"
            variant="outlined"
            required
          />

          <!-- Stock -->
          <v-text-field
            v-model="stock"
            label="Stock Quantity"
            type="number"
            variant="outlined"
          />

          <!-- Category -->
          <v-select
            v-model="category"
            :items="categories"
            label="Category"
            variant="outlined"
            required
          />

          <!-- Sizes -->
          <v-label class="mt-4 mb-2 font-medium">Available Sizes</v-label>
          <v-row>
            <v-col
              v-for="size in availableSizes"
              :key="size"
              cols="6"
              sm="4"
              md="2"
            >
              <v-checkbox
                v-model="selectedSizes"
                :label="size"
                :value="size"
                density="comfortable"
              />
            </v-col>
          </v-row>

          <!-- Image Upload -->
          <v-file-input
            label="Upload Product Image"
            accept="image/*"
            variant="outlined"
            prepend-icon="mdi-image"
            @change="handleImageUpload"
          />

          <!-- Submit -->
          <v-btn
            type="submit"
            color="primary"
            rounded="lg"
            prepend-icon="mdi-content-save"
            class="mt-4"
          >
            Save Product
          </v-btn>
        </v-form>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.font-medium {
  font-weight: 500;
}
</style>
