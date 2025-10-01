<template>
  <v-container
    class="d-flex flex-column align-center justify-center fill-height px-4"
  >
    <v-card class="pa-6 rounded-xl elevation-3 text-center" max-width="400">
      <v-card-title class="text-h6 font-weight-bold text-primary">
        Registration Successful
      </v-card-title>
      <v-divider class="my-3" />
      <v-card-text class="text-body-1 text-grey-darken-1">
        Please check your email to confirm your account before logging in.
      </v-card-text>
      <v-card-actions class="justify-center mt-4">
        <v-btn
          block
          rounded="lg"
          color="#2e73b8"
          variant="flat"
          class="text-white"
          to="/"
        >
          Go to Login
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<style scoped>
.text-primary {
  color: #2e73b8;
}
.v-card {
  width: 100%;
}
</style>
