package com.dafunghub.admin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class OrderMonitorService : Service() {

    companion object {
        private const val TAG = "OrderMonitorService"
        private const val FOREGROUND_SERVICE_ID = 9001
        private const val CHANNEL_SERVICE = "dafung_monitor_service"
        private const val CHANNEL_ORDERS = "dafung-orders"
        private const val API_URL = "https://dafung-hub.vercel.app/api/admin/notifications"
        private const val ADMIN_KEY = "dafung-admin-2026"
    }

    private var isRunning = false
    private var monitorThread: Thread? = null
    private val seenOrderCodes = HashSet<String>()
    private var isInitialCheck = true

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForegroundService()

        if (!isRunning) {
            isRunning = true
            startMonitoringLoop()
        }

        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        monitorThread?.interrupt()
        super.onDestroy()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // 1. Silent ongoing service channel
            val serviceChannel = NotificationChannel(
                CHANNEL_SERVICE,
                "Layanan Background Dafung Hub",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notifikasi status background monitoring pesanan"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(serviceChannel)

            // 2. High priority order notification channel
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

    private fun startAsForegroundService() {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setContentTitle("Dafung Hub Admin Aktif")
            .setContentText("Memantau pesanan baru secara real-time ⚡")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                FOREGROUND_SERVICE_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(FOREGROUND_SERVICE_ID, notification)
        }
    }

    private fun startMonitoringLoop() {
        monitorThread = Thread {
            Log.i(TAG, "Background order monitoring thread started.")

            while (isRunning) {
                try {
                    pollOrders()
                } catch (e: Exception) {
                    Log.w(TAG, "Error polling orders: ${e.message}")
                }

                try {
                    Thread.sleep(5000)
                } catch (e: InterruptedException) {
                    break
                }
            }

            Log.i(TAG, "Background order monitoring thread stopped.")
        }.apply {
            isDaemon = true
            name = "DafungOrderMonitorThread"
            start()
        }
    }

    private fun pollOrders() {
        var conn: HttpURLConnection? = null
        try {
            val url = URL(API_URL)
            conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("x-admin-key", ADMIN_KEY)
            conn.setRequestProperty("Accept", "application/json")
            conn.connectTimeout = 6000
            conn.readTimeout = 6000

            val code = conn.responseCode
            if (code == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val sb = StringBuilder()
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    sb.append(line)
                }
                reader.close()

                val root = JSONObject(sb.toString())
                if (root.optBoolean("hasNewOrders", false)) {
                    val ordersArray = root.optJSONArray("newPaidOrders") ?: JSONArray()
                    val now = System.currentTimeMillis()

                    for (i in 0 until ordersArray.length()) {
                        val order = ordersArray.getJSONObject(i)
                        val orderCode = order.optString("orderCode", "")

                        if (orderCode.isNotEmpty()) {
                            if (!seenOrderCodes.contains(orderCode)) {
                                seenOrderCodes.add(orderCode)

                                if (isInitialCheck) {
                                    // If order was created in last 10 minutes, alert on service boot
                                    val createdAtStr = order.optString("createdAt", "")
                                    if (isWithinPastMinutes(createdAtStr, now, 10)) {
                                        triggerOrderNotification(order)
                                    }
                                } else {
                                    // New order detected while service is actively running!
                                    triggerOrderNotification(order)
                                }
                            }
                        }
                    }
                }
                isInitialCheck = false
            } else {
                Log.w(TAG, "Poll returned HTTP $code")
            }
        } finally {
            conn?.disconnect()
        }
    }

    private fun isWithinPastMinutes(dateStr: String, nowMs: Long, minutes: Int): Boolean {
        if (dateStr.isEmpty()) return false
        return try {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val cleanStr = if (dateStr.length >= 19) dateStr.substring(0, 19) else dateStr
            val date = sdf.parse(cleanStr)
            val diffMs = nowMs - (date?.time ?: 0L)
            diffMs < (minutes * 60 * 1000L)
        } catch (e: Exception) {
            true
        }
    }

    private fun triggerOrderNotification(order: JSONObject) {
        val orderCode = order.optString("orderCode", "PESANAN")
        val productName = order.optString("productName", "Produk Dafung Hub")
        val formattedPrice = order.optString("formattedPrice", "")
        
        val customerObj = order.optJSONObject("customer")
        val username = customerObj?.optString("username", "") ?: ""
        val firstName = customerObj?.optString("firstName", "") ?: ""
        val telegramId = customerObj?.optString("telegramId", "") ?: ""
        val customerDisplay = when {
            username.isNotEmpty() -> "@$username"
            firstName.isNotEmpty() -> firstName
            else -> telegramId
        }

        Log.i(TAG, "Triggering notification for order $orderCode: $productName from $customerDisplay")

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
            .setContentTitle("🔔 Pesanan Baru Masuk!")
            .setContentText("$productName ($formattedPrice) dari $customerDisplay")
            .setStyle(NotificationCompat.BigTextStyle().bigText("$productName ($formattedPrice) dari $customerDisplay\nKode: $orderCode"))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 500, 200, 500))
            .setLights(0xFF008CFF.toInt(), 500, 500)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(orderCode.hashCode(), notifBuilder.build())

        // Wake screen up if device is asleep
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            val wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "dafung:order_alert_wake"
            )
            wakeLock.acquire(3000)
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire wake lock: ${e.message}")
        }
    }
}
