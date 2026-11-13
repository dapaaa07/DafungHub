package com.dafunghub.admin

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import android.content.Intent
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)

    try {
      DafungFirebaseMessagingService.createNotificationChannel(this)
    } catch (e: Exception) {
      // Ignore channel creation errors
    }

    try {
      val handler = android.os.Handler(android.os.Looper.getMainLooper())
      fun fetchToken(attempt: Int) {
        FirebaseMessaging.getInstance().token
          .addOnCompleteListener { task: com.google.android.gms.tasks.Task<String> ->
            if (task.isSuccessful) {
              val fcmToken = task.result
              android.util.Log.i("DafungFCM", "Native FCM Token SUCCESS: $fcmToken")
              DafungFirebaseMessagingService.registerTokenToServer(fcmToken)
            } else {
              android.util.Log.w("DafungFCM", "Token attempt $attempt failed: ${task.exception?.message}")
              if (attempt < 5) {
                handler.postDelayed({ fetchToken(attempt + 1) }, (attempt * 4000).toLong())
              }
            }
          }
      }
      // Delay initial attempt by 4 seconds so Google Play Services IPC is ready
      handler.postDelayed({ fetchToken(1) }, 4000)
    } catch (e: Exception) {
      android.util.Log.e("DafungFCM", "Exception setting up token fetch: ${e.message}", e)
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
