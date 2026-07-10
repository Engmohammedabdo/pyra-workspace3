package cloud.pyramedia.calls.core

object SyncPlanner {
    /**
     * Contract (docs/CALL-TRACKING.md): an 'error' result means nothing was
     * persisted server-side — the cursor must NOT advance past it. Whole
     * batch is re-sent next pass; already-persisted items echo 'duplicate'.
     */
    fun nextCursor(current: Long, batchMaxId: Long, results: List<SyncResult>): Long? {
        if (results.any { it.status == "error" }) return null
        return maxOf(current, batchMaxId)
    }
}
