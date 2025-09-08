<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '@/utils/supabase';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useGeolocation } from '@/composables/useGeolocation'


const router = useRouter();
const avatarUrl = ref<string | null>(null);
const uploading = ref(false);
const showPicker = ref(false);

const businessName = ref('');
const aboutUs = ref('');
const openTime = ref('');
const closeTime = ref('');
const address = {
  building: ref(''),
  street: ref(''),
  purok: ref(''),
  subdivision: ref(''),
  barangay: ref(''),
  city: ref(''),
  province: ref(''),
  region: ref(''),
  postal: ref('')
};

const goBack = () => router.back();

const loadProfile = async () => {
  const { data, error } = await supabase.from('profiles').select('avatar_url').single();
  if (!error) avatarUrl.value = data?.avatar_url || null;
};

const uploadAvatar = async (file: Blob) => {
  try {
    uploading.value = true;
    const fileName = `${Date.now()}.jpeg`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', (await supabase.auth.getUser()).data.user?.id);
    if (updateError) throw updateError;

    avatarUrl.value = publicUrl;
  } catch (err) {
    console.error('Upload error:', err);
  } finally {
    uploading.value = false;
  }
};

const pickImage = async (source: 'camera' | 'gallery') => {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: true,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    });

    if (photo.webPath) {
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      await uploadAvatar(blob);
    }
  } catch (err) {
    console.error('Error picking image:', err);
  } finally {
    showPicker.value = false;
  }
};

onMounted(loadProfile);
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat elevation="0" color="transparent">
      <v-btn variant="text" @click="goBack">
        <v-icon start>mdi-arrow-left</v-icon>
        Back
      </v-btn>
    </v-app-bar>

    <v-divider />

    <v-main>
      <!-- Business Info -->
      <h2 class="section-title">Business Information</h2>
      <div class="avatar-container">
        <v-avatar size="80" color="grey-lighten-3">
          <v-img v-if="avatarUrl" :src="avatarUrl" cover />
          <v-icon v-else size="60">mdi-store</v-icon>
        </v-avatar>
        <v-btn
          class="edit-btn"
          color="primary"
          icon
          elevation="4"
          :loading="uploading"
          @click="showPicker = true"
        >
          <v-icon>mdi-camera</v-icon>
        </v-btn>
      </div>

      <v-text-field
        v-model="businessName"
        label="Business Name"
        placeholder="Enter your business name"
        :rules="[
          v => !!v || 'Business name is required',
          v => (v && v.length >= 3) || 'At least 3 characters'
        ]"
        clearable
        outlined
        color="primary"
        prepend-inner-icon="mdi-store"
        hint="This is your business's official name"
        persistent-hint
      />

      <v-textarea
        v-model="aboutUs"
        label="About Us"
        placeholder="Write something about your business"
        outlined
        auto-grow
      />

      <!-- Operating Hours -->
      <h2 class="section-title">Operating Hours</h2>
      <v-row>
        <v-col cols="6">
          <v-text-field
            v-model="openTime"
            label="Opening Time"
            type="time"
            outlined
          />
        </v-col>
        <v-col cols="6">
          <v-text-field
            v-model="closeTime"
            label="Closing Time"
            type="time"
            outlined
          />
        </v-col>
      </v-row>

      <!-- Address Section -->
      <h2 class="section-title">Address</h2>
      <v-text-field v-model="address.building.value" label="Building Name" placeholder="Enter here" outlined />
      <v-text-field v-model="address.street.value" label="Street Name" placeholder="Enter here" outlined />
      <v-text-field v-model="address.purok.value" label="Purok / Block / Lot No." placeholder="Enter here" outlined />
      <v-text-field v-model="address.subdivision.value" label="Subdivision / Village / Compound" placeholder="Enter here" outlined />
      <v-text-field v-model="address.barangay.value" label="Barangay" placeholder="Enter here" outlined />
      <v-text-field v-model="address.city.value" label="City / Municipality" placeholder="Enter here" outlined />
      <v-text-field v-model="address.province.value" label="Province" placeholder="Enter here" outlined />
      <v-text-field v-model="address.region.value" label="Region" placeholder="Enter here" outlined />
      <v-text-field v-model="address.postal.value" label="Postal / ZIP Code" placeholder="Enter here" outlined />

      <!-- Map -->
      <div id="map" class="map-placeholder">[Map Placeholder]</div>

      <!-- Action Buttons -->
      <div class="btns">
        <v-btn color="error" class="shop-btn">Delete Shop</v-btn>
        <v-btn color="secondary" class="shop-btn" @click="goBack">Back</v-btn>
        <v-btn color="primary" class="shop-btn">Save</v-btn>
      </div>

      <!-- Image Picker Dialog -->
      <v-dialog v-model="showPicker" max-width="290">
        <v-card>
          <v-card-title class="headline">Pick Image Source</v-card-title>
          <v-card-actions>
            <v-btn @click="pickImage('camera')" color="primary">Use Camera</v-btn>
            <v-btn @click="pickImage('gallery')" color="primary">Use Gallery</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
.section-title {
  margin-top: 20px;
  margin-bottom: 10px;
  font-weight: 600;
}

.avatar-container {
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  margin: 16px 0;
}

.edit-btn {
  position: absolute;
  bottom: -10px;
  right: -10px;
  border-radius: 50%;
}

.map-placeholder {
  margin-top: 16px;
  height: 200px;
  background: #f0f0f0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  font-size: 14px;
}

.btns {
  display: flex;
  justify-content: space-between;
  margin: 20px 0;
}
</style>
