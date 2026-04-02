package com.interativa.tv

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.view.KeyEvent
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
    private var wakeLock: PowerManager.WakeLock? = null

    private var tapCount = 0
    private var firstTapTime = 0L

    companion object {
        private const val PREFS   = "interativa"
        private const val KEY_URL = "server_url"
    }

    @SuppressLint("SetJavaScriptEnabled", "WakelockTimeout")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        acquireWakeLock()
        hideSystemUI()

        // Disable hardware acceleration for WebView — fixes black screen on many TV boxes
        WebView.enableSlowWholeDocumentDraw()

        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            // Force software rendering for compatibility with TV boxes
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                setLayerType(View.LAYER_TYPE_HARDWARE, null)
            }
        }
        setContentView(webView)
        setupWebView()

        val url = getSavedUrl()
        if (url.isNullOrBlank()) showSetupDialog() else loadUrl(url)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled               = true
            domStorageEnabled               = true
            databaseEnabled                 = true
            allowFileAccess                 = true
            allowContentAccess              = true
            mediaPlaybackRequiresUserGesture = false
            loadsImagesAutomatically        = true
            javaScriptCanOpenWindowsAutomatically = true

            // Wider compatibility for older WebView versions on TV boxes
            @Suppress("DEPRECATION")
            saveFormData = false
            @Suppress("DEPRECATION")
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

            // Use cache when offline
            cacheMode = WebSettings.LOAD_DEFAULT

            // Force desktop-class rendering
            useWideViewPort    = true
            loadWithOverviewMode = true

            // Override UA so the TV app gets the same experience as a desktop browser
            userAgentString = "Mozilla/5.0 (Linux; Android ${Build.VERSION.RELEASE}; TV) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 InterativaTV/1.0"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                // Ensure background is black while content loads
                view.setBackgroundColor(Color.BLACK)
            }

            @Suppress("DEPRECATION")
            override fun onReceivedError(view: WebView, errorCode: Int, description: String, failingUrl: String) {
                // Legacy callback for Android < 6.0 (common on TV boxes)
                view.postDelayed({ view.reload() }, 5000)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    view.postDelayed({ view.reload() }, 5000)
                }
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
                // Accept self-signed certs on local network
                handler.proceed()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                android.util.Log.d("InterativaTV", "[JS] ${msg.message()} (${msg.sourceId()}:${msg.lineNumber()})")
                return true
            }
        }
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
            .setCancelable(getSavedUrl() != null)
            .show()
    }

    // 5 toques em até 3s → abre configuração (funciona com controle remoto também via DPAD_CENTER)
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.action == MotionEvent.ACTION_DOWN) {
            val now = System.currentTimeMillis()
            if (now - firstTapTime > 3000) { tapCount = 0; firstTapTime = now }
            if (++tapCount >= 5) { tapCount = 0; showSetupDialog(); return true }
        }
        return super.dispatchTouchEvent(ev)
    }

    // Suporte ao controle remoto do TV box: OK/Enter 5x abre config
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
            val now = System.currentTimeMillis()
            if (now - firstTapTime > 3000) { tapCount = 0; firstTapTime = now }
            if (++tapCount >= 5) { tapCount = 0; showSetupDialog(); return true }
        }
        return super.onKeyDown(keyCode, event)
    }

    @Suppress("DEPRECATION")
    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "Interativa:WakeLock"
            )
            wakeLock?.acquire()
        } catch (_: Exception) {}
    }

    private fun hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
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
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUI()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
    }

    override fun onDestroy() {
        super.onDestroy()
        wakeLock?.let { if (it.isHeld) it.release() }
    }
}
