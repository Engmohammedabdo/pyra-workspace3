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
    @Test fun encodesQuickAddWithoutNullSourceByDefault() {
        val json = PyraJson.encodeToString(QuickAddRequest.serializer(),
            QuickAddRequest("d:1", "عميل", "b2c"))
        assertTrue(!json.contains("source"))
    }
    @Test fun encodesQuickAddWithSelectedSource() {
        val json = PyraJson.encodeToString(QuickAddRequest.serializer(),
            QuickAddRequest("d:1", "عميل", "b2c", source = "whatsapp"))
        assertTrue(json.contains("\"source\":\"whatsapp\""))
    }
    @Test fun decodesPingEnvelope() {
        val body = """{"data":{"ok":true},"error":null,"meta":null}"""
        val env = PyraJson.decodeFromString<Envelope<PingData>>(body)
        assertTrue(env.data!!.ok)
    }
    // Field names mirror app/api/mobile/my-day/route.ts's actual response
    // shape (followUpItems/goingCold/counts) EXACTLY — a renamed field would
    // silently decode to null under PyraJson's ignoreUnknownKeys, so this
    // test is the guard against that class of bug.
    @Test fun decodesMyDayEnvelope() {
        val body = """{"data":{"follow_ups":[{"id":"fu_1","lead_id":"sl_1","lead_name":"Ahmed","phone":"0501234567","title":"متابعة","due_at":"2026-07-25T10:00:00.000Z","status":"overdue"}],"going_cold":[{"lead_id":"sl_2","lead_name":"Sara","phone":null,"company":"ACME","days_since_contact":12}],"counts":{"follow_ups":34,"going_cold":278}},"error":null,"meta":null}"""
        val env = PyraJson.decodeFromString<Envelope<MyDayData>>(body)
        val d = env.data!!
        assertEquals(1, d.follow_ups.size)
        assertEquals("sl_1", d.follow_ups[0].lead_id)
        assertEquals("overdue", d.follow_ups[0].status)
        assertEquals("Sara", d.going_cold[0].lead_name)
        assertEquals(null, d.going_cold[0].phone)
        assertEquals(12, d.going_cold[0].days_since_contact)
        assertEquals(34, d.counts.follow_ups)
        assertEquals(278, d.counts.going_cold)
    }
    // cosette's real-world shape: zero follow-ups, a large going-cold list —
    // the empty-list branch must decode to an empty list, not null/crash.
    @Test fun decodesMyDayEnvelopeWithEmptyFollowUps() {
        val body = """{"data":{"follow_ups":[],"going_cold":[{"lead_id":"sl_3","lead_name":"Cosette Lead","phone":"0509998877","company":null,"days_since_contact":90}],"counts":{"follow_ups":0,"going_cold":278}},"error":null,"meta":null}"""
        val env = PyraJson.decodeFromString<Envelope<MyDayData>>(body)
        val d = env.data!!
        assertTrue(d.follow_ups.isEmpty())
        assertEquals(1, d.going_cold.size)
        assertEquals(0, d.counts.follow_ups)
    }
}
