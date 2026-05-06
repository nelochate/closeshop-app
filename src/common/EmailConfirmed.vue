<template>
  <v-app class="email-confirmed-page">
    <v-main class="email-confirmed-main">
      <v-container class="email-confirmed-shell d-flex align-center justify-center" fluid>
        <v-card class="email-confirmed-card" rounded="xl" elevation="8" max-width="420">
          <v-card-text class="pa-6 pa-sm-8 text-center">
            <div class="email-confirmed-icon">
              <v-icon size="56" color="success">mdi-check-decagram</v-icon>
            </div>

            <h1 class="text-h5 font-weight-bold text-primary mt-4">Email Confirmed</h1>
            <p class="text-body-1 text-medium-emphasis mt-3">
              Your account has been verified successfully. You can now sign in and continue using
              CloseShop.
            </p>

            <div class="email-confirmed-next-step mt-6">
              <v-icon size="18" color="primary">mdi-cellphone-arrow-down</v-icon>
              <p class="text-body-2 text-medium-emphasis mb-0">
                If you already installed the CloseShop mobile app, open it now and sign in with
                your email and password.
              </p>
            </div>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.email-confirmed-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(63, 131, 199, 0.18), transparent 32%),
    linear-gradient(180deg, #eef4fb 0%, #f8fbff 100%);
}

.email-confirmed-main {
  min-height: 100vh;
}

.email-confirmed-shell {
  min-height: 100vh;
  padding:
    max(24px, env(safe-area-inset-top, 0px))
    max(16px, env(safe-area-inset-right, 0px))
    max(24px, env(safe-area-inset-bottom, 0px))
    max(16px, env(safe-area-inset-left, 0px));
}

.email-confirmed-card {
  width: 100%;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 22px 48px rgba(15, 23, 42, 0.1);
}

.email-confirmed-icon {
  width: 92px;
  height: 92px;
  margin: 0 auto;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(34, 197, 94, 0.14), rgba(34, 197, 94, 0.06));
}

.email-confirmed-next-step {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(46, 115, 184, 0.08);
  border: 1px solid rgba(46, 115, 184, 0.12);
  text-align: left;
}
</style>
