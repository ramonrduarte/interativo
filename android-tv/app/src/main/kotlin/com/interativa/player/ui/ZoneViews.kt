@file:OptIn(UnstableApi::class)

package com.interativa.player.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Typeface
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.TextureView
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import coil.dispose
import coil.load
import com.interativa.player.ConfigParser
import com.interativa.player.MediaCache
import com.interativa.player.Prefs
import com.interativa.player.ZoneItem
import com.interativa.player.zoneFor
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.max
import kotlin.math.min

/** Ciclo de vida de uma zona: start() quando entra na tela, release() quando sai. */
interface ZoneContent {
    fun start()
    fun release()
    fun restart() {}
}

object ZoneFactory {
    fun create(ctx: Context, item: ZoneItem?, label: String, onVideoEnd: (() -> Unit)?): View = when (item?.type) {
        null -> EmptyZone(ctx, label)
        "image" -> ImageZone(ctx, item)
        "video" -> VideoZone(ctx, item, live = false, onEnded = onVideoEnd)
        "iptvchannel" -> VideoZone(ctx, item, live = true, onEnded = null)
        "youtube" -> WebZone(ctx, youtubeEmbed(item.url), youtube = true)
        "webpage" -> WebZone(ctx, item.url)
        "text" -> TextZone(ctx, item)
        "clock" -> ClockZone(ctx, item)
        "priceboard" -> PriceboardZone(ctx, item)
        else -> EmptyZone(ctx, item.type)
    }

    /** Mesmos parâmetros do YoutubeContent do app web. */
    fun youtubeEmbed(url: String?): String? {
        if (url == null) return null
        return runCatching {
            val u = Uri.parse(url)
            val params = linkedMapOf<String, String>()
            u.queryParameterNames.forEach { k -> u.getQueryParameter(k)?.let { params[k] = it } }
            params["autoplay"] = "1"
            params["mute"] = "1"
            params.putIfAbsent("loop", "1")
            params["controls"] = "0"
            params["rel"] = "0"
            params["modestbranding"] = "1"
            params["iv_load_policy"] = "3"
            params["enablejsapi"] = "1"
            val b = u.buildUpon().authority("www.youtube-nocookie.com").clearQuery()
            params.forEach { (k, v) -> b.appendQueryParameter(k, v) }
            b.build().toString()
        }.getOrDefault(url)
    }
}

private fun cfgStr(o: JSONObject?, key: String) = o?.let { ConfigParser.str(it, key) }

// ── Zona vazia ──────────────────────────────────────────────────────────────

class EmptyZone(ctx: Context, label: String) : FrameLayout(ctx) {
    init {
        setBackgroundColor(Ui.ZONE_BG)
        addView(
            Ui.text(ctx, label, 14f, Color.parseColor("#333333")).apply { gravity = Gravity.CENTER },
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
    }
}

// ── Imagem ──────────────────────────────────────────────────────────────────

class ImageZone(ctx: Context, private val item: ZoneItem) : FrameLayout(ctx), ZoneContent {
    private val image = ImageView(ctx).apply {
        scaleType = when (item.objectFit) {
            "contain" -> ImageView.ScaleType.FIT_CENTER
            "fill" -> ImageView.ScaleType.FIT_XY
            "none" -> ImageView.ScaleType.CENTER
            "scale-down" -> ImageView.ScaleType.CENTER_INSIDE
            else -> ImageView.ScaleType.CENTER_CROP
        }
    }

