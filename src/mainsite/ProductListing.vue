<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const goBack = () => router.back()

// sample product list (with varieties now)
const products = ref([
  {
    id: 1,
    name: 'Sample Product 1',
    price: 199,
    description: 'Description here',
    varieties: [
      { id: 1, name: 'Small', price: 149, image: '' },
      { id: 2, name: 'Large', price: 249, image: '' }
    ]
  },
  {
    id: 2,
    name: 'Sample Product 2',
    price: 299,
    description: 'Another description',
    varieties: []
  }
])

// delete product
const deleteProduct = (id: number) => {
  products.value = products.value.filter(p => p.id !== id)
}

// edit product
const editProduct = (id: number) => {
  router.push(`/products/edit/${id}`)
}

</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6">Product List</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <!-- Add Item Button -->
        <v-btn
          color="primary"
          rounded="lg"
          prepend-icon="mdi-plus"
          class="mb-6"
          @click="router.push('/additem')" 
        >
          Add New Item
        </v-btn>

        <!-- Product List -->
        <v-row>
          <v-col
            v-for="product in products"
            :key="product.id"
            cols="12"
            sm="6"
            md="4"
          >
            <v-card rounded="xl" elevation="3">
              <v-card-title class="text-h6">{{ product.name }}</v-card-title>
              <v-card-subtitle class="text-body-2">
                ₱{{ product.price }}
              </v-card-subtitle>
              <v-card-text class="text-body-2">
                {{ product.description }}
              </v-card-text>

              <v-card-actions>
                <v-btn color="blue" variant="text" @click="editProduct(product.id)">
                  <v-icon start>mdi-pencil</v-icon>Edit
                </v-btn>
                <v-btn color="red" variant="text" @click="deleteProduct(product.id)">
                  <v-icon start>mdi-delete</v-icon>Delete
                </v-btn>
              </v-card-actions>
            </v-card>

            
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.varieties {
  margin-top: 16px;
}
</style>
