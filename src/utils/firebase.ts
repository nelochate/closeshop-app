// utils/firebase.ts

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getMessaging } from "firebase/messaging";

// ✅ Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyABKTVJWXTSg21msTX5xBAYUvUSdufFn9A",
  authDomain: "closeshop-dc7a7.firebaseapp.com",
  projectId: "closeshop-dc7a7",
  storageBucket: "closeshop-dc7a7.appspot.com", // ✅ FIXED
  messagingSenderId: "867069191023",
  appId: "1:867069191023:web:b3ba5f7b425fc57d5fbe9a",
  measurementId: "G-148YXKWW9G"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ Initialize services
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const messaging = getMessaging(app);

// ✅ Export them for use in your app
export { app, analytics, db, auth, messaging };
export default app;