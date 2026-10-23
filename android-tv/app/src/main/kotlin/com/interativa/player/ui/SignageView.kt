package com.interativa.player.ui

import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import coil.imageLoader
import coil.request.CachePolicy
import coil.request.ImageRequest
import com.interativa.player.Slide
import com.interativa.player.TvConfig

/** Um slide: grade de zonas do template, cada zona com seu conteúdo. */
class SlideView(ctx: Context, slide: Slide, onVideoEnd: (() -> Unit)?) : ZoneGridLayout(ctx, slide.template) {
    private val contents = mutableListOf<ZoneContent>()

    init {
        slide.zoneLabels.forEachIndexed { i, label ->
            val v = runCatching { ZoneFactory.create(ctx, slide.zones[i], label, onVideoEnd) }
                .onFailure { Log.e(TAG, "Erro ao criar zona $i", it) }
                .getOrElse { EmptyZone(ctx, label) }
            addView(v)
            (v as? ZoneContent)?.let(contents::add)
        }
    }

    // Uma zona com problema nunca derruba o app inteiro
    private inline fun each(action: String, block: (ZoneContent) -> Unit) = contents.forEach { z ->
        runCatching { block(z) }.onFailure { Log.e(TAG, "Erro em $action de ${z.javaClass.simpleName}", it) }
    }

    fun start() = each("start") { it.start() }
    fun release() = each("release") { it.release() }
    fun restartMedia() = each("restart") { it.restart() }

    private companion object { const val TAG = "SlideView" }
}

/**
 * Motor de exibição — equivalente ao LayoutEngine.jsx:
 * troca slides pela duração (ou fim do vídeo), mantém a faixa de texto,
 * gira tudo para TVs em pé e faz transição suave entre slides.
 */
class SignageView(ctx: Context) : FrameLayout(ctx) {

    private val main = Handler(Looper.getMainLooper())
    private val rotatable = RotatableLayout(ctx)
    private val column = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
    private val stage = FrameLayout(ctx).apply { setBackgroundColor(Color.BLACK) }
    private val ticker = TickerView(ctx)
    private val badge = TextView(ctx).apply {
        text = "⚠ Reconectando…"
        textSize = 13f
        setTextColor(Ui.WARN)
        background = Ui.rounded(Color.argb(179, 0, 0, 0), Ui.dp(ctx, 6))
        setPadding(Ui.dp(ctx, 12), Ui.dp(ctx, 6), Ui.dp(ctx, 12), Ui.dp(ctx, 6))
        visibility = GONE
    }

    // Aviso de atualização de conteúdo (canto superior esquerdo)
    private val syncBadge = TextView(ctx).apply {
        textSize = 13f
        setTextColor(Color.WHITE)
        background = Ui.rounded(Color.argb(200, 15, 23, 42), Ui.dp(ctx, 8))
        setPadding(Ui.dp(ctx, 12), Ui.dp(ctx, 7), Ui.dp(ctx, 12), Ui.dp(ctx, 7))
        visibility = GONE
    }
    private val hideSync = Runnable { syncBadge.visibility = GONE }

    private var config: TvConfig? = null
    private var index = 0
    private var current: SlideView? = null
    private var placeholder: View? = null
    private val advanceRunnable = Runnable { advance() }

