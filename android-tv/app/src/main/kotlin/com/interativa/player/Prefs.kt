package com.interativa.player

import android.content.Context
import android.net.Uri

class Prefs(ctx: Context) {
    private val sp = ctx.applicationContext.getSharedPreferences("player", Context.MODE_PRIVATE)

    var serverUrl: String?
        get() = sp.getString(K_URL, null)
        set(v) = sp.edit().putString(K_URL, v).apply()

    /** Token da tela (screen.token) recebido no pareamento. */
    var screenToken: String?
        get() = sp.getString(K_SCREEN, null)
        set(v) = sp.edit().putString(K_SCREEN, v).apply()

    /** pairing_token da empresa, obtido no login (opcional). */
    var companyToken: String?
        get() = sp.getString(K_COMPANY, null)
        set(v) = sp.edit().putString(K_COMPANY, v).apply()

    /** Ligar/desligar manual pelo menu, válido até [overrideUntil]. */
    var overrideOn: Boolean
        get() = sp.getBoolean(K_OVR_ON, true)
        set(v) = sp.edit().putBoolean(K_OVR_ON, v).apply()

    var overrideUntil: Long
        get() = sp.getLong(K_OVR_UNTIL, 0L)
        set(v) = sp.edit().putLong(K_OVR_UNTIL, v).apply()

    val isPaired: Boolean get() = !serverUrl.isNullOrBlank() && !screenToken.isNullOrBlank()

    fun unpair() = sp.edit().remove(K_SCREEN).remove(K_OVR_UNTIL).apply()

    companion object {
        private const val K_URL = "server_url"
        private const val K_SCREEN = "screen_token"
        private const val K_COMPANY = "company_token"
        private const val K_OVR_ON = "override_on"
        private const val K_OVR_UNTIL = "override_until"

        /**
         * Aceita "interativa.empresa.com.br", "192.168.0.110:3001", "https://...".
         * Sem protocolo: IP ou porta explícita → http, domínio → https.
         */
        fun normalizeUrl(input: String): String {
            var u = input.trim().trimEnd('/')
            if (u.isEmpty()) return u
            if (!u.startsWith("http://", true) && !u.startsWith("https://", true)) {
                val hostPort = u.substringBefore('/')
                val host = hostPort.substringBefore(':')
                val hasPort = hostPort.contains(':') && !hostPort.endsWith(":443")
                val isIp = host.matches(Regex("""\d{1,3}(\.\d{1,3}){3}""")) || host == "localhost"
                u = (if (isIp || hasPort) "http://" else "https://") + u
            }
            return Uri.parse(u).buildUpon().build().toString().trimEnd('/')
        }
    }
}
