<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    source: string | null
  }>(),
  {
    source: null,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const closeDialog = () => emit('update:modelValue', false)
</script>

<template>
  <v-dialog
    :model-value="props.modelValue"
    max-width="920"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="xl">
      <v-card-title class="d-flex align-center px-5 py-4">
        <v-icon color="primary" class="mr-3">mdi-image-outline</v-icon>
        <span class="text-subtitle-1 font-weight-bold">{{ props.title }}</span>
        <v-spacer />
        <v-btn icon size="small" @click="closeDialog">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text class="px-5 py-5">
        <v-img
          v-if="props.source"
          :src="props.source"
          max-height="560"
          contain
          class="rounded-xl preview-image"
        >
          <template #placeholder>
            <div class="preview-image__placeholder">
              <v-progress-circular indeterminate color="primary" />
            </div>
          </template>
        </v-img>

        <div v-else class="preview-image__missing">
          Preview unavailable.
        </div>
      </v-card-text>

      <v-card-actions class="px-5 pb-5">
        <v-btn color="primary" rounded="lg" block @click="closeDialog">
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.preview-image {
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.preview-image__placeholder,
.preview-image__missing {
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image__missing {
  color: #64748b;
}
</style>
