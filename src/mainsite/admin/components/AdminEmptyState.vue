<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    icon: string
    title: string
    description: string
    actionLabel?: string
  }>(),
  {
    actionLabel: '',
  },
)

const emit = defineEmits<{
  (e: 'action'): void
}>()
</script>

<template>
  <v-card class="admin-empty-state" rounded="xl" variant="flat">
    <v-card-text class="text-center py-10 px-6">
      <v-icon :icon="props.icon" size="54" color="primary" />
      <h3 class="admin-empty-state__title">{{ props.title }}</h3>
      <p class="admin-empty-state__description">{{ props.description }}</p>
      <v-btn
        v-if="props.actionLabel"
        color="primary"
        rounded="lg"
        class="mt-4"
        @click="emit('action')"
      >
        {{ props.actionLabel }}
      </v-btn>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.admin-empty-state {
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
}

.admin-empty-state__title {
  margin: 16px 0 8px;
  color: #0f172a;
  font-size: 1.06rem;
  font-weight: 800;
}

.admin-empty-state__description {
  margin: 0;
  color: #64748b;
  line-height: 1.65;
}
</style>
