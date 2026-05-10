<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(
  defineProps<{
    title: string
    value: string | number
    caption?: string
    icon: string
    tone?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'secondary'
    to?: RouteLocationRaw
    badge?: string
  }>(),
  {
    caption: '',
    tone: 'primary',
    to: undefined,
    badge: '',
  },
)
</script>

<template>
  <v-card
    class="admin-stat-card"
    :class="{ 'admin-stat-card--link': !!props.to }"
    rounded="xl"
    variant="flat"
    :to="props.to"
    :link="!!props.to"
  >
    <v-card-text class="pa-4">
      <div class="admin-stat-card__top">
        <div class="admin-stat-card__copy">
          <p class="admin-stat-card__label">{{ props.title }}</p>
          <h3 class="admin-stat-card__value">{{ props.value }}</h3>
        </div>
        <div class="admin-stat-card__icon" :class="`admin-stat-card__icon--${props.tone}`">
          <v-icon>{{ props.icon }}</v-icon>
        </div>
      </div>

      <div class="admin-stat-card__footer">
        <p class="admin-stat-card__caption">{{ props.caption }}</p>
        <v-chip v-if="props.badge" size="x-small" color="primary" variant="tonal">
          {{ props.badge }}
        </v-chip>
        <v-icon v-else-if="props.to" size="18" class="admin-stat-card__chevron">mdi-chevron-right</v-icon>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.admin-stat-card {
  height: 100%;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.admin-stat-card--link:hover {
  transform: translateY(-2px);
  border-color: rgba(37, 99, 235, 0.24);
  box-shadow: 0 18px 34px rgba(37, 99, 235, 0.12);
}

.admin-stat-card :deep(.v-card-text) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.admin-stat-card__top,
.admin-stat-card__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.admin-stat-card__copy {
  min-width: 0;
}

.admin-stat-card__label {
  margin: 0;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.admin-stat-card__value {
  margin: 8px 0 0;
  color: #0f172a;
  font-size: clamp(1.12rem, 3vw, 1.72rem);
  line-height: 1.08;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.admin-stat-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.admin-stat-card__icon :deep(.v-icon) {
  font-size: 22px;
}

.admin-stat-card__icon--primary {
  color: #2563eb;
  background: rgba(59, 130, 246, 0.12);
}

.admin-stat-card__icon--success {
  color: #059669;
  background: rgba(16, 185, 129, 0.14);
}

.admin-stat-card__icon--warning {
  color: #d97706;
  background: rgba(245, 158, 11, 0.16);
}

.admin-stat-card__icon--error {
  color: #dc2626;
  background: rgba(239, 68, 68, 0.14);
}

.admin-stat-card__icon--info {
  color: #0284c7;
  background: rgba(14, 165, 233, 0.14);
}

.admin-stat-card__icon--secondary {
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.12);
}

.admin-stat-card__footer {
  margin-top: auto;
  align-items: center;
  padding-top: 14px;
}

.admin-stat-card__caption {
  margin: 0;
  color: #475569;
  font-size: 0.84rem;
  line-height: 1.45;
}

.admin-stat-card__chevron {
  color: #94a3b8;
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .admin-stat-card__icon {
    width: 40px;
    height: 40px;
    border-radius: 14px;
  }

  .admin-stat-card__icon :deep(.v-icon) {
    font-size: 19px;
  }

  .admin-stat-card__value {
    font-size: clamp(1rem, 4.4vw, 1.36rem);
  }
}
</style>
