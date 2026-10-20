package com.interativa.player.power

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log
import com.interativa.player.ConfigStore
import com.interativa.player.MainActivity

/**
 * Liga/desliga por horário.
 *
 * "Desligar" = parar o conteúdo, apagar a tela e deixar a box dormir (DevicePolicyManager.lockNow,
 * que exige o app como administrador do dispositivo). Se a TV tiver HDMI-CEC ativo, ela costuma
 * entrar em standby junto. Sem permissão de administrador, a tela fica preta (modo "apagado").
 *
 * "Ligar" = alarme exato (RTC_WAKEUP) acorda a box e reabre o player.
 */
object PowerController {
    private const val TAG = "PowerController"
    private const val REQ_ALARM = 42

    fun adminComponent(ctx: Context) = ComponentName(ctx, AdminReceiver::class.java)

    private fun dpm(ctx: Context) = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    fun isAdmin(ctx: Context): Boolean = runCatching { dpm(ctx).isAdminActive(adminComponent(ctx)) }.getOrDefault(false)

    private var cpuLock: PowerManager.WakeLock? = null

    /**
     * Apaga a tela. Antes, segura o processador acordado (PARTIAL_WAKE_LOCK): boxes Amlogic em
     * sono profundo só acordam pelo controle remoto — com a CPU ativa o próprio app religa a tela
     * no horário. Retorna false se não tiver permissão de administrador (fica só a tela preta).
     */
    fun sleep(ctx: Context): Boolean {
        if (!isAdmin(ctx)) return false
        holdCpu(ctx)
        return runCatching { dpm(ctx).lockNow(); true }
            .onFailure { Log.w(TAG, "lockNow falhou", it) }
            .getOrDefault(false)
    }

    private fun holdCpu(ctx: Context) {
        if (cpuLock?.isHeld == true) return
        val pm = ctx.applicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        cpuLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Interativa:Standby").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    fun releaseCpu() {
        cpuLock?.let { if (it.isHeld) it.release() }
        cpuLock = null
    }

    fun isScreenOn(ctx: Context): Boolean =
        (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive

    /** Acorda a tela e traz o player para frente. */
    @Suppress("DEPRECATION")
    fun wake(ctx: Context) {
        runCatching {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "Interativa:Wake",
            ).acquire(15_000)
        }
        ctx.startActivity(
            Intent(ctx, MainActivity::class.java)
                .setAction(MainActivity.ACTION_WAKE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
        )
    }

    /** Agenda (ou cancela) o alarme da próxima troca ligado/desligado. */
    fun scheduleNext(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = alarmIntent(ctx)
        val next = ConfigStore.nextPowerChange(ctx)
        if (next == null) {
            am.cancel(pi)
            return
        }
        // +2 s para cair com folga dentro do novo minuto
        val at = next + 2_000
        try {
            when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms() ->
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ->
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
                else -> am.setExact(AlarmManager.RTC_WAKEUP, at, pi)
            }
        } catch (e: SecurityException) {
            am.set(AlarmManager.RTC_WAKEUP, at, pi)
        }
        Log.i(TAG, "Próxima troca de energia agendada para ${java.util.Date(at)}")
    }

    private fun alarmIntent(ctx: Context): PendingIntent {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        return PendingIntent.getBroadcast(ctx, REQ_ALARM, Intent(ctx, PowerAlarmReceiver::class.java), flags)
    }
}
