package com.interativa.player

import android.os.Build
import android.os.Handler
import android.os.Looper
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URLEncoder

/**
 * Conexão normal da TV — mesmo protocolo de tv/src/socket.js:
 *  query ?token=<screen.token>, recebe "config:update", envia "tv:heartbeat" a cada 30 s.
 * Todos os callbacks chegam na thread principal.
 */
class TvSocket(
    private val baseUrl: String,
    private val token: String,
    private val listener: Listener,
    /** "on" ou "standby" — enviado ao painel. */
    private val powerState: () -> String = { "on" },
) {
    interface Listener {
        fun onConnected()
        fun onDisconnected()
        fun onConfig(json: JSONObject)
        /** O servidor encerrou a conexão (token não existe mais no painel). */
        fun onRejected()
        /** A tela foi excluída no painel: volta para o pareamento na hora. */
        fun onRemoved() = onRejected()
    }

    private val main = Handler(Looper.getMainLooper())
    private var socket: Socket? = null

    private val heartbeat = object : Runnable {
        override fun run() {
            sendHeartbeat()
            main.postDelayed(this, 30_000)
        }
    }

    val isConnected: Boolean get() = socket?.connected() == true

    /** Envia já o estado (ex.: entrou/saiu do horário desligado). */
    fun sendHeartbeat() {
        socket?.takeIf { it.connected() }?.emit("tv:heartbeat", JSONObject().put("token", token).put("power", powerState()))
    }

    /** Andamento do download dos vídeos — mostrado no painel (Telas → Status). */
    fun sendSync(p: SyncProgress, waiting: Boolean) {
        socket?.takeIf { it.connected() }?.emit(
            "tv:sync",
            JSONObject()
                .put("done", p.done).put("total", p.total).put("percent", p.percent)
                .put("finished", p.finished).put("failed", p.failed).put("waiting", waiting),
        )
    }

    /** Identificação do aparelho exibida no painel (Telas → Status). */
    private fun deviceInfo() = JSONObject()
        .put("client", "android-app")
        .put("manufacturer", Build.MANUFACTURER)
        .put("model", Build.MODEL)
        .put("android", Build.VERSION.RELEASE)
        .put("appVersion", BuildConfig.VERSION_NAME)
        .put("localIp", localIp())
        .put("power", powerState())

    private fun localIp(): String? = runCatching {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }
            .firstOrNull { it is Inet4Address && !it.isLoopbackAddress }
            ?.hostAddress
    }.getOrNull()

    fun connect() {
        disconnect()
        val opts = IO.Options().apply {
            query = "token=" + URLEncoder.encode(token, "UTF-8")
            reconnection = true
            reconnectionDelay = 2_000
            reconnectionDelayMax = 10_000
            timeout = 20_000
        }
        val s = IO.socket(baseUrl, opts)
        s.on(Socket.EVENT_CONNECT) {
            s.emit("tv:register", JSONObject().put("token", token).put("device", deviceInfo()))
            main.post { listener.onConnected() }
        }
        s.on(Socket.EVENT_DISCONNECT) { args ->
            val reason = args.firstOrNull()?.toString().orEmpty()
            main.post { if (reason == "io server disconnect") listener.onRejected() else listener.onDisconnected() }
        }
        s.on(Socket.EVENT_CONNECT_ERROR) { main.post { listener.onDisconnected() } }
        s.on("screen:removed") { main.post { disconnect(); listener.onRemoved() } }
        s.on("config:update") { args ->
            (args.firstOrNull() as? JSONObject)?.let { json -> main.post { listener.onConfig(json) } }
        }
        socket = s
        s.connect()
        main.postDelayed(heartbeat, 30_000)
    }

    fun disconnect() {
        main.removeCallbacks(heartbeat)
        socket?.let {
            it.off()
            it.disconnect()
        }
        socket = null
    }
}

/**
 * Modo pareamento — igual a connectPairing() do app web:
 *  query ?pairing=<código>&c=<token da empresa>, espera "pairing:success" { token }.
 */
class PairingSocket(
    private val baseUrl: String,
    private val code: String,
    private val companyToken: String?,
    private val onState: (connected: Boolean) -> Unit,
    /** Servidor recusou: sem código da empresa ou código inválido. */
    private val onError: (message: String) -> Unit,
    private val onSuccess: (screenToken: String) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private var socket: Socket? = null

    fun connect() {
        val q = StringBuilder("pairing=").append(URLEncoder.encode(code, "UTF-8"))
        if (!companyToken.isNullOrBlank()) q.append("&c=").append(URLEncoder.encode(companyToken, "UTF-8"))
        val opts = IO.Options().apply {
            query = q.toString()
            reconnection = true
            reconnectionDelay = 2_000
            reconnectionDelayMax = 10_000
        }
        val s = IO.socket(baseUrl, opts)
        s.on(Socket.EVENT_CONNECT) { main.post { onState(true) } }
        s.on(Socket.EVENT_DISCONNECT) { main.post { onState(false) } }
        s.on(Socket.EVENT_CONNECT_ERROR) { main.post { onState(false) } }
        s.on("pairing:error") { args ->
            val msg = (args.firstOrNull() as? JSONObject)?.optString("message").orEmpty()
                .ifBlank { "O servidor recusou o pareamento." }
            main.post { disconnect(); onError(msg) }
        }
        s.on("pairing:success") { args ->
            val token = (args.firstOrNull() as? JSONObject)?.optString("token").orEmpty()
            if (token.isNotBlank()) main.post { disconnect(); onSuccess(token) }
        }
        socket = s
        s.connect()
    }

    fun disconnect() {
        socket?.let {
            it.off()
            it.disconnect()
        }
        socket = null
    }
}
