<script setup>
import { onMounted } from 'vue'
import { useCartStore } from '@/stores/cart'

const cart = useCartStore()

onMounted(() => {
  cart.init()   // ✅ load cart once
})
</script>


<template>
<RouterView/>
</template>
