package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CallMappingTest {
    @Test fun mapsKnownTypes() {
        assertEquals("incoming", CallMapping.directionFor(1))
        assertEquals("outgoing", CallMapping.directionFor(2))
        assertEquals("missed", CallMapping.directionFor(3))
        assertEquals("missed", CallMapping.directionFor(5)) // rejected
    }
    @Test fun skipsUnknownTypes() {
        assertNull(CallMapping.directionFor(4)) // voicemail
        assertNull(CallMapping.directionFor(6)) // blocked
        assertNull(CallMapping.directionFor(7)) // answered externally
    }
}
