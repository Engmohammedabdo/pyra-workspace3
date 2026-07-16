package cloud.pyramedia.calls.data

import android.content.Context
import android.os.Build
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.core.ErrorEvent
import cloud.pyramedia.calls.core.ErrorQueueLogic
import cloud.pyramedia.calls.core.PyraJson
import java.io.File
import java.time.Instant

/**
 * File-backed jsonl error queue (`error-queue.jsonl` in app-private files dir).
 *
 * This is the app's own crash/error reporter — it must NEVER throw or crash
 * the app it's trying to report about. Every public method wraps its IO in
 * `runCatching`, and read-modify-write is `synchronized` on the class object
 * so worker threads (SyncWorker) and UI threads (MainActivity, QuickAddActivity)
 * never race on the same file.
 */
class ErrorQueue(private val context: Context) {
    private val file: File get() = File(context.filesDir, "error-queue.jsonl")
    private val tmpFile: File get() = File(context.filesDir, "error-queue.jsonl.tmp")

    /** Builds an [ErrorEvent] from the given fields, dedupes, appends, caps, and writes atomically. */
    fun enqueue(message: String, source: String, severity: String = "error", stack: String? = null) {
        runCatching {
            synchronized(ErrorQueue::class.java) {
                val lines = readLines()
                val existing = lines.mapNotNull(::decodeLineOrNull)
                val candidate = ErrorEvent(
                    message = message.take(500),
                    stack = stack?.take(8000),
                    source = source,
                    severity = severity,
                    occurred_at = Instant.now().toString(),
                    android_version = "android-${Build.VERSION.RELEASE}/sdk${Build.VERSION.SDK_INT}",
                    app_version_code = BuildConfig.VERSION_CODE,
                )
                if (!ErrorQueueLogic.shouldEnqueue(existing, candidate)) return@runCatching
                val newLine = PyraJson.encodeToString(ErrorEvent.serializer(), candidate)
                writeLinesAtomically(ErrorQueueLogic.cap(lines + newLine))
            }
        }
    }

    /** Oldest-first snapshot, capped at 20 — the batch cap `/api/mobile/log-error` enforces. */
    fun snapshot(): List<ErrorEvent> = runCatching {
        synchronized(ErrorQueue::class.java) {
            readLines().mapNotNull(::decodeLineOrNull).take(20)
        }
    }.getOrDefault(emptyList())

    /**
     * Removes the first [n] VALID (parseable) lines from the queue — matches
     * a preceding `snapshot()` call 1:1 by construction (snapshot also only
     * returns parseable entries, in the same order). Any corrupt raw line is
     * left untouched here (it's never counted by snapshot, so it must never
     * be counted here either) — it self-heals on the next `enqueue()`
     * rewrite, which always drops corrupt lines when rebuilding the file.
     */
    fun removeShipped(n: Int) {
        runCatching {
            synchronized(ErrorQueue::class.java) {
                var toSkip = n
                val remaining = mutableListOf<String>()
                for (line in readLines()) {
                    if (toSkip > 0 && decodeLineOrNull(line) != null) {
                        toSkip--
                        continue
                    }
                    remaining += line
                }
                writeLinesAtomically(remaining)
            }
        }
    }

    private fun decodeLineOrNull(line: String): ErrorEvent? =
        runCatching { PyraJson.decodeFromString(ErrorEvent.serializer(), line) }.getOrNull()

    private fun readLines(): List<String> =
        if (file.exists()) file.readLines().filter { it.isNotBlank() } else emptyList()

    /** Write-temp-then-rename so a mid-write crash never truncates the live queue file. */
    private fun writeLinesAtomically(lines: List<String>) {
        val content = if (lines.isEmpty()) "" else lines.joinToString("\n") + "\n"
        tmpFile.writeText(content)
        if (!tmpFile.renameTo(file)) {
            // rename can fail cross-filesystem (never the case for filesDir,
            // but stay defensive) — fall back to a direct write.
            file.writeText(content)
            tmpFile.delete()
        }
    }
}
