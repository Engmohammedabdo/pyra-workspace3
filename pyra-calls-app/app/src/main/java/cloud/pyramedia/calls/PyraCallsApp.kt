package cloud.pyramedia.calls

import android.app.Application
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.ErrorQueue
import cloud.pyramedia.calls.notify.Notifier
import cloud.pyramedia.calls.sync.SyncScheduler

class PyraCallsApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifier.ensureChannels(this)
        if (AppPrefs(this).isLoggedIn()) SyncScheduler.ensurePeriodic(this)

        // Global crash reporter: enqueue to the file-backed ErrorQueue (shipped
        // during the next successful sync), then ALWAYS delegate to the
        // previous handler so normal Android crash-dialog/process-death
        // behavior is preserved — this only observes, never suppresses.
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            runCatching {
                ErrorQueue(this).enqueue(
                    message = e.toString().take(500),
                    source = "crash",
                    stack = e.stackTraceToString(),
                )
            }
            previous?.uncaughtException(t, e)
        }
    }
}
