package com.interativa.player.ui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.interativa.player.BuildConfig

/** Telas de configuração inicial, todas navegáveis pelo controle remoto. */
object SetupScreens {

    private fun page(ctx: Context, title: String, subtitle: String?, card: View): View {
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            val p = Ui.dp(ctx, 32)
            setPadding(p, p, p, p)
        }
        val centered = { LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { gravity = Gravity.CENTER_HORIZONTAL } }
        col.addView(Ui.text(ctx, "📺  Interativa TV", 15f, Ui.MUTED).apply { letterSpacing = 0.05f }, centered())
        col.addView(Ui.text(ctx, title, 28f, Ui.TEXT, bold = true).apply {
            gravity = Gravity.CENTER
            setPadding(0, Ui.dp(ctx, 10), 0, Ui.dp(ctx, 6))
        })
        if (subtitle != null) col.addView(Ui.text(ctx, subtitle, 16f, Ui.MUTED).apply {
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, Ui.dp(ctx, 24))
        })
        col.addView(card)
        col.addView(Ui.text(ctx, "v${BuildConfig.VERSION_NAME}", 12f, Ui.DIM).apply { setPadding(0, Ui.dp(ctx, 20), 0, 0) }, centered())

        val scroll = ScrollView(ctx).apply {
            isFillViewport = true
            setBackgroundColor(Ui.BG)
            isFocusable = false
        }
        val center = FrameLayout(ctx)
        center.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        scroll.addView(center, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        return scroll
    }

    private fun card(ctx: Context, widthDp: Int = 440) = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        background = Ui.rounded(Ui.CARD, Ui.dp(ctx, 16), Ui.dp(ctx, 1), Color.parseColor("#1F2937"))
        val p = Ui.dp(ctx, 28)
        setPadding(p, p, p, p)
        layoutParams = LinearLayout.LayoutParams(Ui.dp(ctx, widthDp), ViewGroup.LayoutParams.WRAP_CONTENT)
    }

    private fun gapParams(ctx: Context, gapDp: Int = 14) =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = Ui.dp(ctx, gapDp) }

    private fun errorText(ctx: Context, msg: String?) = Ui.text(ctx, msg.orEmpty(), 14f, Ui.ERROR).apply {
        gravity = Gravity.CENTER
        visibility = if (msg.isNullOrBlank()) View.GONE else View.VISIBLE
    }

    // ── Boas-vindas ──────────────────────────────────────────────────────────

    fun welcome(ctx: Context, error: String?, onCode: () -> Unit, onLogin: () -> Unit): View {
        val c = card(ctx)
        c.addView(errorText(ctx, error), gapParams(ctx))
        val first = Ui.button(ctx, "🔢  Parear com código") { onCode() }
        c.addView(first, gapParams(ctx))
        c.addView(Ui.text(ctx, "Informe o código da empresa; a TV mostra um código e você confirma no painel em Telas → Parear TV.", 13f, Ui.DIM), gapParams(ctx, 22))
        c.addView(Ui.button(ctx, "👤  Entrar com usuário e senha", primary = false) { onLogin() }, gapParams(ctx))
        c.addView(Ui.text(ctx, "Vincula a TV à sua empresa antes de mostrar o código.", 13f, Ui.DIM))
        first.post { first.requestFocus() }
        return page(ctx, "Conectar esta TV", "Como deseja conectar esta TV ao sistema?", c)
    }

    // ── Endereço do servidor ─────────────────────────────────────────────────

    class Form(val view: View, val setBusy: (Boolean, String?) -> Unit)

    fun serverForm(
        ctx: Context,
        initialUrl: String?,
        initialCompany: String?,
        error: String?,
        onSubmit: (url: String, company: String) -> Unit,
        onBack: () -> Unit,
    ): Form {
        val c = card(ctx)
        val url = Ui.field(ctx, "Endereço do servidor", uri = true).apply { setText(initialUrl.orEmpty()) }
        val company = Ui.field(ctx, "Código da empresa").apply {
            setText(initialCompany.orEmpty())
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            filters = arrayOf(android.text.InputFilter.AllCaps())
        }
        c.addView(Ui.text(ctx, "Ex.: interativa.suaempresa.com.br ou 192.168.0.110:3001", 13f, Ui.DIM), gapParams(ctx, 10))
        c.addView(url, gapParams(ctx, 18))
        c.addView(Ui.text(ctx, "Código da empresa: aparece no painel em Telas → Link de acesso da TV", 13f, Ui.DIM), gapParams(ctx, 10))
        c.addView(company, gapParams(ctx))
        val err = errorText(ctx, error)
        c.addView(err, gapParams(ctx))
        lateinit var submit: android.widget.Button
        submit = Ui.button(ctx, "Continuar") { onSubmit(url.text.toString(), company.text.toString()) }
        Ui.onImeDone(company) { submit.performClick() }
        c.addView(submit, gapParams(ctx, 10))
        c.addView(Ui.button(ctx, "Voltar", primary = false) { onBack() }, gapParams(ctx, 0))
        url.post { url.requestFocus() }
        return Form(page(ctx, "Servidor", "Informe o endereço do sistema Interativa", c)) { busy, msg ->
            submit.isEnabled = !busy
            submit.text = if (busy) "Verificando…" else "Continuar"
            err.text = msg.orEmpty()
            err.visibility = if (msg.isNullOrBlank()) View.GONE else View.VISIBLE
        }
    }

    // ── Login ────────────────────────────────────────────────────────────────

    fun loginForm(ctx: Context, initialUrl: String?, onSubmit: (url: String, user: String, pass: String) -> Unit, onBack: () -> Unit): Form {
        val c = card(ctx)
        val url = Ui.field(ctx, "Endereço do servidor", uri = true).apply { setText(initialUrl.orEmpty()) }
        val user = Ui.field(ctx, "Usuário ou e-mail")
        val pass = Ui.field(ctx, "Senha", password = true)
        c.addView(url, gapParams(ctx, 12))
        c.addView(user, gapParams(ctx, 12))
        c.addView(pass, gapParams(ctx))
        val err = errorText(ctx, null)
        c.addView(err, gapParams(ctx))
        lateinit var submit: android.widget.Button
        submit = Ui.button(ctx, "Entrar") { onSubmit(url.text.toString(), user.text.toString(), pass.text.toString()) }
        Ui.onImeDone(pass) { submit.performClick() }
        c.addView(submit, gapParams(ctx, 10))
        c.addView(Ui.button(ctx, "Voltar", primary = false) { onBack() }, gapParams(ctx, 0))
        (if (initialUrl.isNullOrBlank()) url else user).let { f -> f.post { f.requestFocus() } }
        return Form(page(ctx, "Entrar", "Use o mesmo acesso do painel", c)) { busy, msg ->
            submit.isEnabled = !busy
            submit.text = if (busy) "Entrando…" else "Entrar"
            err.text = msg.orEmpty()
            err.visibility = if (msg.isNullOrBlank()) View.GONE else View.VISIBLE
        }
    }

    // ── Código de pareamento ─────────────────────────────────────────────────

    class Pairing(val view: View, val setConnected: (Boolean) -> Unit, val setSuccess: () -> Unit)

    fun pairing(ctx: Context, code: String, serverUrl: String, onBack: () -> Unit): Pairing {
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        col.addView(Ui.text(ctx, "No painel, abra Telas → Parear TV e digite o código:", 18f, Ui.MUTED).apply {
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, Ui.dp(ctx, 24))
        })

        val boxes = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        code.forEach { ch ->
            boxes.addView(TextView(ctx).apply {
                text = ch.toString()
                textSize = 48f
                typeface = Typeface.MONOSPACE
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                background = Ui.rounded(Ui.CARD, Ui.dp(ctx, 12), Ui.dp(ctx, 2), Ui.ACCENT)
            }, LinearLayout.LayoutParams(Ui.dp(ctx, 76), Ui.dp(ctx, 92)).apply { setMargins(Ui.dp(ctx, 6), 0, Ui.dp(ctx, 6), 0) })
        }
        col.addView(boxes)

        val status = Ui.text(ctx, "Conectando ao servidor…", 15f, Ui.DIM).apply {
            gravity = Gravity.CENTER
            setPadding(0, Ui.dp(ctx, 28), 0, Ui.dp(ctx, 6))
        }
        col.addView(status)
        col.addView(Ui.text(ctx, serverUrl, 13f, Color.parseColor("#4B5563")).apply { gravity = Gravity.CENTER })
        val back = Ui.button(ctx, "Voltar", primary = false) { onBack() }
        col.addView(back, LinearLayout.LayoutParams(Ui.dp(ctx, 220), ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = Ui.dp(ctx, 28) })

        val root = FrameLayout(ctx).apply { setBackgroundColor(Ui.BG) }
        root.addView(Ui.text(ctx, "📺  Interativa TV", 18f, Ui.MUTED), FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.CENTER_HORIZONTAL,
        ).apply { topMargin = Ui.dp(ctx, 36) })
        root.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        back.post { back.requestFocus() }

        return Pairing(
            root,
            setConnected = { ok ->
                status.text = if (ok) "● Aguardando pareamento…" else "○ Sem conexão com o servidor — tentando novamente…"
                status.setTextColor(if (ok) Ui.ACCENT_FOCUS else Ui.WARN)
            },
            setSuccess = {
                boxes.visibility = View.GONE
                back.visibility = View.GONE
                status.text = "✓ Pareado com sucesso! Carregando conteúdo…"
                status.textSize = 22f
                status.setTextColor(Ui.SUCCESS)
            },
        )
    }
}