    init {
        setBackgroundColor(Color.BLACK)
        column.addView(stage, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        column.addView(ticker, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Ui.dp(ctx, 60)))
        ticker.visibility = GONE
        rotatable.addView(column)
        addView(rotatable, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(badge, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END).apply {
            setMargins(0, Ui.dp(ctx, 12), Ui.dp(ctx, 12), 0)
        })
        addView(syncBadge, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START).apply {
            setMargins(Ui.dp(ctx, 12), Ui.dp(ctx, 12), 0, 0)
        })
    }

    fun setConnected(connected: Boolean) {
        badge.visibility = if (connected || config == null) GONE else VISIBLE
    }

    /** Mostra o andamento; [ok] = terminou (some sozinho depois de alguns segundos). */
    fun showSync(text: String, ok: Boolean = false) {
        main.removeCallbacks(hideSync)
        syncBadge.text = text
        syncBadge.setTextColor(if (ok) Color.parseColor("#86EFAC") else Color.WHITE)
        syncBadge.visibility = VISIBLE
        if (ok) main.postDelayed(hideSync, 6_000)
    }

    fun hideSync() {
        main.removeCallbacks(hideSync)
        syncBadge.visibility = GONE
    }

    /** Configuração em exibição (null se nada está sendo mostrado). */
    val displayed: TvConfig? get() = config

    val isShowing: Boolean get() = current != null || placeholder != null

    /** Aplica uma configuração nova. Só reinicia os slides se eles mudaram de verdade. */
    fun apply(cfg: TvConfig) {
        val old = config
        config = cfg
        rotatable.portrait = cfg.portrait
        ticker.bind(cfg.ticker)
        ticker.visibility = if (cfg.ticker != null) VISIBLE else GONE
        prefetchImages(cfg)
        val changed = old == null || old.slidesSignature != cfg.slidesSignature
        if (changed || !isShowing) {
            index = 0
            showSlide(animate = old != null)
        }
    }

    /** Para tudo e libera players (fora do horário / app em segundo plano). */
    fun stop() {
        main.removeCallbacks(advanceRunnable)
        current?.release()
        current = null
        placeholder = null
        stage.removeAllViews()
        ticker.bind(null)
        ticker.visibility = GONE
        config = null
    }

    private fun showSlide(animate: Boolean) {
        main.removeCallbacks(advanceRunnable)
        val cfg = config ?: return
        if (cfg.slides.isEmpty()) {
            replaceWith(null, emptyMessage("Nenhum slide configurado"), animate)
            return
        }
        val slide = cfg.slides[index % cfg.slides.size]
        var fired = false
        val onEnd: (() -> Unit)? = if (slide.useVideoDuration) {
            { main.post { if (!fired) { fired = true; advance() } } }
        } else null
        val view = SlideView(context, slide, onEnd)
        replaceWith(view, view, animate)
        // Vídeo com "duração do vídeo": avança no fim, com +3 s de segurança (igual ao web)
        val delay = (slide.durationSec + if (slide.useVideoDuration) 3 else 0) * 1000L
        main.postDelayed(advanceRunnable, delay)
    }

    private fun advance() {
        val cfg = config ?: return
        val n = cfg.slides.size
        if (n == 0) return
        if (n == 1) {
            // Um único slide: mantém as zonas e só reinicia o vídeo, se houver
            if (cfg.slides[0].useVideoDuration) current?.restartMedia()
            val s = cfg.slides[0]
            main.postDelayed(advanceRunnable, (s.durationSec + if (s.useVideoDuration) 3 else 0) * 1000L)
            return
        }
        index = (index + 1) % n
        showSlide(animate = true)
    }

    private fun replaceWith(slide: SlideView?, view: View, animate: Boolean) {
        // Libera os players do slide anterior antes de iniciar o próximo:
        // boxes fracas têm poucos decodificadores de vídeo.
        val oldViews = (0 until stage.childCount).map { stage.getChildAt(it) }
        current?.release()
        current = slide
        placeholder = if (slide == null) view else null

        stage.addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        slide?.start()
        if (animate && oldViews.isNotEmpty()) {
            view.alpha = 0f
            view.animate().alpha(1f).setDuration(450).withEndAction {
                oldViews.forEach { stage.removeView(it) }
            }.start()
        } else {
            oldViews.forEach { stage.removeView(it) }
        }
    }

    private fun emptyMessage(msg: String) = FrameLayout(context).apply {
        setBackgroundColor(Ui.ZONE_BG)
        addView(Ui.text(context, msg, 18f, Color.parseColor("#444444")).apply { gravity = Gravity.CENTER },
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    /**
     * Baixa para o disco todas as imagens da programação (exibição offline e sem atraso).
     * Decodifica em tamanho mínimo: o que interessa aqui é o arquivo no cache de disco.
     */
    private fun prefetchImages(cfg: TvConfig) {
        val loader = context.imageLoader
        cfg.allSlides.flatMap { it.zones.values }.filter { it.type == "image" && it.url != null }.distinctBy { it.url }.forEach {
            loader.enqueue(
                ImageRequest.Builder(context)
                    .data(it.url)
                    .size(64, 64)
                    .memoryCachePolicy(CachePolicy.DISABLED)
                    .build(),
            )
        }
    }
}

/** Tela de "TV desligada" (fora do horário). Preta, com um aviso discreto. */
class StandbyView(ctx: Context) : FrameLayout(ctx) {
    private val label = Ui.text(ctx, "", 14f, Color.parseColor("#333333")).apply { gravity = Gravity.CENTER }

    init {
        setBackgroundColor(Color.BLACK)
        isClickable = true
        addView(label, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
            bottomMargin = Ui.dp(ctx, 24)
        })
    }

    fun setMessage(msg: String) {
        label.text = msg
    }
}
