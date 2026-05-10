<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(
  defineProps<{
    title: string
    value: string | number
    subtitle?: string
    icon: string
    tone?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'secondary'
    to?: RouteLocationRaw
  }>(),
  {
    subtitle: '',
    tone: 'primary',
    to: undefined,
  },
)
</script>

<template>
  <v-card
    class="seller-summary-tile"
    :class="{ 'seller-summary-tile--clickable': !!props.to }"
    rounded="xl"
    variant="flat"
    :to="props.to"
    :link="!!props.to"
  >
    <v-card-text class="pa-4">
      <div class="seller-summary-tile__top">
        <span class="seller-summary-tile__icon" :class="`seller-summary-tile__icon--${props.tone}`">
          <v-icon size="18">{{ props.icon }}</v-icon>
        </span>
        <v-icon v-if="props.to" size="18" class="seller-summary-tile__chevron">mdi-chevron-right</v-icon>
      </div>

      <strong class="seller-summary-tile__value">{{ props.value }}</strong>
      <span class="seller-summary-tile__title">{{ props.title }}</span>
      <span v-if="props.subtitle" class="seller-summary-tile__subtitle">{{ props.subtitle }}</span>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.seller-summary-tile {
  height: 100%;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.seller-summary-tile--clickable:hover {
  transform: translateY(-2px);
  border-color: rgba(59, 130, 246, 0.22);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.09);
}

.seller-summary-tile__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 10px;
}

.seller-summary-tile__icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.seller-summary-tile__icon--primary {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.seller-summary-tile__icon--success {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.seller-summary-tile__icon--warning {
  background: rgba(245, 158, 11, 0.16);
  color: #d97706;
}

.seller-summary-tile__icon--error {
  background: rgba(239, 68, 68, 0.14);
  color: #dc2626;
}

.seller-summary-tile__icon--info {
  background: rgba(14, 165, 233, 0.14);
  color: #0284c7;
}

.seller-summary-tile__icon--secondary {
  background: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
}

.seller-summary-tile__value {
  display: block;
  color: #0f172a;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.seller-summary-tile__title {
  display: block;
  margin-top: 8px;
  color: #0f172a;
  font-size: 0.88rem;
  font-weight: 700;
}

.seller-summary-tile__subtitle {
  display: block;
  margin-top: 6px;
  color: #64748b;
  font-size: 0.78rem;
  line-height: 1.45;
}

.seller-summary-tile__chevron {
  color: #94a3b8;
}
</style>
