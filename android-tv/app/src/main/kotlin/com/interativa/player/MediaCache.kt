@file:OptIn(UnstableApi::class)

package com.interativa.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.ContentMetadata
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File

/**
 * Cache em disco para os vídeos enviados ao painel (/uploads).
 * Depois de tocar uma vez, o vídeo passa a sair do disco — menos rede, menos travadas,
 * e continua tocando se a internet cair.
 * Streams IPTV ao vivo não passam pelo cache.
 */
object MediaCache {
    const val USER_AGENT = "InterativaPlayer/${BuildConfig.VERSION_NAME} (Android TV)"

    private var cache: SimpleCache? = null

    @Synchronized
    fun init(ctx: Context) {
        if (cache != null) return
        cache = SimpleCache(
            File(ctx.cacheDir, "media"),
            LeastRecentlyUsedCacheEvictor(1536L * 1024 * 1024),
            StandaloneDatabaseProvider(ctx),
        )
    }

    private fun http(): DefaultHttpDataSource.Factory = DefaultHttpDataSource.Factory()
        .setUserAgent(USER_AGENT)
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(15_000)
        .setReadTimeoutMs(30_000)

    fun cachedFactory(ctx: Context): DataSource.Factory {
        init(ctx)
        return CacheDataSource.Factory()
            .setCache(cache!!)
            .setUpstreamDataSourceFactory(DefaultDataSource.Factory(ctx, http()))
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

    fun liveFactory(ctx: Context): DataSource.Factory = DefaultDataSource.Factory(ctx, http())

    /** Apaga do disco os vídeos que não pertencem mais à programação da tela. */
    @Synchronized
    fun removeUnused(keep: Set<String>) {
        val c = cache ?: return
        c.keys.filter { it !in keep }.forEach { key ->
            runCatching { c.removeResource(key) }
        }
    }

    /** Vídeo inteiro já está no disco? */
    fun isFullyCached(url: String): Boolean {
        val c = cache ?: return false
        val length = ContentMetadata.getContentLength(c.getContentMetadata(url))
        return length > 0 && c.isCached(url, 0, length)
    }
}
