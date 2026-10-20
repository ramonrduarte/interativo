package com.interativa.player

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache

class App : Application(), ImageLoaderFactory {

    override fun onCreate() {
        super.onCreate()
        MediaCache.init(this)
    }

    // Cache de imagens em disco ignorando cabeçalhos HTTP: a TV continua
    // exibindo as imagens mesmo sem internet.
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .memoryCache { MemoryCache.Builder(this).maxSizePercent(0.15).build() }
        .diskCache {
            DiskCache.Builder()
                .directory(cacheDir.resolve("images"))
                .maxSizeBytes(400L * 1024 * 1024)
                .build()
        }
        .respectCacheHeaders(false)
        .build()
}
