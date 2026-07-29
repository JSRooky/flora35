const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

/** Firebase подключается только если заданы ключевые переменные окружения. */
export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let appPromise = null;

/** Ленивая инициализация — SDK не грузится, пока модуль не понадобится. */
export function getFirebaseApp() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured");
  }

  if (!appPromise) {
    appPromise = import("firebase/app").then(({ initializeApp, getApps }) => {
      if (getApps().length > 0) {
        return getApps()[0];
      }

      return initializeApp(firebaseConfig);
    });
  }

  return appPromise;
}
