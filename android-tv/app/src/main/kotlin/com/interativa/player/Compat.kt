package com.interativa.player

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast

/**
 * Ajustes para versões mais novas do Android.
 *
 * - Android 10+: apps em segundo plano não podem abrir telas sozinhos (abrir no boot,
 *   religar no horário, watchdog). A permissão "Sobrepor a outros apps" libera isso.
 * - Opção de ser a tela inicial (HOME) da box: a forma mais confiável de quiosque —
 *   o sistema sempre volta para o player, em qualquer versão.
 */
object Compat {

    fun needsOverlayPermission(ctx: Context): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !Settings.canDrawOverlays(ctx)

    fun requestOverlayPermission(ctx: Context) {
        val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            ctx.startActivity(intent)
        } catch (_: Exception) {
            // Algumas TVs (Android TV / Google TV) não têm essa tela de configuração
            Toast.makeText(
                ctx,
                "Esta TV não tem a tela de permissão. Libere pelo computador:\n" +
                    "adb shell appops set ${ctx.packageName} SYSTEM_ALERT_WINDOW allow",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    private fun homeAlias(ctx: Context) = ComponentName(ctx, "${ctx.packageName}.HomeAlias")

    fun isHomeLauncher(ctx: Context): Boolean =
        ctx.packageManager.getComponentEnabledSetting(homeAlias(ctx)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED

    fun setHomeLauncher(ctx: Context, enabled: Boolean) {
        ctx.packageManager.setComponentEnabledSetting(
            homeAlias(ctx),
            if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
        if (enabled) {
            // Abre o seletor de tela inicial para o usuário escolher "Interativa Player" → Sempre
            runCatching {
                ctx.startActivity(Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }.onFailure {
                Toast.makeText(ctx, "Aperte o botão Home do controle e escolha Interativa Player → Sempre", Toast.LENGTH_LONG).show()
            }
        }
    }
}