    init {
        setBackgroundColor(Ui.ZONE_BG)
        addView(image, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    override fun start() {
        image.load(item.url) { crossfade(250) }
    }

    override fun release() {
        image.dispose()
        image.setImageDrawable(null)
    }
}

// ── Vídeo e IPTV ────────────────────────────────────────────────────────────

/**
 * ExoPlayer + TextureView (funciona dentro da rotação de TV em pé e permite
 * object-fit cover/contain/fill via matriz). Vídeos do painel usam cache em disco;
 * IPTV ao vivo tenta .m3u8 e cai para .ts, e se o sinal cair tenta de novo sozinho.
 */
class VideoZone(
    ctx: Context,
    private val item: ZoneItem,
    private val live: Boolean,
    private val onEnded: (() -> Unit)?,
) : FrameLayout(ctx), ZoneContent {

    private val main = Handler(Looper.getMainLooper())
    private val texture = TextureView(ctx)
    private val errorView = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(Color.parseColor("#0A0A0A"))
        visibility = GONE
        addView(Ui.text(ctx, if (live) "📡" else "🎬", 34f).apply { gravity = Gravity.CENTER })
        addView(Ui.text(ctx, item.name, 14f, Color.parseColor("#555555")).apply { gravity = Gravity.CENTER })
        addView(Ui.text(ctx, if (live) "Sinal indisponível" else "Vídeo indisponível", 12f, Color.parseColor("#3A3A3A")).apply { gravity = Gravity.CENTER })
    }

    private var player: ExoPlayer? = null
    private var videoW = 0
    private var videoH = 0
    private var active = false
    private var usedFallback = false

    // IPTV: 'contain' por padrão para o quadro inteiro aparecer (igual ao web)
    private val fit = if (live && item.objectFit == "cover") "contain" else item.objectFit

    private val retry = Runnable { if (active) play(primaryUrl()) }

    init {
        setBackgroundColor(Color.BLACK)
        addView(texture, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(errorView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        if (live && item.content?.optBoolean("showLabel") == true) addView(channelLabel(ctx))
        texture.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> applyTransform() }
    }

    private fun channelLabel(ctx: Context): View {
        val pad = Ui.dp(ctx, 6)
        return LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = Ui.rounded(Color.argb(166, 0, 0, 0), Ui.dp(ctx, 4))
            setPadding(pad + pad / 2, pad / 2, pad + pad / 2, pad / 2)
            cfgStr(item.content, "logo")?.let { logo ->
                addView(ImageView(ctx).apply { load(logo) }, LinearLayout.LayoutParams(Ui.dp(ctx, 28), Ui.dp(ctx, 18)).apply { marginEnd = pad })
            }
            addView(Ui.text(ctx, item.name, 13f, Color.WHITE, bold = true))
            layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.START).apply {
                setMargins(Ui.dp(ctx, 8), 0, 0, Ui.dp(ctx, 8))
            }
        }
    }

    /** Xtream Codes: /123.ts → /123.m3u8 (HLS), como resolveStreamUrl() do web. */
    private fun primaryUrl(): String? {
        val url = item.url ?: return null
        if (!live) return url
        return if (Regex("""/\d+\.ts(\?.*)?$""").containsMatchIn(url)) url.replace(Regex("""\.ts(\?.*)?$"""), ".m3u8") else url
    }

    override fun start() {
        active = true
        usedFallback = false
        play(primaryUrl())
    }

    private fun play(url: String?) {
        releasePlayer()
        main.removeCallbacks(retry)
        if (!active) return
        if (url == null) {
            showError(true)
            return
        }
        showError(false)

        val factory = if (live) MediaCache.liveFactory(context) else MediaCache.cachedFactory(context)
        val p = ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(factory))
            .build()
        p.volume = 0f // igual ao web: reprodução muda
        p.repeatMode = if (!live && onEnded == null) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        p.setVideoTextureView(texture)
        p.addListener(object : Player.Listener {
            override fun onVideoSizeChanged(videoSize: VideoSize) {
                if (videoSize.width > 0 && videoSize.height > 0) {
                    videoW = (videoSize.width * videoSize.pixelWidthHeightRatio).toInt()
                    videoH = videoSize.height
                    applyTransform()
                }
            }

            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_READY) showError(false)
                if (state == Player.STATE_ENDED) {
                    if (live) main.postDelayed(retry, 3_000) else onEnded?.invoke()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.w("VideoZone", "Erro ao tocar ${item.name}: ${error.errorCodeName}")
                main.post {
                    if (live && !usedFallback && url != item.url && item.url != null) {
                        usedFallback = true
                        play(item.url)
                    } else {
                        releasePlayer()
                        showError(true)
                        usedFallback = false
                        main.postDelayed(retry, if (live) 30_000 else 15_000)
                    }
                }
            }
        })

        val isHls = url.contains("m3u8", ignoreCase = true) || item.content?.optBoolean("isHls") == true
        val media = MediaItem.Builder().setUri(url).apply { if (isHls) setMimeType(MimeTypes.APPLICATION_M3U8) }.build()
        p.setMediaItem(media)
        p.prepare()
        p.playWhenReady = true
        player = p
    }

    override fun restart() {
        player?.let {
            it.seekTo(0)
            it.playWhenReady = true
        } ?: start()
    }

    private fun showError(show: Boolean) {
        errorView.visibility = if (show) VISIBLE else GONE
    }

    private fun applyTransform() {
        val vw = texture.width.toFloat()
        val vh = texture.height.toFloat()
        if (vw <= 0f || vh <= 0f || videoW <= 0 || videoH <= 0) return
        val m = Matrix()
        if (fit != "fill") {
            val s = if (fit == "contain" || fit == "scale-down") min(vw / videoW, vh / videoH) else max(vw / videoW, vh / videoH)
            m.setScale(videoW * s / vw, videoH * s / vh, vw / 2f, vh / 2f)
        }
        texture.setTransform(m)
    }

    private fun releasePlayer() {
        player?.let {
            it.clearVideoTextureView(texture)
            it.release()
        }
        player = null
    }

    override fun release() {
        active = false
        main.removeCallbacksAndMessages(null)
        releasePlayer()
    }
}

