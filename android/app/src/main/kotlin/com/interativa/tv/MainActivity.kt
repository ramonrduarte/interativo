package com.interativa.tv

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.*
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var wakeLock: PowerManager.WakeLock? = null

    private var tapCount    = 0
    private var firstTapTime = 0L

    companion object {
        private const val PREFS     = "interativa"
        private const val KEY_URL   = "server_url"
        private const val KEY_TOKEN = "pairing_token"
    }

    @SuppressLint("SetJavaScriptEnabled", "WakelockTimeout")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        acquireWakeLock()
        hideSystemUI()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.enableSlowWholeDocumentDraw()
        }

        webView = WebView(this).apply { setBackgroundColor(Color.BLACK) }
        setContentView(webView)
        setupWebView()

        val url   = prefs().getString(KEY_URL,   null)
        val token = prefs().getString(KEY_TOKEN, null)

        if (!url.isNullOrBlank() && !token.isNullOrBlank()) {
            loadTv(url, token)
        } else {
            showLoginScreen()
        }
    }

    // ── Login screen (programmatic) ──────────────────────────────────────────

    private fun showLoginScreen(errorMsg: String? = null) {
        val dp = { v: Int -> TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt() }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0a0c10"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Logo / title
        root.addView(TextView(this).apply {
            text      = "📺 Interativa TV"
            textSize  = 22f
            typeface  = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity   = Gravity.CENTER
            setPadding(0, 0, 0, dp(8))
        })
        root.addView(TextView(this).apply {
            text     = "Entre com os dados da sua empresa"
            textSize = 14f
            setTextColor(Color.parseColor("#888888"))
            gravity  = Gravity.CENTER
            setPadding(0, 0, 0, dp(32))
        })

        // Card
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#111827"))
            setPadding(dp(24), dp(24), dp(24), dp(24))
            layoutParams = LinearLayout.LayoutParams(dp(360), LinearLayout.LayoutParams.WRAP_CONTENT)
        }

        fun field(hint: String, inputType: Int): EditText {
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)).apply { bottomMargin = dp(12) }
            return EditText(this).apply {
                this.hint      = hint
                this.inputType = inputType
                setTextColor(Color.WHITE)
                setHintTextColor(Color.parseColor("#555555"))
                setBackgroundColor(Color.parseColor("#1f2937"))
                setPadding(dp(12), 0, dp(12), 0)
                textSize   = 14f
                layoutParams = lp
            }
        }

        val urlField  = field("URL do servidor  (ex: https://interativa.rdmon.com)",
            android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI)
        val userField = field("Usuário ou e-mail",
            android.text.InputType.TYPE_CLASS_TEXT)
        val passField = field("Senha",
            android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD)

        urlField.setText(prefs().getString(KEY_URL, ""))

        val statusText = TextView(this).apply {
            text     = errorMsg ?: ""
            textSize = 13f
            setTextColor(Color.parseColor("#ef4444"))
            gravity  = Gravity.CENTER
            setPadding(0, 0, 0, dp(12))
            visibility = if (errorMsg != null) View.VISIBLE else View.GONE
        }

        val connectBtn = Button(this).apply {
            text = "Conectar"
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#2d6ef5"))
            textSize     = 15f
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48))
        }

        card.addView(urlField)
        card.addView(userField)
        card.addView(passField)
        card.addView(statusText)
        card.addView(connectBtn)
        root.addView(card)

        setContentView(root)

        connectBtn.setOnClickListener {
            val serverUrl = urlField.text.toString().trim().trimEnd('/')
            val username  = userField.text.toString().trim()
            val password  = passField.text.toString()

            if (serverUrl.isEmpty() || username.isEmpty() || password.isEmpty()) {
                statusText.text      = "Preencha todos os campos"
                statusText.visibility = View.VISIBLE
                return@setOnClickListener
            }

            connectBtn.isEnabled     = false
            connectBtn.text          = "Conectando…"
            statusText.visibility     = View.GONE

            Thread {
                val (pairingToken, err) = fetchPairingToken(serverUrl, username, password)
                runOnUiThread {
                    connectBtn.isEnabled = true
                    connectBtn.text      = "Conectar"
                    if (pairingToken != null) {
                        prefs().edit()
                            .putString(KEY_URL,   serverUrl)
                            .putString(KEY_TOKEN, pairingToken)
                            .apply()
                        setContentView(webView)
                        loadTv(serverUrl, pairingToken)
                    } else {
                        statusText.text      = err ?: "Erro desconhecido"
                        statusText.visibility = View.VISIBLE
                    }
                }
            }.start()
        }
    }

    // ── API calls (background thread) ────────────────────────────────────────

    private fun fetchPairingToken(baseUrl: String, email: String, password: String): Pair<String?, String?> {
        return try {
            // 1. Login
            val loginConn = (URL("$baseUrl/api/auth/login").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 10_000
                readTimeout    = 10_000
                doOutput       = true
            }
            val body = JSONObject().apply { put("email", email); put("password", password) }.toString()
            OutputStreamWriter(loginConn.outputStream, "UTF-8").use { it.write(body) }

            if (loginConn.responseCode != 200) {
                val errBody = loginConn.errorStream?.let { BufferedReader(InputStreamReader(it, "UTF-8")).readText() } ?: ""
                val msg = try { JSONObject(errBody).getString("error") } catch (_: Exception) { "Usuário ou senha incorretos" }
                return Pair(null, msg)
            }

            val loginJson = JSONObject(BufferedReader(InputStreamReader(loginConn.inputStream, "UTF-8")).readText())
            val jwt = loginJson.getString("token")

            // 2. Get company pairing token
            val companyConn = (URL("$baseUrl/api/company").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer $jwt")
                connectTimeout = 10_000
                readTimeout    = 10_000
            }

            if (companyConn.responseCode != 200) {
                return Pair(null, "Erro ao obter dados da empresa (${companyConn.responseCode})")
            }

            val companyJson  = JSONObject(BufferedReader(InputStreamReader(companyConn.inputStream, "UTF-8")).readText())
            val pairingToken = companyJson.optString("pairing_token", "")

            if (pairingToken.isEmpty()) Pair(null, "Token de pareamento não encontrado na conta")
            else Pair(pairingToken, null)

        } catch (e: Exception) {
            Pair(null, "Erro de conexão: ${e.message}")
        }
    }

    // ── WebView ──────────────────────────────────────────────────────────────

    private fun loadTv(serverUrl: String, pairingToken: String) {
        webView.loadUrl("$serverUrl/tv/?c=$pairingToken")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled                     = true
            domStorageEnabled                     = true
            allowFileAccess                       = true
            allowContentAccess                    = true
            loadsImagesAutomatically              = true
            mediaPlaybackRequiresUserGesture      = false
            javaScriptCanOpenWindowsAutomatically = true
            useWideViewPort                       = true
            loadWithOverviewMode                  = true
            cacheMode                             = WebSettings.LOAD_DEFAULT
            @Suppress("DEPRECATION") mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            @Suppress("DEPRECATION") databaseEnabled  = true
            userAgentString = "Mozilla/5.0 (Linux; Android ${Build.VERSION.RELEASE}; TV) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 InterativaTV/1.0"
        }

        webView.webViewClient = object : WebViewClient() {
            @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
            override fun onReceivedError(view: WebView, errorCode: Int, description: String, failingUrl: String) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                    view.postDelayed({ view.reload() }, 5000)
                }
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request.isForMainFrame) {
                    view.postDelayed({ view.reload() }, 5000)
                }
            }
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
                handler.proceed()
            }
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                view.setBackgroundColor(Color.BLACK)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                android.util.Log.d("InterativaTV", "[JS] ${msg.message()} (${msg.sourceId()}:${msg.lineNumber()})")
                return true
            }
        }
    }

    // ── Gesture / key to open settings ───────────────────────────────────────

    // 5 toques em até 3s → abre tela de login novamente
    private fun handleTap() {
        val now = System.currentTimeMillis()
        if (now - firstTapTime > 3000) { tapCount = 0; firstTapTime = now }
        if (++tapCount >= 5) {
            tapCount = 0
            prefs().edit().remove(KEY_TOKEN).apply()  // limpa token, mantém URL/usuário preenchido
            showLoginScreen()
        }
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.action == MotionEvent.ACTION_DOWN) handleTap()
        return super.dispatchTouchEvent(ev)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) handleTap()
        return super.onKeyDown(keyCode, event)
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun prefs() = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Suppress("DEPRECATION")
    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "Interativa:WakeLock"
            )
            @Suppress("WakelockTimeout")
            wakeLock?.acquire()
        } catch (_: Exception) {}
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val ctrl = window.insetsController
            if (ctrl != null) {
                ctrl.hide(android.view.WindowInsets.Type.systemBars())
                ctrl.systemBarsBehavior = android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        } else {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN
            window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUI()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        // else: bloqueia o botão voltar (kiosk mode)
    }

    override fun onDestroy() {
        super.onDestroy()
        wakeLock?.let { if (it.isHeld) it.release() }
    }
}
