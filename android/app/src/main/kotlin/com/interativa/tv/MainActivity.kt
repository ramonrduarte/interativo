package com.interativa.tv

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.*
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var wakeLock: PowerManager.WakeLock

    // Conta toques para abrir config (5 toques em 3s)
    private var tapCount = 0
    private var firstTapTime = 0L

    companion object {
        private const val PREFS  = "interativa"
        private const val KEY_URL = "server_url"
    }

    @SuppressLint("SetJavaScriptEnabled", "WakelockTimeout")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Manter tela acesa sempre
        @Suppress("DEPRECATION")
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "Interativa:WakeLock"
        )
        wakeLock.acquire()

        hideSystemUI()

        webView = WebView(this)
        setContentView(webView)
        setupWebView()

        val url = getSavedUrl()
        if (url.isNullOrBlank()) {
            showSetupDialog()
        } else {
            loadUrl(url)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled        = true
            domStorageEnabled        = true
            allowFileAccess          = true
            mediaPlaybackRequiresUserGesture = false
            // Usa cache quando offline, rede quando disponível
            cacheMode                = WebSettings.LOAD_DEFAULT
            @Suppress("DEPRECATION")
            mixedContentMode         = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                // Servidor indisponível — tenta novamente em 5s
                if (request.isForMainFrame) {
                    view.postDelayed({ view.reload() }, 5000)
                }
            }
        }
        webView.webChromeClient = WebChromeClient()
    }

    private fun loadUrl(serverUrl: String) {
        val base = serverUrl.trimEnd('/')
        webView.loadUrl("$base/tv/")
    }

    private fun getSavedUrl(): String? =
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_URL, null)

    private fun saveUrl(url: String) =
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_URL, url).apply()

    private fun showSetupDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(60, 24, 60, 8)
        }

        layout.addView(TextView(this).apply {
            text = "URL do servidor Interativa:"
            setPadding(0, 0, 0, 12)
        })

        val input = EditText(this).apply {
            setText(getSavedUrl() ?: "")
            hint = "http://192.168.0.110:3001"
        }
        layout.addView(input)

        layout.addView(TextView(this).apply {
            text = "\nDica: use o IP da rede local e a porta 3001."
            textSize = 12f
        })

        AlertDialog.Builder(this)
            .setTitle("Configurar Servidor")
            .setView(layout)
            .setPositiveButton("Salvar") { _, _ ->
                val url = input.text.toString().trim()
                if (url.isNotBlank()) {
                    saveUrl(url)
                    webView.clearCache(true)
                    loadUrl(url)
                }
            }
            .setCancelable(getSavedUrl() != null) // cancela só se já tiver URL salva
            .show()
    }

    // 5 toques em até 3s em qualquer lugar → abre configuração
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.action == MotionEvent.ACTION_DOWN) {
            val now = System.currentTimeMillis()
            if (now - firstTapTime > 3000) {
                tapCount    = 0
                firstTapTime = now
            }
            tapCount++
            if (tapCount >= 5) {
                tapCount = 0
                showSetupDialog()
                return true
            }
        }
        return super.dispatchTouchEvent(ev)
    }

    private fun hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
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

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUI()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        // else: não faz nada — bloqueia o botão voltar
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::wakeLock.isInitialized && wakeLock.isHeld) wakeLock.release()
    }
}
