<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useDisplay } from 'vuetify'
import { Capacitor } from '@capacitor/core'

const { smAndDown } = useDisplay()

const isMobile = Capacitor.isNativePlatform()
const countdown = ref(5)

let countdownInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  countdownInterval = setInterval(() => {
    if (countdown.value > 1) {
      countdown.value--
    } else if (countdownInterval) {
      clearInterval(countdownInterval)
    }
  }, 1000)
})

onBeforeUnmount(() => {
  if (countdownInterval) clearInterval(countdownInterval)
})
</script>

<template>
  <v-app>
    <v-main class="bg-gradient">
      <div class="page-wrapper">
        <v-container fluid class="pa-0 fill-height">
          <v-row
            class="fill-height ma-0"
            align="center"
            justify="center"
          >
            <v-col
              cols="12"
              sm="10"
              md="7"
              lg="5"
              xl="4"
              class="d-flex justify-center px-3 py-6"
            >
              <v-card class="success-card text-center">
                <div class="mb-5">
                  <!-- Success Icon -->
                  <div class="success-icon-wrapper">
                    <v-icon
                      color="success"
                      class="success-icon animate-bounce"
                      :size="smAndDown ? 64 : 82"
                    >
                      mdi-check-circle-outline
                    </v-icon>
                  </div>

                  <v-card-title class="title-text pa-0 mt-2">
                    Password Updated!
                  </v-card-title>

                  <v-card-subtitle class="subtitle-text mt-2 px-0">
                    Your password has been successfully changed
                  </v-card-subtitle>
                </div>

                <v-divider class="my-4"></v-divider>

                <!-- WEB -->
                <template v-if="!isMobile">
                  <v-alert type="success" variant="tonal" class="mb-4 text-left">
                    <v-icon start>mdi-check</v-icon>
                    Your password has been updated successfully.
                  </v-alert>

                  <div class="instruction-box">
                    <p class="section-title">
                      <v-icon size="18" color="primary" class="mr-1">
                        mdi-information
                      </v-icon>
                      What's next?
                    </p>

                    <ul class="instruction-list">
                      <li>Open your mobile app or website.</li>
                      <li>Log in using your new password.</li>
                    </ul>
                  </div>
                </template>

                <!-- MOBILE -->
                <template v-else>
                  <v-alert type="info" variant="tonal" class="mb-3 text-left">
                    <v-icon start>mdi-cellphone</v-icon>
                    Mobile App User
                  </v-alert>

                  <v-alert type="success" variant="tonal" class="mb-4 text-left">
                    <v-icon start>mdi-check-circle</v-icon>
                    Password updated successfully.
                  </v-alert>

                  <div class="instruction-box">
                    <p class="section-title">
                      <v-icon size="18" color="primary" class="mr-1">
                        mdi-shield-check
                      </v-icon>
                      Security Notice
                    </p>

                    <p class="body-text mb-2">
                      You have been signed out for security reasons.
                    </p>

                    <p class="body-text mb-0">
                      <v-icon size="16" color="warning" class="mr-1">
                        mdi-alert
                      </v-icon>
                      Sign in again using your new password.
                    </p>
                  </div>
                </template>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
      </div>
    </v-main>
  </v-app>
</template>

<style scoped>
/* BACKGROUND */
.bg-gradient {
  min-height: 100dvh;
  background: linear-gradient(135deg, #667eea 0%, #5048c2 100%);
}

/* FULL PAGE CENTER */
.page-wrapper {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    max(16px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
}

/* CARD */
.success-card {
  width: 100%;
  max-width: 520px;
  border-radius: 22px;
  padding: 28px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
  animation: slideUp 0.45s ease;
}

/* TEXT */
.title-text {
  font-size: clamp(1.45rem, 4vw, 2rem);
  font-weight: 700;
  line-height: 1.2;
  justify-content: center;
}

.subtitle-text {
  font-size: clamp(0.92rem, 2vw, 1rem);
  line-height: 1.5;
  white-space: normal;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}

.body-text {
  font-size: 0.92rem;
  line-height: 1.5;
}

.instruction-list {
  padding-left: 20px;
  margin: 0;
}

.instruction-list li {
  margin-bottom: 8px;
  line-height: 1.45;
  word-break: break-word;
}

/* BOX */
.instruction-box {
  background: #f7f7f7;
  border-left: 4px solid #4caf50;
  border-radius: 12px;
  padding: 16px;
  text-align: left;
}

/* ICON */
.success-icon-wrapper {
  margin-bottom: 10px;
}

.success-icon {
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.12));
}

/* ANIMATION */
.animate-bounce {
  animation: bounce 0.6s ease;
}

@keyframes bounce {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.18);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(22px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* MOBILE */
@media (max-width: 600px) {
  .success-card {
    padding: 22px 18px;
    border-radius: 18px;
  }

  .instruction-box {
    padding: 14px;
  }

  .body-text,
  .instruction-list li {
    font-size: 0.88rem;
  }
}

/* EXTRA SMALL DEVICES */
@media (max-width: 360px) {
  .success-card {
    padding: 18px 14px;
    border-radius: 16px;
  }

  .title-text {
    font-size: 1.3rem;
  }

  .subtitle-text,
  .body-text,
  .instruction-list li {
    font-size: 0.82rem;
  }

  .instruction-list {
    padding-left: 16px;
  }
}

/* LANDSCAPE MOBILE */
@media (max-height: 500px) and (orientation: landscape) {
  .page-wrapper {
    align-items: flex-start;
    padding-top: 20px;
    padding-bottom: 20px;
  }

  .success-card {
    margin: auto;
  }
}
</style>