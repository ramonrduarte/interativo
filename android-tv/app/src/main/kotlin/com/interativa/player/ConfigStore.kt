package com.interativa.player

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * Guarda o último "config:update" recebido. A TV volta a exibir o conteúdo
 * imediatamente ao ligar, mesmo antes de conectar (ou sem internet).
 */
object ConfigStore {
    private const val FILE = "config.json"

    @Volatile private var cached: TvConfig? = null

    @Synchronized
    fun save(ctx: Context, raw: JSONObject) {
        val dir = ctx.applicationContext.filesDir
        val tmp = File(dir, "$FILE.tmp")
        tmp.writeText(raw.toString())
        tmp.renameTo(File(dir, FILE))
        cached = null
    }

    @Synchronized
    fun load(ctx: Context): TvConfig? {
        cached?.let { return it }
        val f = File(ctx.applicationContext.filesDir, FILE)
        if (!f.exists()) return null
        val base = Prefs(ctx).serverUrl.orEmpty()
        return runCatching { ConfigParser.parse(JSONObject(f.readText()), base) }.getOrNull()?.also { cached = it }
    }

    @Synchronized
    fun clear(ctx: Context) {
        File(ctx.applicationContext.filesDir, FILE).delete()
        cached = null
    }

    /** Considera a agenda do painel e o ligar/desligar manual feito pelo menu. */
    fun shouldBeOnNow(ctx: Context, now: Long = System.currentTimeMillis()): Boolean {
        val prefs = Prefs(ctx)
        if (prefs.overrideUntil > now) return prefs.overrideOn
        return load(ctx)?.power?.isOnAt(now) ?: true
    }

    /** Próximo momento em que [shouldBeOnNow] pode mudar (agenda ou fim do modo manual). */
    fun nextPowerChange(ctx: Context, now: Long = System.currentTimeMillis()): Long? {
        val candidates = mutableListOf<Long>()
        Prefs(ctx).overrideUntil.takeIf { it > now }?.let(candidates::add)
        load(ctx)?.power?.nextChangeAfter(now)?.let(candidates::add)
        return candidates.minOrNull()
    }
}
