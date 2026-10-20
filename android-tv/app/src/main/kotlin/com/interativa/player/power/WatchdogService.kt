package com.interativa.player.power

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import com.interativa.player.ConfigStore
import com.interativa.player.MainActivity
import com.interativa.player.Prefs

/**
 * Mantém o player aberto: se ele sumir (crash, sistema matou, alguém abriu outro app)
 * por mais de ~1 minuto, reabre. Não reabre fora do horário de funcionamento
 * nem enquanto a TV ainda não foi pareada (para não atrapalhar quem está configurando a box).
 */
class WatchdogService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private var missedChecks = 0

    companion object {
        private const val CHANNEL_ID = "interativa_watchdog"
        private const val NOTIFICATION_ID = 1
        private const val CHECK_INTERVAL = 30_000L

        fun start(ctx: Context) {
            val i = Intent(ctx, WatchdogService::class.java)
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i) else ctx.startService(i)
            }
        }
    }

    override fun onBind(intent: Intent?) = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        handler.postDelayed(::check, CHECK_INTERVAL)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    private fun check() {
        val shouldRun = Prefs(this).isPaired && ConfigStore.shouldBeOnNow(this)
        if (MainActivity.isAlive || !shouldRun) {
            missedChecks = 0
        } else if (++missedChecks >= 2) {
            missedChecks = 0
            startActivity(
                Intent(this, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            )
        }
        handler.postDelayed(::check, CHECK_INTERVAL)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Interativa Player", NotificationManager.IMPORTANCE_MIN).apply {
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        val content = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), flags)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Interativa Player")
            .setContentText("Em execução")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(content)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
        // Se o sistema matar o serviço, volta em 3 s
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        val pi = PendingIntent.getService(this, 1, Intent(this, WatchdogService::class.java), flags)
        (getSystemService(Context.ALARM_SERVICE) as AlarmManager)
            .set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 3_000L, pi)
    }
}
