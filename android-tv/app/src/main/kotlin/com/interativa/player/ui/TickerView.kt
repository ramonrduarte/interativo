package com.interativa.player.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.text.TextPaint
import android.view.Choreographer
import android.view.View
import com.interativa.player.TickerCfg
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Faixa de texto rolando, desenhada a cada quadro (Choreographer) — sem as
 * travadas da animação CSS em boxes fracas.
 * Velocidade igual ao Ticker.jsx: duração = max(5, round(len * 0.18 / (speed / 60))) s
 * para atravessar de 100vw até -100% da largura do texto.
 */
class TickerView(ctx: Context) : View(ctx), Choreographer.FrameCallback {

    private val paint = TextPaint(Paint.ANTI_ALIAS_FLAG)
    private val sidePad = Ui.dp(ctx, 40).toFloat()
    private var cfg: TickerCfg? = null
    private var textWidth = 0f
    private var x = Float.NaN
    private var pxPerSec = 0f
    private var lastFrameNs = 0L
    private var running = false

    fun bind(newCfg: TickerCfg?) {
        if (newCfg == cfg) return
        cfg = newCfg
        if (newCfg == null) {
            stop()
            return
        }
        paint.color = newCfg.color
        paint.textSize = Ui.dp(context, newCfg.fontSizeDp).toFloat()
        textWidth = paint.measureText(newCfg.text) + sidePad * 2
        x = Float.NaN
        computeSpeed()
        if (isAttachedToWindow) start()
        invalidate()
    }

    private fun computeSpeed() {
        val c = cfg ?: return
        val factor = (c.speed / 60.0).takeIf { it > 0 && !it.isNaN() } ?: 1.0
        val durationSec = max(5.0, (c.text.length * 0.18 / factor).roundToInt().toDouble())
        val viewport = if (width > 0) width.toFloat() else resources.displayMetrics.widthPixels.toFloat()
        pxPerSec = ((viewport + textWidth) / durationSec).toFloat()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        computeSpeed()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (cfg != null) start()
    }

    override fun onDetachedFromWindow() {
        stop()
        super.onDetachedFromWindow()
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (visibility == VISIBLE && cfg != null && isAttachedToWindow) start() else if (visibility != VISIBLE) stop()
    }

    private fun start() {
        if (running) return
        running = true
        lastFrameNs = 0L
        Choreographer.getInstance().postFrameCallback(this)
    }

    private fun stop() {
        running = false
        Choreographer.getInstance().removeFrameCallback(this)
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        if (lastFrameNs != 0L && !x.isNaN()) {
            val dt = ((frameTimeNanos - lastFrameNs) / 1_000_000_000.0).toFloat().coerceAtMost(0.1f)
            x -= pxPerSec * dt
            if (x < -textWidth) x = width.toFloat()
        }
        lastFrameNs = frameTimeNanos
        invalidate()
        Choreographer.getInstance().postFrameCallback(this)
    }

    override fun onDraw(canvas: Canvas) {
        val c = cfg ?: return
        canvas.drawColor(c.bgColor)
        if (x.isNaN()) x = width.toFloat()
        val baseline = height / 2f - (paint.descent() + paint.ascent()) / 2f
        canvas.drawText(c.text, x + sidePad, baseline, paint)
    }
}
