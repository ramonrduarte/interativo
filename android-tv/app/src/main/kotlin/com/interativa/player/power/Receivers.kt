package com.interativa.player.power

import android.app.admin.DeviceAdminReceiver
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.interativa.player.ConfigStore
import com.interativa.player.MainActivity

/** Abre o player quando a box liga (ou depois de uma atualização do app). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val valid = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.LOCKED_BOOT_COMPLETED",
            Intent.ACTION_MY_PACKAGE_REPLACED,
        )
        if (intent.action !in valid) return
        PowerController.scheduleNext(context)
        WatchdogService.start(context)
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

/** Disparado no horário de ligar/desligar. */
class PowerAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        PowerController.scheduleNext(context)
        if (ConfigStore.shouldBeOnNow(context)) {
            PowerController.wake(context)
        } else {
            context.startActivity(
                Intent(context, MainActivity::class.java)
                    .setAction(MainActivity.ACTION_POWER_CHECK)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            )
        }
    }
}

/** Administrador do dispositivo — usado apenas para apagar a tela (force-lock). */
class AdminReceiver : DeviceAdminReceiver()
