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
    // Field names mirror app/api/mobile/call-outcome/route.ts's
    // apiSuccess({ activity_id, follow_up_id, follow_up_error, deduplicated })
    // shape EXACTLY (route.ts:303) — a renamed field would silently decode to
    // null/default under PyraJson's ignoreUnknownKeys instead of failing loudly.
    @Test fun decodesCallOutcomeEnvelope() {
        val body = """{"data":{"activity_id":"la_1","follow_up_id":"fu_1","follow_up_error":false,"deduplicated":false},"error":null,"meta":null}"""
        val env = PyraJson.decodeFromString<Envelope<CallOutcomeData>>(body)
        val d = env.data!!
        assertEquals("la_1", d.activity_id)
        assertEquals("fu_1", d.follow_up_id)
        assertTrue(!d.follow_up_error)
        assertTrue(!d.deduplicated)
    }
    // Flip-and-warn shape (route.ts:58-65): HTTP 200, outcome saved, but the
    // optional follow-up insert failed — follow_up_id is null and
    // follow_up_error is true. This is NOT an ApiResult.Err on the client.
    @Test fun decodesCallOutcomeEnvelopeWithFollowUpError() {
        val body = """{"data":{"activity_id":"la_2","follow_up_id":null,"follow_up_error":true,"deduplicated":false},"error":null,"meta":null}"""
        val env = PyraJson.decodeFromString<Envelope<CallOutcomeData>>(body)
        val d = env.data!!
        assertEquals(null, d.follow_up_id)
        assertTrue(d.follow_up_error)
        assertTrue(!d.deduplicated)
    }
    @Test fun encodesCallOutcomeRequestWithoutNullOptionalFields() {
        val json = PyraJson.encodeToString(CallOutcomeRequest.serializer(),
            CallOutcomeRequest(lead_id = "sl_1", outcome = "interested"))
        assertTrue(!json.contains("note"))
        assertTrue(!json.contains("next_follow_up_at"))
    }
    @Test fun encodesCallOutcomeRequestWithNoteAndFollowUpDate() {
        val json = PyraJson.encodeToString(CallOutcomeRequest.serializer(),
            CallOutcomeRequest(
                lead_id = "sl_1", outcome = "call_again",
                note = "اتصل بعد الظهر", next_follow_up_at = "2026-07-26T06:00:00Z",
            ))
        assertTrue(json.contains("\"note\":\"اتصل بعد الظهر\""))
        assertTrue(json.contains("\"next_follow_up_at\":\"2026-07-26T06:00:00Z\""))
    }

    // CA-C2 — field name mirrors app/api/mobile/app-version/route.ts:36's
    // `.select('version_code, version_name, release_notes, is_mandatory')`
    // EXACTLY, cross-checked against the route (not the task brief) per the
    // brief's own warning: PyraJson's ignoreUnknownKeys means a drifted name
    // silently deserializes to the default instead of failing loudly.
    @Test fun decodesAppVersionEnvelopeWithMandatoryTrue() {
        val body = """{"data":{"latest":{"version_code":6,"version_name":"1.5.0","release_notes":null,"is_mandatory":true}},"error":null,"meta":null}"""
        val env = PyraJson.decodeFromString<Envelope<AppVersionData>>(body)
        val latest = env.data!!.latest!!
        assertEquals(6, latest.version_code)
        assertTrue(latest.is_mandatory)
    }

    // Pre-CA-C1 server responses (and any channel that never sets the column)
    // omit the field entirely — ignoreUnknownKeys pairs with this default so
    // an OLD server can never accidentally trigger a block.
    @Test fun decodesAppVersionEnvelopeDefaultsMandatoryFalseWhenAbsent() {
        val body = """{"data":{"latest":{"version_code":6,"version_name":"1.5.0"}},"error":null,"meta":null}"""
        val env = PyraJson.decodeFromString<Envelope<AppVersionData>>(body)
        assertTrue(!env.data!!.latest!!.is_mandatory)
    }
}
