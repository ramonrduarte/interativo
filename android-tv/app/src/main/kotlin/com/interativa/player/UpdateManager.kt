package com.interativa.player

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Atualização automática: consulta {servidor}/api/app/latest, baixa o .apk se houver
 * versão mais nova, confere o SHA-256 e instala pelo PackageInstaller.
 *
 * - App "proprietário do dispositivo" (device owner): instala em silêncio.
 * - Caso contrário: o Android mostra "Instalar?" e alguém confirma com o controle.
 * Depois de instalar, o BootReceiver (MY_PACKAGE_REPLACED) reabre o player.
 */
object UpdateManager {
    private const val TAG = "UpdateManager"
    private const val CHECK_EVERY_MS = 6 * 60 * 60 * 1000L
    private const val FIRST_CHECK_MS = 2 * 60 * 1000L

    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var busy = false
    @Volatile var lastStatus: String = "Ainda não verificado"
        private set

    private var scheduled = false

    /** Agenda verificações periódicas (a primeira 2 min após abrir o app). */
    fun schedule(ctx: Context) {
        if (scheduled) return
        scheduled = true
        val app = ctx.applicationContext
        val tick = object : Runnable {
            override fun run() {
                checkNow(app, manual = false)
                main.postDelayed(this, CHECK_EVERY_MS)
            }
        }
        main.postDelayed(tick, FIRST_CHECK_MS)
    }

    fun isDeviceOwner(ctx: Context): Boolean = runCatching {
        (ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager).isDeviceOwnerApp(ctx.packageName)
    }.getOrDefault(false)

    /** Android 8+: o app precisa da permissão "instalar apps desconhecidos" (exceto se for device owner). */
    fun canInstall(ctx: Context): Boolean = when {
        isDeviceOwner(ctx) -> true
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> ctx.packageManager.canRequestPackageInstalls()
        else -> true
    }

    fun requestInstallPermission(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        runCatching {
            ctx.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, android.net.Uri.parse("package:${ctx.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }

    fun checkNow(ctx: Context, manual: Boolean, onResult: ((String) -> Unit)? = null) {
        if (busy) { onResult?.invoke("Atualização já em andamento…"); return }
        val app = ctx.applicationContext
        val server = Prefs(app).serverUrl ?: return
        busy = true
        executor.execute {
            val msg = try {
                run(app, server)
            } catch (e: Exception) {
                Log.w(TAG, "Falha na atualização", e)
                "Erro ao atualizar: ${e.message}"
            } finally {
                busy = false
            }
            lastStatus = msg
            Log.i(TAG, msg)
            if (manual || onResult != null) main.post { onResult?.invoke(msg) }
        }
    }

    private fun run(app: Context, server: String): String {
        val conn = (URL("$server/api/app/latest").openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000; readTimeout = 10_000
        }
        if (conn.responseCode == 404) return "Nenhuma versão publicada no servidor"
        if (conn.responseCode != 200) return "Servidor respondeu ${conn.responseCode}"
        val info = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        val code = info.optInt("versionCode")
        val name = info.optString("versionName")
        if (code <= BuildConfig.VERSION_CODE) return "App atualizado (versão ${BuildConfig.VERSION_NAME})"
        if (!canInstall(app)) return "Versão $name disponível, mas falta permitir “Atualizar sozinho” em Configurar esta TV"

        val url = ConfigParser.absolutize(info.optString("url"), server) ?: return "Endereço do arquivo inválido"
        val apk = File(app.cacheDir, "update.apk")
        download(url, apk)
        val expected = info.optString("sha256").lowercase()
        val actual = sha256(apk)
        if (expected.isNotEmpty() && expected != actual) {
            apk.delete()
            return "Arquivo da versão $name corrompido no download — tentando de novo mais tarde"
        }
        install(app, apk)
        return "Instalando a versão $name…"
    }

    private fun download(url: String, dest: File) {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000; readTimeout = 60_000
        }
        if (conn.responseCode != 200) error("download respondeu ${conn.responseCode}")
        val tmp = File(dest.path + ".part")
        conn.inputStream.use { input -> tmp.outputStream().use { input.copyTo(it) } }
        tmp.renameTo(dest)
    }

    private fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    private fun install(app: Context, apk: File) {
        val installer = app.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(app.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            session.openWrite("app.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            val pi = PendingIntent.getBroadcast(app, 77, Intent(app, InstallResultReceiver::class.java), flags)
            session.commit(pi.intentSender)
        }
    }
}

/** Resultado da instalação. Se o Android pedir confirmação, abre a tela "Instalar?". */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { runCatching { context.startActivity(it) } }
            }
            PackageInstaller.STATUS_SUCCESS -> Log.i("UpdateManager", "Atualização instalada")
            else -> Log.w("UpdateManager", "Instalação falhou ($status): ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)}")
        }
    }
}
