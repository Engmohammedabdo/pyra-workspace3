package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PayloadsTest {
    @Test fun decodesSyncEnvelopeIgnoringUnknownKeys() {
        val body = """{"data":{"results":[{"device_call_key":"d:1","status":"matched","lead_id":"sl_1","lead_name":"X","extra":1}]},"error":null,"meta":null}"""
        val env = PyraJson.decodeFromString<Envelope<SyncData>>(body)
        assertEquals("matched", env.data!!.results[0].status)
        assertEquals("sl_1", env.data!!.results[0].lead_id)
    }
    @Test fun encodesQuickAddWithoutNullCompany() {
        val json = PyraJson.encodeToString(QuickAddRequest.serializer(),
            QuickAddRequest("d:1", "عميل", "b2c"))
        assertTrue(!json.contains("company"))
    }
}
