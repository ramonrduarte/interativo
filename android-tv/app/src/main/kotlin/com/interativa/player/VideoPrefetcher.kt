@file:OptIn(UnstableApi::class)

package com.interativa.player

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import java.util.concurrent.Executors

/** Andamento do download dos vídeos de uma playlist. */
data class SyncProgress(
    val done: Int,          // vídeos já completos no aparelho
    val total: Int,         // vídeos da playlist
    val percent: Int,       // andamento geral (0–100)
    val finished: Boolean,  // terminou (com ou sem falhas)
    val failed: Int = 0,    // vídeos que não conseguiram baixar nesta rodada
)

/**
 * Baixa em segundo plano, um por vez, os vídeos de toda a programação da tela (playlist no ar
 * primeiro, depois a padrão e as dos agendamentos), informando o andamento.
 * Com a programação completa (servidor novo), apaga do disco os vídeos que não pertencem mais a
 * nenhuma playlist da tela. Sem ela (servidor antigo), não apaga nada — o cache libera espaço
 * sozinho (os que não tocam há mais tempo, acima de 1,5 GB). Se algum download falhar, tenta de novo em 1 minuto (continuando de
 * onde parou) — ou na hora, quando a playlist chega de novo (reconexão ou "Enviar para TV").
 */
object VideoPrefetcher {
    private const val TAG = "VideoPrefetcher"
    private const val RETRY_MS = 60 * 1000L

    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var generation = 0
    @Volatile private var running = false
    @Volatile private var urls: List<String> = emptyList()
    @Volatile private var keep: Set<String>? = null   // null = não apagar nada
    @Volatile private var listener: ((SyncProgress) -> Unit)? = null
    @Volatile var last: SyncProgress? = null
        private set

    /** Vídeos da playlist no ar. */
    fun videoUrls(cfg: TvConfig): List<String> = videosOf(cfg.slides)

    /** Vídeos de toda a programação (os da playlist no ar primeiro). */
    fun programUrls(cfg: TvConfig): List<String> = videosOf(cfg.allSlides)

    private fun videosOf(slides: List<Slide>): List<String> = slides.flatMap { it.zones.values }
        .filter { it.type == "video" && it.url != null }
        .mapNotNull { it.url }
        .distinct()

    fun missing(cfg: TvConfig): List<String> = videoUrls(cfg).filterNot { MediaCache.isFullyCached(it) }

    /** (baixados, total) da última playlist pedida — mostrado no menu do app. */
    fun progress(): Pair<Int, Int> {
        val list = urls
        return list.count { MediaCache.isFullyCached(it) } to list.size
    }

    /**
     * Baixa os vídeos da programação de [cfg]. [alsoKeep] são vídeos que não podem ser apagados
     * (os da playlist ainda em exibição). [onProgress] é chamado na thread principal.
     */
    fun prefetch(ctx: Context, cfg: TvConfig, alsoKeep: Collection<String> = emptyList(), onProgress: ((SyncProgress) -> Unit)? = null) {
        val app = ctx.applicationContext
        val list = programUrls(cfg)
        val newKeep = if (cfg.program != null) list.toSet() + alsoKeep else null
        if (onProgress != null) listener = onProgress
        if (list == urls && newKeep == keep) {
            // Mesma playlist: se a última rodada falhou, tenta de novo já (sem esperar o próximo minuto)
            if (!running && (last?.failed ?: 0) > 0) { start(app); return }
            last?.let { p -> onProgress?.let { cb -> main.post { cb(p) } } }
            return
        }
        urls = list
        keep = newKeep
        start(app)
    }

    private fun report(gen: Int, p: SyncProgress) {
        if (gen != generation) return
        last = p
        main.post { if (gen == generation) listener?.invoke(p) }
    }

    private fun start(app: Context) {
        val gen = ++generation
        val list = urls
        val keepNow = keep
        main.removeCallbacksAndMessages(null)
        executor.execute {
            running = true
            try { download(app, gen, list, keepNow) } finally { running = false }
        }
    }

    private fun download(app: Context, gen: Int, list: List<String>, keepNow: Set<String>?) {
        keepNow?.let { MediaCache.removeUnused(it) }
        val total = list.size
        var done = list.count { MediaCache.isFullyCached(it) }
        var failed = 0
        report(gen, SyncProgress(done, total, if (total == 0) 100 else done * 100 / total, finished = done == total))
        if (done == total) return

        for (url in list) {
            if (gen != generation) return // chegou outra playlist: recomeça com ela
            if (MediaCache.isFullyCached(url)) continue
            try {
                val ds = MediaCache.cachedFactory(app).createDataSource() as CacheDataSource
                var lastPct = -1
                CacheWriter(ds, DataSpec(Uri.parse(url)), null) { length, cached, _ ->
                    val frac = if (length > 0) cached.toDouble() / length else 0.0
                    val pct = ((done + frac) * 100 / total).toInt().coerceIn(0, 99)
                    if (pct != lastPct) {
                        lastPct = pct
                        report(gen, SyncProgress(done, total, pct, finished = false))
                    }
                }.cache()
                done++
                Log.i(TAG, "Vídeo salvo no aparelho ($done/$total): $url")
            } catch (e: Exception) {
                failed++
                Log.w(TAG, "Falha ao baixar $url: ${e.message}")
            }
            report(gen, SyncProgress(done, total, done * 100 / total, finished = false, failed = failed))
        }
        report(gen, SyncProgress(done, total, done * 100 / total, finished = true, failed = failed))
        if (failed > 0 && gen == generation) main.postDelayed({ if (gen == generation) start(app) }, RETRY_MS)
    }
}
