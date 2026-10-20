package com.interativa.player.ui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView

/** Paleta e componentes das telas de configuração (pensados para controle remoto). */
object Ui {
    val BG = Color.parseColor("#0A0C10")
    val CARD = Color.parseColor("#111827")
    val FIELD = Color.parseColor("#1F2937")
    val BORDER = Color.parseColor("#374151")
    val ACCENT = Color.parseColor("#2D6EF5")
    val ACCENT_FOCUS = Color.parseColor("#5B8DFF")
    val TEXT = Color.parseColor("#F9FAFB")
    val MUTED = Color.parseColor("#9CA3AF")
    val DIM = Color.parseColor("#6B7280")
    val ERROR = Color.parseColor("#EF4444")
    val SUCCESS = Color.parseColor("#22C55E")
    val WARN = Color.parseColor("#F6A623")
    val ZONE_BG = Color.parseColor("#111111")

    fun dp(ctx: Context, v: Number): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), ctx.resources.displayMetrics).toInt()

    /** 1vw como no app web: 1% da largura física da tela. */
    fun vw(ctx: Context): Float {
        val m = ctx.resources.displayMetrics
        return maxOf(m.widthPixels, m.heightPixels) / 100f
    }

    fun rounded(color: Int, radiusPx: Int, strokePx: Int = 0, strokeColor: Int = Color.TRANSPARENT) =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = radiusPx.toFloat()
            if (strokePx > 0) setStroke(strokePx, strokeColor)
        }

    fun text(ctx: Context, value: CharSequence, sizeSp: Float, color: Int = TEXT, bold: Boolean = false) =
        TextView(ctx).apply {
            text = value
            textSize = sizeSp
            setTextColor(color)
            if (bold) typeface = Typeface.DEFAULT_BOLD
        }

    /** Botão com destaque bem visível quando focado pelo controle. */
    fun button(ctx: Context, label: String, primary: Boolean = true, onClick: () -> Unit): Button {
        val r = dp(ctx, 10)
        val base = if (primary) ACCENT else FIELD
        val focused = if (primary) ACCENT_FOCUS else BORDER
        val bg = StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), rounded(focused, r, dp(ctx, 3), Color.WHITE))
            addState(intArrayOf(android.R.attr.state_pressed), rounded(focused, r, dp(ctx, 3), Color.WHITE))
            addState(intArrayOf(), rounded(base, r))
        }
        return Button(ctx).apply {
            text = label
            isAllCaps = false
            textSize = 17f
            setTextColor(Color.WHITE)
            background = bg
            stateListAnimator = null
            isFocusable = true
            isFocusableInTouchMode = false
            minHeight = dp(ctx, 56)
            setPadding(dp(ctx, 24), 0, dp(ctx, 24), 0)
            setOnClickListener { onClick() }
        }
    }

    fun field(ctx: Context, hint: String, password: Boolean = false, uri: Boolean = false): EditText {
        val r = dp(ctx, 10)
        val bg = StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), rounded(FIELD, r, dp(ctx, 3), ACCENT_FOCUS))
            addState(intArrayOf(), rounded(FIELD, r, dp(ctx, 1), BORDER))
        }
        return EditText(ctx).apply {
            this.hint = hint
            setSingleLine(true)
            inputType = when {
                password -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                uri -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
                else -> InputType.TYPE_CLASS_TEXT
            }
            setTextColor(TEXT)
            setHintTextColor(DIM)
            textSize = 17f
            background = bg
            minHeight = dp(ctx, 56)
            setPadding(dp(ctx, 16), 0, dp(ctx, 16), 0)
            gravity = Gravity.CENTER_VERTICAL
        }
    }

    /** Tecla "OK/Ir" do teclado da TV envia o formulário. */
    fun onImeDone(field: EditText, action: () -> Unit) {
        field.imeOptions = EditorInfo.IME_ACTION_GO
        field.setOnEditorActionListener { _, id, event ->
            val enter = event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_UP
            if (id == EditorInfo.IME_ACTION_GO || id == EditorInfo.IME_ACTION_DONE || enter) {
                action(); true
            } else false
        }
    }

    fun View.visibleIf(v: Boolean) {
        visibility = if (v) View.VISIBLE else View.GONE
    }
}
