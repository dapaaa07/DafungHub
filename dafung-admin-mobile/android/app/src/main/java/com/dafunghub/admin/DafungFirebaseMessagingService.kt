package com.dafunghub.admin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.net.HttpURLConnection
import java.net.URL

class DafungFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "DafungFCMService"
        private const val CHANNEL_ORDERS = "dafung-orders"

        fun registerTokenToServer(token: String) {
            Thread {
                try {
                    val url = URL("https://dafung-hub.vercel.app/api/admin/notifications")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("x-admin-key", "dafung-admin-2026")
                    conn.doOutput = true
                    val payload = "{\"token\":\"$token\"}"
                    conn.outputStream.use { it.write(payload.toByteArray()) }
                    val code = conn.responseCode
                    Log.i(TAG, "Token successfully registered to server: HTTP $code ($token)")
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to send token to server: ${e.message}")
                }
            }.start()
        }
        fun createNotificationChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                val orderChannel = NotificationChannel(
                    CHANNEL_ORDERS,
                    "Pesanan Baru Dafung Hub",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Notifikasi pesanan baru masuk secara real-time"
                    enableLights(true)
                    lightColor = 0xFF008CFF.toInt()
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 500, 200, 500)
                    setSound(
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                        Notification.AUDIO_ATTRIBUTES_DEFAULT
                    )
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setShowBadge(true)
                }
                notificationManager.createNotificationChannel(orderChannel)
            }
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "onNewToken received from Google Play Services: $token")
        registerTokenToServer(token)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.i(TAG, "onMessageReceived from FCM: ${remoteMessage.data}")

        val title = remoteMessage.notification?.title ?: remoteMessage.data["title"] ?: "🔔 Pesanan Baru Masuk!"
        val body = remoteMessage.notification?.body ?: remoteMessage.data["body"] ?: "Ada pesanan baru di Dafung Hub"
        val orderCode = remoteMessage.data["orderCode"] ?: "PESANAN"

        showNotification(title, body, orderCode)
    }

    private fun showNotification(title: String, body: String, orderCode: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createNotificationChannel(this)

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("orderCode", orderCode)
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            orderCode.hashCode(),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val notifBuilder = NotificationCompat.Builder(this, CHANNEL_ORDERS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 500, 200, 500))
            .setLights(0xFF008CFF.toInt(), 500, 500)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        notificationManager.notify(orderCode.hashCode(), notifBuilder.build())

        // Wake screen up if asleep
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            val wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "dafung:fcm_alert_wake"
            )
            wakeLock.acquire(3000)
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire wake lock: ${e.message}")
        }
    }
}
