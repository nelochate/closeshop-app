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
  }>(),
  {
    caption: '',
    tone: 'primary',
    to: undefined,
  },
)
</script>

<template>
  <v-card
    class="seller-metric-card"
    :class="{ 'seller-metric-card--clickable': !!props.to }"
    rounded="xl"
    variant="flat"
    :to="props.to"
    :link="!!props.to"
  >
    <v-card-text class="pa-4">
      <div class="seller-metric-card__top">
        <div>
          <p class="seller-metric-card__label">{{ props.title }}</p>
          <h3 class="seller-metric-card__value">{{ props.value }}</h3>
        </div>
        <div class="seller-metric-card__icon" :class="`seller-metric-card__icon--${props.tone}`">
          <v-icon>{{ props.icon }}</v-icon>
        </div>
      </div>

      <div class="seller-metric-card__footer">
        <p class="seller-metric-card__caption">{{ props.caption }}</p>
        <v-icon v-if="props.to" size="18" class="seller-metric-card__chevron">mdi-chevron-right</v-icon>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.seller-metric-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 auto;
  height: 100%;
  min-height: 148px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.seller-metric-card--clickable:hover {
  transform: translateY(-2px);
  border-color: rgba(59, 130, 246, 0.22);
  box-shadow: 0 18px 34px rgba(15, 23, 42, 0.12);
}

.seller-metric-card__top,
.seller-metric-card__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.seller-metric-card__label {
  margin: 0;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.seller-metric-card__value {
  margin: 8px 0 0;
  color: #0f172a;
  font-size: clamp(1.1rem, 4vw, 1.75rem);
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.seller-metric-card__icon {
  width: 46px;
  height: 46px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.seller-metric-card__icon :deep(.v-icon) {
  font-size: 22px;
}

.seller-metric-card__icon--primary {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.seller-metric-card__icon--success {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.seller-metric-card__icon--warning {
  background: rgba(245, 158, 11, 0.16);
  color: #d97706;
}

.seller-metric-card__icon--error {
  background: rgba(239, 68, 68, 0.14);
  color: #dc2626;
}

.seller-metric-card__icon--info {
  background: rgba(14, 165, 233, 0.14);
  color: #0284c7;
}

.seller-metric-card__icon--secondary {
  background: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
}

.seller-metric-card__footer {
  margin-top: auto;
  padding-top: 14px;
  align-items: center;
}

.seller-metric-card__caption {
  margin: 0;
  color: #475569;
  font-size: 0.86rem;
  line-height: 1.4;
}

.seller-metric-card__chevron {
  color: #94a3b8;
  flex-shrink: 0;
  margin-top: 2px;
}

.seller-metric-card :deep(.v-card-text) {
  display: flex;
  flex: 1;
  flex-direction: column;
}

@media (max-width: 768px) {
  .seller-metric-card {
    min-height: 136px;
  }

  .seller-metric-card :deep(.v-card-text) {
    padding: 14px;
  }

  .seller-metric-card__top,
  .seller-metric-card__footer {
    gap: 10px;
  }

  .seller-metric-card__label {
    font-size: 0.68rem;
    letter-spacing: 0.05em;
  }

  .seller-metric-card__value {
    font-size: clamp(0.98rem, 4.5vw, 1.28rem);
  }

  .seller-metric-card__icon {
    width: 38px;
    height: 38px;
    border-radius: 14px;
  }

  .seller-metric-card__icon :deep(.v-icon) {
    font-size: 18px;
  }

  .seller-metric-card__caption {
    font-size: 0.78rem;
    line-height: 1.35;
  }
}

@media (max-width: 375px) {
  .seller-metric-card {
    min-height: 128px;
  }

  .seller-metric-card__caption {
    font-size: 0.74rem;
  }

  .seller-metric-card__chevron {
    display: none;
  }
}
</style>
