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

/**
 * Baixa em segundo plano todos os vídeos da playlist para o cache em disco,
 * um por vez. Assim a TV continua exibindo tudo mesmo se a internet cair —
 * inclusive vídeos que ainda não tocaram. Vídeos que saíram da playlist são
 * apagados do disco. Se algum download falhar, tenta de novo em 10 minutos.
 */
object VideoPrefetcher {
    private const val TAG = "VideoPrefetcher"
    private const val RETRY_MS = 10 * 60 * 1000L

    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var generation = 0
    @Volatile private var urls: List<String> = emptyList()

    /** (baixados, total) — mostrado no menu do app. */
    fun progress(): Pair<Int, Int> {
        val list = urls
        return list.count { MediaCache.isFullyCached(it) } to list.size
    }

    fun prefetch(ctx: Context, cfg: TvConfig) {
        val app = ctx.applicationContext
        val list = cfg.slides.flatMap { it.zones.values }
            .filter { it.type == "video" && it.url != null }
            .mapNotNull { it.url }
            .distinct()
        if (list == urls) return
        urls = list
        start(app)
    }

    private fun start(app: Context) {
        val gen = ++generation
        val list = urls
        main.removeCallbacksAndMessages(null)
        executor.execute {
            MediaCache.removeUnused(list.toSet())
            var failed = false
            for (url in list) {
                if (gen != generation) return@execute // playlist mudou: recomeça com a nova
                if (MediaCache.isFullyCached(url)) continue
                try {
                    val ds = MediaCache.cachedFactory(app).createDataSource() as CacheDataSource
                    CacheWriter(ds, DataSpec(Uri.parse(url)), null, null).cache()
                    Log.i(TAG, "Vídeo salvo no aparelho: $url")
                } catch (e: Exception) {
                    failed = true
                    Log.w(TAG, "Falha ao baixar $url: ${e.message}")
                }
            }
            if (failed && gen == generation) main.postDelayed({ if (gen == generation) start(app) }, RETRY_MS)
        }
    }
}
