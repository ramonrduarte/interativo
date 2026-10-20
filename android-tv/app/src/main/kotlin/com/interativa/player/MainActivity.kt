package com.interativa.player

import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.interativa.player.power.PowerController
import com.interativa.player.power.WatchdogService
import com.interativa.player.ui.SetupScreens
import com.interativa.player.ui.SignageView
import com.interativa.player.ui.StandbyView
import com.interativa.player.ui.matchParent
import com.interativa.player.ui.removeFromParent
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity(), TvSocket.Listener {

    companion object {
        const val ACTION_WAKE = "com.interativa.player.WAKE"
        const val ACTION_POWER_CHECK = "com.interativa.player.POWER_CHECK"

        /** Lido pelo WatchdogService. */
        @Volatile var isAlive = false

        private const val CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sem 0/O/I/1
        private const val MANUAL_ON_MS = 2 * 60 * 60 * 1000L
        private const val TEST_OFF_MS = 60 * 1000L
    }

    private enum class Mode { SETUP_HOME, SETUP, PAIRING, SIGNAGE }

    private lateinit var prefs: Prefs
    private lateinit var root: FrameLayout
    private val main = Handler(Looper.getMainLooper())

    private var mode = Mode.SETUP_HOME
    private var signage: SignageView? = null
    private var standbyView: StandbyView? = null
    private var standby = false
    private var socket: TvSocket? = null
    private var pairing: PairingSocket? = null
    private var rejectCount = 0
    private var started = false

    private val powerTick = object : Runnable {
        override fun run() {
            evaluatePower()
            main.postDelayed(this, 30_000)
        }
    }

    // ── Ciclo de vida ────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        showWhenLocked()
        root = FrameLayout(this).apply { setBackgroundColor(android.graphics.Color.BLACK) }
        setContentView(root)
        hideSystemUi()
        WatchdogService.start(this)
        route()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == ACTION_WAKE) turnScreenOn()
        if (mode == Mode.SIGNAGE) evaluatePower()
    }

    override fun onStart() {
        super.onStart()
        // Volta do segundo plano: retoma a exibição (players são liberados no onStop)
        if (started && mode == Mode.SIGNAGE && !standby) {
            ConfigStore.load(this)?.let { signage?.apply(it) }
            if (socket?.isConnected != true) connectSocket()
        }
        started = true
    }

    override fun onResume() {
        super.onResume()
        isAlive = true
        hideSystemUi()
        if (mode == Mode.SIGNAGE) evaluatePower()
    }

    override fun onPause() {
        super.onPause()
        isAlive = false
    }

    override fun onStop() {
        super.onStop()
        // Em segundo plano não faz sentido manter vídeos tocando
        if (mode == Mode.SIGNAGE) signage?.stop()
    }

    override fun onDestroy() {
        isAlive = false
        main.removeCallbacksAndMessages(null)
        socket?.disconnect()
        pairing?.disconnect()
        signage?.stop()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    // ── Navegação entre telas ────────────────────────────────────────────────

    private fun route() {
        if (prefs.isPaired) startSignage() else showWelcome(null)
    }

    private fun setScreen(view: View) {
        root.removeAllViews()
        root.addView(view, matchParent())
    }

    private fun showWelcome(error: String?) {
        mode = Mode.SETUP_HOME
        stopPairing()
        setScreen(SetupScreens.welcome(this, error, onCode = ::showServerForm, onLogin = ::showLoginForm))
    }

    private fun showServerForm(error: String? = null) {
        mode = Mode.SETUP
        lateinit var form: SetupScreens.Form
        form = SetupScreens.serverForm(this, prefs.serverUrl, prefs.companyToken, error, onSubmit = { input, companyInput ->
            val url = Prefs.normalizeUrl(input)
            val company = companyInput.trim().uppercase()
            if (url.isBlank()) {
                form.setBusy(false, "Informe o endereço do servidor")
                return@serverForm
            }
            if (company.isBlank()) {
                form.setBusy(false, "Informe o código da empresa (aparece no painel em Telas)")
                return@serverForm
            }
            form.setBusy(true, null)
            Thread {
                val result = Net.checkServer(url)
                runOnUiThread {
                    result.onSuccess {
                        prefs.serverUrl = url
                        prefs.companyToken = company
                        showPairing(company)
                    }.onFailure { form.setBusy(false, it.message) }
                }
            }.start()
        }, onBack = { showWelcome(null) })
        setScreen(form.view)
    }

    private fun showLoginForm() {
        mode = Mode.SETUP
        lateinit var form: SetupScreens.Form
        form = SetupScreens.loginForm(this, prefs.serverUrl, onSubmit = { input, user, pass ->
            val url = Prefs.normalizeUrl(input)
            if (url.isBlank() || user.isBlank() || pass.isEmpty()) {
                form.setBusy(false, "Preencha todos os campos")
                return@loginForm
            }
            form.setBusy(true, null)
            Thread {
                val result = Net.companyTokenFromLogin(url, user.trim(), pass)
                runOnUiThread {
                    result.onSuccess { token ->
                        prefs.serverUrl = url
                        prefs.companyToken = token
                        showPairing(token)
                    }.onFailure { form.setBusy(false, it.message) }
                }
            }.start()
        }, onBack = { showWelcome(null) })
        setScreen(form.view)
    }

    private fun showPairing(companyToken: String) {
        mode = Mode.PAIRING
        stopPairing()
        val url = prefs.serverUrl ?: return showWelcome(null)
        val code = (1..6).map { CODE_CHARS.random() }.joinToString("")
        val screen = SetupScreens.pairing(this, code, url, onBack = { showWelcome(null) })
        setScreen(screen.view)
        pairing = PairingSocket(url, code, companyToken, onState = screen.setConnected, onError = { msg ->
            // Código da empresa ausente/errado: volta ao formulário mostrando o motivo
            stopPairing()
            showServerForm(msg)
        }) { token ->
            prefs.screenToken = token
            screen.setSuccess()
            main.postDelayed({ startSignage() }, 1_500)
        }.also { it.connect() }
    }

    private fun stopPairing() {
        pairing?.disconnect()
        pairing = null
    }

    // ── Exibição ─────────────────────────────────────────────────────────────

    private fun startSignage() {
        mode = Mode.SIGNAGE
        stopPairing()
        rejectCount = 0
        val view = signage ?: SignageView(this).also { signage = it }
        view.removeFromParent()
        setScreen(view)
        ConfigStore.load(this)?.let { if (ConfigStore.shouldBeOnNow(this)) view.apply(it) }
        connectSocket()
        main.removeCallbacks(powerTick)
        main.post(powerTick)
    }

    private fun connectSocket() {
        val url = prefs.serverUrl ?: return
        val token = prefs.screenToken ?: return
        socket?.disconnect()
        socket = TvSocket(url, token, this, powerState = { if (standby) "standby" else "on" }).also { it.connect() }
    }

    override fun onConnected() {
        rejectCount = 0
        signage?.setConnected(true)
    }

    override fun onDisconnected() {
        signage?.setConnected(false)
    }

    override fun onConfig(json: JSONObject) {
        ConfigStore.save(this, json)
        val cfg = ConfigStore.load(this) ?: return
        PowerController.scheduleNext(this)
        evaluatePower()
        if (!standby && mode == Mode.SIGNAGE) signage?.apply(cfg)
    }

    override fun onRejected() {
        signage?.setConnected(false)
        // Servidor recusou o token. Pode ser instabilidade: tenta mais 2 vezes antes de desparear.
        if (++rejectCount >= 3) {
            unpair("Esta TV não está mais cadastrada no painel. Conecte novamente.")
        } else {
            main.postDelayed({ if (mode == Mode.SIGNAGE) connectSocket() }, 30_000)
        }
    }

    private fun unpair(message: String?) {
        socket?.disconnect()
        socket = null
        main.removeCallbacks(powerTick)
        signage?.stop()
        signage = null
        exitStandbyUi()
        prefs.unpair()
        ConfigStore.clear(this)
        PowerController.scheduleNext(this)
        showWelcome(message)
    }

    // ── Ligar / desligar ─────────────────────────────────────────────────────

    private fun evaluatePower() {
        if (mode != Mode.SIGNAGE) return
        PowerController.scheduleNext(this)
        val on = ConfigStore.shouldBeOnNow(this)
        if (!on && !standby) enterStandby()
        else if (on && standby) exitStandby()
    }

    private fun enterStandby() {
        standby = true
        signage?.stop()
        val v = standbyView ?: StandbyView(this).also { standbyView = it }
        v.setMessage(nextOnMessage())
        if (v.parent == null) root.addView(v, matchParent())
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        socket?.sendHeartbeat() // painel mostra "Fora do horário"
        // Dá tempo da tela preta aparecer e então deixa a box dormir
        main.postDelayed({ if (standby) PowerController.sleep(this) }, 3_000)
    }

    private fun exitStandby() {
        standby = false
        exitStandbyUi()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        turnScreenOn()
        if (!PowerController.isScreenOn(this)) PowerController.wake(this)
        PowerController.releaseCpu()
        ConfigStore.load(this)?.let { signage?.apply(it) }
        if (socket?.isConnected != true) connectSocket() else socket?.sendHeartbeat()
    }

    private fun exitStandbyUi() {
        standbyView?.removeFromParent()
    }

    private fun nextOnMessage(): String {
        val next = ConfigStore.nextPowerChange(this) ?: return "Fora do horário de funcionamento"
        val fmt = SimpleDateFormat("EEE HH:mm", Locale("pt", "BR")).apply { timeZone = deviceZone() }
        return "Fora do horário — liga ${fmt.format(Date(next))}"
    }

    private fun setManualPower(on: Boolean, durationMs: Long) {
        prefs.overrideOn = on
        prefs.overrideUntil = System.currentTimeMillis() + durationMs
        evaluatePower()
    }

    // ── Menu (OK segurado ou tecla MENU) ─────────────────────────────────────

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (mode == Mode.SIGNAGE) {
            when (keyCode) {
                KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_SETTINGS, KeyEvent.KEYCODE_INFO -> {
                    showMenu(); return true
                }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    event.startTracking(); return true
                }
                KeyEvent.KEYCODE_BACK -> return true // modo quiosque
            }
        } else if (keyCode == KeyEvent.KEYCODE_BACK && mode != Mode.SETUP_HOME) {
            // Nas telas de configuração, Voltar retorna à tela inicial em vez de fechar o app
            showWelcome(null)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyLongPress(keyCode: Int, event: KeyEvent): Boolean {
        if (mode == Mode.SIGNAGE && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
            showMenu()
            return true
        }
        return super.onKeyLongPress(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (mode == Mode.SIGNAGE && keyCode == KeyEvent.KEYCODE_BACK) return true
        return super.onKeyUp(keyCode, event)
    }

    private fun showMenu() {
        val cfg = ConfigStore.load(this)
        val connected = socket?.isConnected == true
        val power = cfg?.power
        val info = buildString {
            append("Tela: ").append(cfg?.screenName?.ifBlank { null } ?: "—").append('\n')
            append("Servidor: ").append(prefs.serverUrl ?: "—").append('\n')
            append("Conexão: ").append(if (connected) "online" else "reconectando").append('\n')
            append("Horários: ").append(
                when {
                    power?.isActive != true -> "sempre ligada"
                    else -> "${power.rules.size} regra(s) do painel"
                },
            ).append('\n')
            append("Desligar a tela: ").append(if (PowerController.isAdmin(this@MainActivity)) "permitido" else "não permitido (só tela preta)").append('\n')
            append("Android: ").append(Build.VERSION.RELEASE).append(" · ").append(Build.MODEL).append('\n')
            append("Versão: ").append(BuildConfig.VERSION_NAME)
        }

        val actions = mutableListOf<Pair<String, () -> Unit>>()
        actions += "🔄  Recarregar conteúdo" to { connectSocket() }
        if (standby) {
            actions += "💡  Ligar agora (por 2 horas)" to { setManualPower(true, MANUAL_ON_MS) }
        } else {
            actions += "🌙  Testar desligamento (volta em 1 min)" to { setManualPower(false, TEST_OFF_MS) }
        }
        if (prefs.overrideUntil > System.currentTimeMillis()) {
            actions += "↩  Voltar a seguir os horários do painel" to {
                prefs.overrideUntil = 0
                evaluatePower()
            }
        }
        if (!PowerController.isAdmin(this)) {
            actions += "⚙  Permitir que o app desligue a tela" to ::requestAdmin
        }
        if (Compat.needsOverlayPermission(this)) {
            actions += "⚙  Permitir abrir sozinho (Android 10 ou superior)" to { Compat.requestOverlayPermission(this) }
        }
        actions += if (Compat.isHomeLauncher(this)) {
            "🏠  Deixar de ser a tela inicial da box" to { Compat.setHomeLauncher(this, false) }
        } else {
            "🏠  Usar como tela inicial da box" to { Compat.setHomeLauncher(this, true) }
        }
        actions += "📺  Desconectar esta TV" to ::confirmUnpair

        // Informações no cabeçalho: com setMessage() o Android esconderia a lista de opções
        val header = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            val p = com.interativa.player.ui.Ui.dp(this@MainActivity, 20)
            setPadding(p, p, p, p / 2)
            addView(com.interativa.player.ui.Ui.text(this@MainActivity, "Interativa Player", 20f, bold = true))
            addView(com.interativa.player.ui.Ui.text(this@MainActivity, info, 14f, com.interativa.player.ui.Ui.MUTED).apply {
                setPadding(0, p / 2, 0, 0)
            })
        }
        AlertDialog.Builder(this, R.style.Theme_Player_Dialog)
            .setCustomTitle(header)
            .setItems(actions.map { it.first }.toTypedArray()) { _, which -> actions[which].second() }
            .setNegativeButton("Fechar", null)
            .show()
    }

    private fun confirmUnpair() {
        AlertDialog.Builder(this, R.style.Theme_Player_Dialog)
            .setTitle("Desconectar esta TV?")
            .setMessage("A TV para de exibir o conteúdo e volta para a tela de pareamento.")
            .setPositiveButton("Desconectar") { _, _ -> unpair(null) }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun requestAdmin() {
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
            .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, PowerController.adminComponent(this))
            .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, getString(R.string.admin_description))
        runCatching { startActivity(intent) }
    }

    // ── Janela ───────────────────────────────────────────────────────────────

    @Suppress("DEPRECATION")
    private fun showWhenLocked() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) setShowWhenLocked(true)
        else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
    }

    @Suppress("DEPRECATION")
    private fun turnScreenOn() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) setTurnScreenOn(true)
        else window.addFlags(WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
    }
}
