package com.interativa.player

import android.graphics.Color
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone

/**
 * Boxes com Android antigo têm tabela de fusos desatualizada e ainda aplicam o
 * horário de verão brasileiro (extinto em 2019) — relógio e agenda ficariam 1 h adiantados.
 * Para os fusos do Brasil usamos o deslocamento fixo atual.
 */
private val BRAZIL_FIXED = mapOf(
    "America/Noronha" to "GMT-02:00",
    "America/Sao_Paulo" to "GMT-03:00", "America/Bahia" to "GMT-03:00", "America/Fortaleza" to "GMT-03:00",
    "America/Recife" to "GMT-03:00", "America/Belem" to "GMT-03:00", "America/Maceio" to "GMT-03:00",
    "America/Araguaina" to "GMT-03:00", "America/Santarem" to "GMT-03:00",
    "America/Manaus" to "GMT-04:00", "America/Cuiaba" to "GMT-04:00", "America/Campo_Grande" to "GMT-04:00",
    "America/Porto_Velho" to "GMT-04:00", "America/Boa_Vista" to "GMT-04:00",
    "America/Rio_Branco" to "GMT-05:00", "America/Eirunepe" to "GMT-05:00",
)

fun zoneFor(id: String): TimeZone = TimeZone.getTimeZone(BRAZIL_FIXED[id] ?: id)

/** Fuso do aparelho, corrigido para o Brasil. */
fun deviceZone(): TimeZone = zoneFor(TimeZone.getDefault().id)

// Espelha o payload de buildPayload() em server/src/socket.js (evento "config:update").

data class ZoneItem(
    val type: String,
    val url: String?,
    val content: JSONObject?,
    val name: String,
    val objectFit: String,
    val videoDuration: Double?,
) {
    val key: String get() = "$type|${url.orEmpty()}|${content?.toString().orEmpty()}|$objectFit"
}

data class Slide(
    val id: String,
    val durationSec: Int,
    val useVideoDuration: Boolean,
    val template: String,
    val zoneLabels: List<String>,
    val zones: Map<Int, ZoneItem>,
) {
    val signature: String
        get() = buildString {
            append(id).append(':').append(durationSec).append(':').append(useVideoDuration).append(':').append(template)
            zoneLabels.indices.forEach { append('[').append(zones[it]?.key ?: "-").append(']') }
        }
}

data class TickerCfg(
    val text: String,
    val speed: Double,
    val fontSizeDp: Float,
    val color: Int,
    val bgColor: Int,
)

/** Uma janela "ligada": nos [days] (0=domingo … 6=sábado), das [onMinute] às [offMinute]. */
data class PowerRule(val days: Set<Int>, val onMinute: Int, val offMinute: Int)

/**
 * Agenda de ligar/desligar. Formato esperado no payload (proposto, ainda não enviado pelo servidor):
 *   "power": { "enabled": true, "rules": [ { "days": [1,2,3,4,5], "on": "07:00", "off": "22:00" } ] }
 * Regra com off < on atravessa a meia-noite (ex.: 18:00 → 02:00).
 * Sem "power" ou enabled=false → sempre ligada.
 */
data class PowerSchedule(val enabled: Boolean, val rules: List<PowerRule>) {

    val isActive: Boolean get() = enabled && rules.isNotEmpty()

    fun isOnAt(cal: Calendar): Boolean {
        if (!isActive) return true
        val day = cal.get(Calendar.DAY_OF_WEEK) - 1
        val prevDay = (day + 6) % 7
        val minute = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        return rules.any { r ->
            when {
                r.onMinute == r.offMinute -> day in r.days
                r.onMinute < r.offMinute -> day in r.days && minute >= r.onMinute && minute < r.offMinute
                else -> (day in r.days && minute >= r.onMinute) || (prevDay in r.days && minute < r.offMinute)
            }
        }
    }

    fun isOnAt(timeMs: Long): Boolean = isOnAt(Calendar.getInstance(deviceZone()).apply { timeInMillis = timeMs })

    /** Próximo instante (início do minuto) em que o estado ligado/desligado muda. */
    fun nextChangeAfter(nowMs: Long): Long? {
        if (!isActive) return null
        val cal = Calendar.getInstance(deviceZone()).apply {
            timeInMillis = nowMs
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val current = isOnAt(cal)
        repeat(8 * 24 * 60) {
            cal.add(Calendar.MINUTE, 1)
            if (isOnAt(cal) != current) return cal.timeInMillis
        }
        return null
    }
}

data class TvConfig(
    val screenName: String,
    val portrait: Boolean,
    val slides: List<Slide>,
    val ticker: TickerCfg?,
    val power: PowerSchedule?,
) {
    val slidesSignature: String get() = slides.joinToString("|") { it.signature }
}

object ConfigParser {

