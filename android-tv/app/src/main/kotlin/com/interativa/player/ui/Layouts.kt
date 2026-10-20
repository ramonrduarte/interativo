package com.interativa.player.ui

import android.content.Context
import android.view.View
import android.view.ViewGroup

/**
 * Gira o conteúdo -90° para TVs em pé — mesma transformação do tv.css:
 * `transform: rotate(-90deg) translateX(-100vh)`.
 * O filho é medido com largura/altura trocadas.
 */
class RotatableLayout(ctx: Context) : ViewGroup(ctx) {

    var portrait = false
        set(v) {
            if (field != v) {
                field = v
                requestLayout()
            }
        }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        val cw = if (portrait) h else w
        val ch = if (portrait) w else h
        for (i in 0 until childCount) {
            getChildAt(i).measure(
                MeasureSpec.makeMeasureSpec(cw, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(ch, MeasureSpec.EXACTLY),
            )
        }
        setMeasuredDimension(w, h)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val w = r - l
        val h = b - t
        for (i in 0 until childCount) {
            val c = getChildAt(i)
            if (portrait) {
                c.layout(0, 0, h, w)
                c.pivotX = 0f
                c.pivotY = 0f
                c.rotation = -90f
                c.translationX = 0f
                c.translationY = h.toFloat()
            } else {
                c.layout(0, 0, w, h)
                c.rotation = 0f
                c.translationX = 0f
                c.translationY = 0f
            }
        }
    }
}

/**
 * Grade de zonas equivalente às classes .layout-* do tv.css
 * (grid-template-columns / rows com gap de 2px).
 */
open class ZoneGridLayout(ctx: Context, template: String) : ViewGroup(ctx) {

    private val cols: FloatArray
    private val rows: FloatArray
    private val gap = Ui.dp(ctx, 2)

    init {
        val (c, r) = specFor(template)
        cols = c
        rows = r
        setBackgroundColor(android.graphics.Color.BLACK)
    }

    val cellCount: Int get() = cols.size * rows.size

    private fun spans(total: Int, weights: FloatArray): IntArray {
        val free = (total - gap * (weights.size - 1)).coerceAtLeast(0)
        val sum = weights.sum()
        val out = IntArray(weights.size)
        var used = 0
        for (i in weights.indices) {
            out[i] = if (i == weights.lastIndex) free - used else (free * weights[i] / sum).toInt()
            used += out[i]
        }
        return out
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        val cw = spans(w, cols)
        val rh = spans(h, rows)
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            if (i >= cellCount) {
                child.measure(MeasureSpec.makeMeasureSpec(0, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.EXACTLY))
                continue
            }
            child.measure(
                MeasureSpec.makeMeasureSpec(cw[i % cols.size], MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(rh[i / cols.size], MeasureSpec.EXACTLY),
            )
        }
        setMeasuredDimension(w, h)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val cw = spans(r - l, cols)
        val rh = spans(b - t, rows)
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            if (i >= cellCount) {
                child.layout(0, 0, 0, 0)
                continue
            }
            val col = i % cols.size
            val row = i / cols.size
            var x = 0
            for (c in 0 until col) x += cw[c] + gap
            var y = 0
            for (rr in 0 until row) y += rh[rr] + gap
            child.layout(x, y, x + cw[col], y + rh[row])
        }
    }

    companion object {
        private fun f(vararg v: Int) = FloatArray(v.size) { v[it].toFloat() }

        /** (colunas, linhas) de cada template. */
        fun specFor(template: String): Pair<FloatArray, FloatArray> = when (template) {
            "split5050" -> f(1, 1) to f(1)
            "split7030" -> f(7, 3) to f(1)
            "topbottom", "v-half" -> f(1) to f(1, 1)
            "grid2x2", "v-grid2x2" -> f(1, 1) to f(1, 1)
            "mainbanner", "v-mainbanner" -> f(1) to f(5, 1)
            "v-7030" -> f(1) to f(7, 3)
            "v-thirds" -> f(1) to f(1, 1, 1)
            else -> f(1) to f(1) // fullscreen, v-fullscreen
        }
    }
}

/** Utilitário: LayoutParams que preenchem o pai. */
fun matchParent() = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

fun View.removeFromParent() {
    (parent as? ViewGroup)?.removeView(this)
}
