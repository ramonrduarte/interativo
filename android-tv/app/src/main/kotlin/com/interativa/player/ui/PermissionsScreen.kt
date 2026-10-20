package com.interativa.player.ui

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView

/** Uma permissão/ajuste do assistente "Configurar esta TV". */
class SetupStep(
    val title: String,
    val description: String,
    val done: Boolean,
    val optional: Boolean = false,
    val actionLabel: String = "Ativar",
    val action: () -> Unit,
)

/**
 * Assistente com a lista de permissões: cada item tem um botão que abre a tela certa do
 * sistema; ao voltar para o app a lista é recarregada e o item aparece com ✓.
 */
object PermissionsScreen {

    fun build(ctx: Context, steps: List<SetupStep>, onFinish: () -> Unit): View {
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val p = Ui.dp(ctx, 32)
            setPadding(p, p, p, p)
        }
        col.addView(Ui.text(ctx, "Configurar esta TV", 28f, Ui.TEXT, bold = true).apply { gravity = Gravity.CENTER })
        val pending = steps.count { !it.done && !it.optional }
        col.addView(Ui.text(
            ctx,
            if (pending == 0) "Tudo pronto! A TV vai ligar, desligar e abrir o conteúdo sozinha."
            else "Faltam $pending ajuste(s) para a TV funcionar sozinha. Selecione “Ativar” e confirme na tela que abrir.",
            15f, Ui.MUTED,
        ).apply {
            gravity = Gravity.CENTER
            setPadding(0, Ui.dp(ctx, 8), 0, Ui.dp(ctx, 20))
        })

        var firstButton: View? = null
        steps.forEach { step ->
            val row = LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = Ui.rounded(Ui.CARD, Ui.dp(ctx, 12), Ui.dp(ctx, 1), Color.parseColor("#1F2937"))
                val p = Ui.dp(ctx, 16)
                setPadding(p, p, p, p)
            }
            row.addView(Ui.text(ctx, if (step.done) "✅" else if (step.optional) "⚪" else "⚠️", 22f).apply {
                setPadding(0, 0, Ui.dp(ctx, 14), 0)
            })
            val texts = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
            texts.addView(Ui.text(ctx, step.title + if (step.optional) "  (opcional)" else "", 17f, Ui.TEXT, bold = true))
            texts.addView(Ui.text(ctx, step.description, 13f, Ui.DIM))
            row.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            if (!step.done) {
                val b = Ui.button(ctx, step.actionLabel, primary = !step.optional) { step.action() }
                row.addView(b, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    marginStart = Ui.dp(ctx, 14)
                })
                if (firstButton == null && !step.optional) firstButton = b
            }
            col.addView(row, LinearLayout.LayoutParams(Ui.dp(ctx, 620), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = Ui.dp(ctx, 12)
                gravity = Gravity.CENTER_HORIZONTAL
            })
        }

        val finish = Ui.button(ctx, if (pending == 0) "Concluir" else "Continuar depois", primary = pending == 0) { onFinish() }
        col.addView(finish, LinearLayout.LayoutParams(Ui.dp(ctx, 280), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = Ui.dp(ctx, 10)
            gravity = Gravity.CENTER_HORIZONTAL
        })
        (firstButton ?: finish).let { b -> b.post { b.requestFocus() } }

        val center = FrameLayout(ctx)
        center.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        return ScrollView(ctx).apply {
            isFillViewport = true
            setBackgroundColor(Ui.BG)
            addView(center, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
    }
}
