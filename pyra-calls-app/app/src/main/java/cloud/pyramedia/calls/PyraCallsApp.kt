package cloud.pyramedia.calls

import android.app.Application
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.notify.Notifier
import cloud.pyramedia.calls.sync.SyncScheduler

class PyraCallsApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifier.ensureChannels(this)
        if (AppPrefs(this).isLoggedIn()) SyncScheduler.ensurePeriodic(this)
    }
}
