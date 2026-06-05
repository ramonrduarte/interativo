package com.interativa.tv

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.*
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the app alive.
 *
 * Every CHECK_INTERVAL seconds it verifies whether MainActivity is still active.
 * If not (crash, kill by system, memory pressure), it relaunches the activity.
 *
 * START_STICKY ensures Android restarts the service automatically after it's killed.
 * onDestroy schedules an AlarmManager fallback in case START_STICKY isn't honoured
 * (some manufacturers ignore it on aggressive battery optimization modes).
 */
class WatchdogService : Service() {

    private val handler = Handler(Looper.getMainLooper())

    companion object {
        private const val CHANNEL_ID      = "interativa_watchdog"
        private const val NOTIFICATION_ID = 1
        private const val CHECK_INTERVAL  = 30_000L  // 30 s

        /** Set by MainActivity.onResume / onPause / onDestroy */
        @Volatile var isMainActivityAlive = false
    }

    override fun onBind(intent: Intent?) = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        scheduleCheck()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    private fun scheduleCheck() {
        handler.postDelayed({
            if (!isMainActivityAlive) {
                startActivity(
                    Intent(this, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                    }
                )
            }
            scheduleCheck()
        }, CHECK_INTERVAL)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Interativa TV",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            PendingIntent.FLAG_IMMUTABLE else 0

        val contentIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), flags
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Interativa TV")
            .setContentText("Em execução")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(contentIntent)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)

        // AlarmManager fallback: restarts the service even if START_STICKY is ignored
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            PendingIntent.FLAG_IMMUTABLE else 0
        val pi = PendingIntent.getService(
            this, 1, Intent(this, WatchdogService::class.java), flags
        )
        (getSystemService(Context.ALARM_SERVICE) as AlarmManager).set(
            AlarmManager.ELAPSED_REALTIME,
            SystemClock.elapsedRealtime() + 3_000L,
            pi
        )
    }
}