// ── YouTube / página web ────────────────────────────────────────────────────

/**
 * [youtube]: carrega o embed como página principal e intercepta o HTML dele para:
 *  - enviar o cabeçalho Referer com o endereço do servidor (sem ele o YouTube mostra
 *    "Erro de configuração do player de vídeo");
 *  - injetar, antes dos scripts do YouTube, um ajuste que completa APIs ausentes nos
 *    navegadores antigos das boxes (queueMicrotask) e esconde o suporte a VP9/AV1, forçando
 *    H.264 — o WebView antigo decodifica VP9 com manchas verdes/rosa nas boxes Amlogic.
 */
class WebZone(ctx: Context, private val url: String?, private val youtube: Boolean = false) : FrameLayout(ctx), ZoneContent {

    private companion object {
        const val YT_PATCH = """<script>(function(){
if(!window.queueMicrotask){window.queueMicrotask=function(f){Promise.resolve().then(f)}}
var bad=/vp0?9|av0?1|vp8|webm/i;
var MS=window.MediaSource||window.WebKitMediaSource;
if(MS&&MS.isTypeSupported){var o=MS.isTypeSupported.bind(MS);MS.isTypeSupported=function(t){return bad.test(t)?false:o(t)}}
var cp=HTMLMediaElement.prototype.canPlayType;HTMLMediaElement.prototype.canPlayType=function(t){return bad.test(t)?'':cp.call(this,t)};
})();</script>"""
    }
    private var web: WebView? = null

    init {
        setBackgroundColor(Color.BLACK)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun start() {
        if (url == null || web != null) return
        val w = try {
            WebView(context)
        } catch (e: Exception) {
            addView(Ui.text(context, "Navegador indisponível neste aparelho", 14f, Ui.DIM).apply { gravity = Gravity.CENTER })
            return
        }
        w.setBackgroundColor(Color.BLACK)
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = userAgentString + " " + MediaCache.USER_AGENT
        }
        val referer = Prefs(context).serverUrl?.let { "$it/" } ?: "https://localhost/"
        w.webViewClient = if (youtube) YoutubeClient(url, referer) else WebViewClient()
        w.webChromeClient = WebChromeClient()
        w.isFocusable = false
        addView(w, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        // HashMap mutável: WebViews antigos alteram o mapa de cabeçalhos recebido
        if (youtube) w.loadUrl(url, hashMapOf("Referer" to referer)) else w.loadUrl(url)
        web = w
    }

    private class YoutubeClient(private val embedUrl: String, private val referer: String) : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            if (!request.isForMainFrame || request.method != "GET") return null
            val u = request.url.toString()
            if (!u.contains("/embed/")) return null
            return try {
                val conn = (URL(u).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15_000
                    readTimeout = 15_000
                    setRequestProperty("Referer", referer)
                    setRequestProperty("User-Agent", view.settings.userAgentString)
                    setRequestProperty("Accept-Language", "pt-BR,pt;q=0.9")
                }
                if (conn.responseCode != 200) return null
                var html = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                val head = Regex("<head[^>]*>", RegexOption.IGNORE_CASE).find(html)
                html = if (head != null) html.substring(0, head.range.last + 1) + YT_PATCH + html.substring(head.range.last + 1)
                else YT_PATCH + html
                WebResourceResponse("text/html", "utf-8", ByteArrayInputStream(html.toByteArray(Charsets.UTF_8)))
            } catch (e: Exception) {
                Log.w("WebZone", "Falha ao preparar embed do YouTube: ${e.message}")
                null
            }
        }
    }

    override fun release() {
        web?.let {
            it.stopLoading()
            it.loadUrl("about:blank")
            removeView(it)
            it.destroy()
        }
        web = null
    }
}

// ── Texto ───────────────────────────────────────────────────────────────────

class TextZone(ctx: Context, item: ZoneItem) : FrameLayout(ctx), ZoneContent {
    init {
        val cfg = item.content
        setBackgroundColor(ConfigParser.parseColor(cfgStr(cfg, "bgColor"), Color.BLACK))
        val align = when (cfgStr(cfg, "align")) {
            "left" -> Gravity.START
            "right" -> Gravity.END
            else -> Gravity.CENTER_HORIZONTAL
        }
        addView(
            TextView(ctx).apply {
                text = cfgStr(cfg, "text") ?: item.name
                setTextColor(ConfigParser.parseColor(cfgStr(cfg, "color"), Color.WHITE))
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, (cfg?.optDouble("fontSize", 48.0) ?: 48.0).toFloat())
                gravity = Gravity.CENTER_VERTICAL or align
                val p = Ui.dp(ctx, 20)
                setPadding(p, p, p, p)
            },
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
    }

