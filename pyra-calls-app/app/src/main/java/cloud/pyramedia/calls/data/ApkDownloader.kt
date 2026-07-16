package cloud.pyramedia.calls.data

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

sealed class DownloadResult {
    data class Ok(val file: File) : DownloadResult()
    data class ChecksumMismatch(val file: File) : DownloadResult()
    data class NetworkError(val message: String) : DownloadResult()
}

/**
 * Streams the update APK from a signed download URL to
 * `cacheDir/updates/update-{versionCode}.apk`, computing its SHA-256 WHILE
 * streaming (single read over the bytes — no separate hash pass). The caller
 * is expected to run this on a background dispatcher; it's fully blocking.
 *
 * `url` is a 1h signed URL from `/api/mobile/app-download` — a PLAIN request,
 * deliberately built without the `x-api-key` header (the signature IS the
 * auth for that URL; re-adding the device key here would be redundant at
 * best and could leak it to whatever storage host the signed URL points at).
 */
object ApkDownloader {
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    fun download(
        context: Context,
        url: String,
        versionCode: Int,
        expectedSha256: String,
        sizeBytes: Long,
        onProgress: (Int) -> Unit,
    ): DownloadResult {
        // Clear + recreate the updates dir so a half-downloaded file from a
        // prior failed attempt never lingers alongside (or gets confused
        // with) the new one.
        val dir = File(context.cacheDir, "updates")
        dir.deleteRecursively()
        dir.mkdirs()
        val file = File(dir, "update-$versionCode.apk")

        return try {
            val request = Request.Builder().url(url).get().build()
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return DownloadResult.NetworkError("HTTP ${response.code}")
                }
                val body = response.body ?: return DownloadResult.NetworkError("empty body")
                val digest = MessageDigest.getInstance("SHA-256")
                var downloaded = 0L
                var lastReportedPercent = -1
                file.outputStream().use { out ->
                    body.byteStream().use { input ->
                        val buffer = ByteArray(8 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read == -1) break
                            out.write(buffer, 0, read)
                            digest.update(buffer, 0, read)
                            downloaded += read
                            if (sizeBytes > 0) {
                                val percent = ((downloaded * 100) / sizeBytes).toInt().coerceIn(0, 100)
                                if (percent != lastReportedPercent) {
                                    lastReportedPercent = percent
                                    onProgress(percent)
                                }
                            }
                        }
                    }
                }
                val actualSha256 = digest.digest().joinToString("") { "%02x".format(it) }
                if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
                    file.delete()
                    DownloadResult.ChecksumMismatch(file)
                } else {
                    DownloadResult.Ok(file)
                }
            }
        } catch (e: IOException) {
            DownloadResult.NetworkError(e.message ?: "io error")
        }
    }
}
