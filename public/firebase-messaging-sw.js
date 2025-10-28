/* public/firebase-messaging-sw.js */
importScripts('https://www.gstatic.com/firebasejs/10.12.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyABKTVJWXTSg21msTX5xBAYUvUSdufFn9A",
  authDomain: "closeshop-dc7a7.firebaseapp.com",
  projectId: "closeshop-dc7a7",
  storageBucket: "closeshop-dc7a7.appspot.com",
  messagingSenderId: "867069191023",
  appId: "1:867069191023:web:b3ba5f7b425fc57d5fbe9a",
  measurementId: "G-148YXKWW9G"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png'
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