    override fun start() {}
    override fun release() {}
}

// ── Relógio ─────────────────────────────────────────────────────────────────



class ClockZone(ctx: Context, item: ZoneItem) : LinearLayout(ctx), ZoneContent {
    private val main = Handler(Looper.getMainLooper())
    private val locale = Locale("pt", "BR")
    private val tz = zoneFor(cfgStr(item.content, "timezone") ?: "America/Sao_Paulo")
    private val timeFmt = SimpleDateFormat(if (cfgStr(item.content, "format") == "12h") "hh:mm:ss a" else "HH:mm:ss", locale).apply { timeZone = tz }
    private val dateFmt = SimpleDateFormat("EEEE, d 'de' MMMM 'de' yyyy", locale).apply { timeZone = tz }
    private val showDate = item.content?.optBoolean("showDate", true) ?: true
    private val color = ConfigParser.parseColor(cfgStr(item.content, "color"), Color.WHITE)

    private val time = TextView(ctx).apply {
        setTextColor(color)
        typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
        setTextSize(TypedValue.COMPLEX_UNIT_PX, Ui.vw(ctx) * 8)
        includeFontPadding = false
        gravity = Gravity.CENTER
    }
    private val date = TextView(ctx).apply {
        setTextColor(color)
        alpha = 0.7f
        setTextSize(TypedValue.COMPLEX_UNIT_PX, Ui.vw(ctx) * 2)
        gravity = Gravity.CENTER
    }
    private val tick = object : Runnable {
        override fun run() {
            val now = Date()
            time.text = timeFmt.format(now)
            date.text = dateFmt.format(now)
            main.postDelayed(this, 1000 - System.currentTimeMillis() % 1000)
        }
    }

    init {
        orientation = VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(ConfigParser.parseColor(cfgStr(item.content, "bgColor"), Color.BLACK))
        addView(time)
        if (showDate) addView(date, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = Ui.dp(ctx, 8) })
    }

    override fun start() {
        main.removeCallbacks(tick)
        main.post(tick)
    }

    override fun release() {
        main.removeCallbacks(tick)
    }
}

// ── Tabela de preços ────────────────────────────────────────────────────────

class PriceboardZone(ctx: Context, item: ZoneItem) : LinearLayout(ctx), ZoneContent {
    init {
        val cfg = item.content
        val accent = ConfigParser.parseColor(cfgStr(cfg, "accentColor"), Color.parseColor("#DC2626"))
        val currency = cfgStr(cfg, "currency") ?: "R$"
        val vw = Ui.vw(ctx)
        val p = Ui.dp(ctx, 20)
        orientation = VERTICAL
        setPadding(p, p, p, p)
        setBackgroundColor(ConfigParser.parseColor(cfgStr(cfg, "bgColor"), Color.BLACK))

        cfgStr(cfg, "title")?.let { title ->
            addView(TextView(ctx).apply {
                text = title
                setTextColor(accent)
                typeface = Typeface.DEFAULT_BOLD
                setTextSize(TypedValue.COMPLEX_UNIT_PX, vw * 3)
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, Ui.dp(ctx, 16))
            })
            addView(View(ctx).apply { setBackgroundColor(accent) }, LayoutParams(LayoutParams.MATCH_PARENT, Ui.dp(ctx, 2)).apply { bottomMargin = Ui.dp(ctx, 12) })
        }

        val items = cfg?.optJSONArray("items")
        if (items != null) for (i in 0 until items.length()) {
            val row = items.optJSONObject(i) ?: continue
            val line = LinearLayout(ctx).apply {
                orientation = HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, Ui.dp(ctx, 8), 0, Ui.dp(ctx, 8))
            }
            line.addView(TextView(ctx).apply {
                text = ConfigParser.str(row, "name") ?: ""
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_PX, vw * 2.2f)
            }, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
            line.addView(TextView(ctx).apply {
                text = "$currency ${ConfigParser.str(row, "price") ?: ""}"
                setTextColor(accent)
                typeface = Typeface.DEFAULT_BOLD
                setTextSize(TypedValue.COMPLEX_UNIT_PX, vw * 2.2f)
            })
            addView(line)
            addView(View(ctx).apply { setBackgroundColor(Color.argb(26, 255, 255, 255)) }, LayoutParams(LayoutParams.MATCH_PARENT, 1))
        }
    }

    override fun start() {}
    override fun release() {}
}