    fun parse(json: JSONObject, baseUrl: String): TvConfig {
        val screen = json.optJSONObject("screen")

        val slides = mutableListOf<Slide>()
        val arr = json.optJSONArray("slides") ?: JSONArray()
        for (i in 0 until arr.length()) {
            val s = arr.optJSONObject(i) ?: continue
            val layout = s.optJSONObject("layout")
            val labels = mutableListOf<String>()
            layout?.optJSONArray("zones")?.let { za ->
                for (z in 0 until za.length()) labels += za.optJSONObject(z)?.let { str(it, "label") } ?: "Zona"
            }
            if (labels.isEmpty()) labels += "Principal"

            val items = mutableMapOf<Int, ZoneItem>()
            s.optJSONObject("zones")?.let { zo ->
                val keys = zo.keys()
                while (keys.hasNext()) {
                    val k = keys.next().toString()
                    val idx = k.toIntOrNull() ?: continue
                    zo.optJSONObject(k)?.let { items[idx] = parseItem(it, baseUrl) }
                }
            }

            slides += Slide(
                id = s.opt("id")?.toString() ?: i.toString(),
                durationSec = s.optInt("duration", 10).coerceAtLeast(1),
                useVideoDuration = s.optBoolean("useVideoDuration", false),
                template = layout?.let { str(it, "template") } ?: "fullscreen",
                zoneLabels = labels,
                zones = items,
            )
        }

        return TvConfig(
            screenName = screen?.let { str(it, "name") } ?: "",
            portrait = screen?.let { str(it, "orientation") } == "portrait",
            slides = slides,
            ticker = json.optJSONObject("ticker")?.let(::parseTicker),
            power = json.optJSONObject("power")?.let(::parsePower),
        )
    }

    private fun parseItem(o: JSONObject, baseUrl: String): ZoneItem {
        val content = when (val c = o.opt("content")) {
            is JSONObject -> c
            is String -> runCatching { JSONObject(c) }.getOrNull()
            else -> null
        }
        return ZoneItem(
            type = str(o, "type") ?: "unknown",
            url = absolutize(str(o, "url"), baseUrl),
            content = content,
            name = str(o, "name") ?: "",
            objectFit = str(o, "objectFit") ?: "cover",
            videoDuration = if (o.isNull("videoDuration")) null else o.optDouble("videoDuration"),
        )
    }

    private fun parseTicker(t: JSONObject): TickerCfg? {
        val texts = mutableListOf<String>()
        t.optJSONArray("messages")?.let { ma ->
            for (m in 0 until ma.length()) {
                ma.optJSONObject(m)?.let { str(it, "text") }?.takeIf { it.isNotBlank() }?.let(texts::add)
            }
        }
        if (texts.isEmpty()) str(t, "message")?.takeIf { it.isNotBlank() }?.let(texts::add)
        val text = texts.joinToString("   •   ")
        if (text.isBlank()) return null
        return TickerCfg(
            text = text,
            speed = if (t.isNull("speed")) 0.0 else t.optDouble("speed", 0.0),
            fontSizeDp = if (t.isNull("fontSize")) 32f else t.optDouble("fontSize", 32.0).toFloat(),
            color = parseColor(str(t, "color"), Color.WHITE),
            bgColor = parseColor(str(t, "bgColor"), Color.parseColor("#DC2626")),
        )
    }

    private fun parsePower(p: JSONObject): PowerSchedule {
        val rulesArr = p.optJSONArray("rules") ?: JSONArray()
        val rules = (0 until rulesArr.length()).mapNotNull { idx ->
            val r = rulesArr.optJSONObject(idx) ?: return@mapNotNull null
            val daysArr = r.optJSONArray("days")
            val days = if (daysArr == null) (0..6).toSet()
            else (0 until daysArr.length()).map { daysArr.optInt(it, -1) }.filter { it in 0..6 }.toSet()
            val on = minutes(str(r, "on")) ?: return@mapNotNull null
            val off = minutes(str(r, "off")) ?: return@mapNotNull null
            PowerRule(days, on, off)
        }
        return PowerSchedule(p.optBoolean("enabled", false), rules)
    }

    private fun minutes(hhmm: String?): Int? {
        val parts = hhmm?.split(':') ?: return null
        val h = parts.getOrNull(0)?.toIntOrNull() ?: return null
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        if (h !in 0..24 || m !in 0..59) return null
        return (h * 60 + m).coerceAtMost(24 * 60 - 1)
    }

    /** org.json devolve "null" (texto) para JSON null em optString — evita isso. */
    fun str(o: JSONObject, key: String): String? =
        if (!o.has(key) || o.isNull(key)) null else o.optString(key).takeIf { it.isNotEmpty() }

    fun absolutize(url: String?, base: String): String? = when {
        url.isNullOrBlank() -> null
        url.startsWith("http://", true) || url.startsWith("https://", true) -> url
        url.startsWith("//") -> "https:$url"
        url.startsWith("/") -> base.trimEnd('/') + url
        else -> url
    }

    /** Aceita #rgb, #rrggbb, #aarrggbb, rgb()/rgba() e nomes conhecidos pelo Android. */
    fun parseColor(value: String?, default: Int): Int {
        val v = value?.trim()?.lowercase() ?: return default
        return try {
            when {
                v.startsWith("#") && v.length == 4 -> {
                    val r = v[1]; val g = v[2]; val b = v[3]
                    Color.parseColor("#$r$r$g$g$b$b")
                }
                v.startsWith("rgb") -> {
                    val n = v.substringAfter('(').substringBefore(')').split(',').map { it.trim() }
                    val a = n.getOrNull(3)?.toFloatOrNull()?.let { (it * 255).toInt() } ?: 255
                    Color.argb(a, n[0].toInt(), n[1].toInt(), n[2].toInt())
                }
                else -> Color.parseColor(v)
            }
        } catch (_: Exception) {
            default
        }
    }
}
