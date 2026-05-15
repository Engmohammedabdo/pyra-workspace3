'use client';

/**
 * Voice recording hook for lead attachments (Phase 15.2 Commit 2).
 *
 * Wraps the browser MediaRecorder API with:
 *   - 5-minute HARD CAP on recording duration (auto-stop at MAX_DURATION_SEC)
 *   - 4:30 warning toast (gives user 30s to wrap up before forced stop)
 *   - Safari/iOS fallback: audio/mp4 when audio/webm isn't supported
 *   - MediaStream cleanup on unmount (no leaked microphone)
 *   - Arabic permission-error messages
 *
 * Pattern source: components/sales/chat/chat-input.tsx (lines 245-310) —
 * pre-existing WhatsApp shared-inbox voice recorder. Q4(a) decision was
 * to LEAVE chat-input.tsx untouched and create this NEW hook instead.
 * v1.1 may consolidate if both surfaces converge on identical requirements.
 *
 * Why not reused directly: chat-input.tsx's recorder has no duration cap,
 * is tightly coupled to that component's state, and uses processFile() for
 * upload (single-file message attachment). The lead-attachments use case
 * needs a generic blob+duration result and a hard cap.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** Hard cap — 5 minutes. Auto-stop at MAX_DURATION_SEC. */
const MAX_DURATION_SEC = 5 * 60;

/** Warning threshold — 30 seconds before the cap. */
const WARNING_THRESHOLD_SEC = MAX_DURATION_SEC - 30;

export interface VoiceRecording {
  /** The recorded Blob — type matches `mimeType` */
  blob: Blob;
  /** Duration in seconds (integer, rounded down from the ticker) */
  durationSeconds: number;
  /** Final MIME type (audio/webm preferred; audio/mp4 on Safari) */
  mimeType: string;
  /** Suggested filename extension based on mimeType (webm or m4a) */
  ext: 'webm' | 'm4a';
}

export interface UseVoiceRecorderReturn {
  /** True while actively recording (after start, before stop/cancel) */
  isRecording: boolean;
  /** Seconds elapsed since recording started — updates every second */
  durationSeconds: number;
  /** Maximum allowed duration (5 minutes) — exposed for UI progress bars */
  maxDurationSeconds: number;
  /** Start recording. Returns false if mic permission denied. */
  start: () => Promise<boolean>;
  /** Stop recording. Resolves with the completed blob+metadata, or null if no recording was active. */
  stop: () => Promise<VoiceRecording | null>;
  /** Abort recording without producing a blob. Releases the mic stream. */
  cancel: () => void;
  /** Format seconds as MM:SS for display */
  formatDuration: (seconds: number) => string;
}

/**
 * Pick the best supported audio MIME type. Chrome/Firefox/Android prefer
 * audio/webm; Safari/iOS fall back to audio/mp4. Returns null only if
 * neither is supported (extremely rare — would indicate ancient browser).
 */
function pickMimeType(): { mimeType: string; ext: 'webm' | 'm4a' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (typeof MediaRecorder.isTypeSupported === 'function') {
    if (MediaRecorder.isTypeSupported('audio/webm')) {
      return { mimeType: 'audio/webm', ext: 'webm' };
    }
    if (MediaRecorder.isTypeSupported('audio/mp4')) {
      return { mimeType: 'audio/mp4', ext: 'm4a' };
    }
  }
  // Older Safari may not implement isTypeSupported reliably — try mp4 anyway.
  return { mimeType: 'audio/mp4', ext: 'm4a' };
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningFiredRef = useRef(false);

  // Resolve when `stop()` is called — set by start(), awaited by stop().
  const stopResolverRef = useRef<((rec: VoiceRecording | null) => void) | null>(null);
  // Captured at start time so stop() / auto-stop can include them in the result.
  const activeMimeRef = useRef<{ mimeType: string; ext: 'webm' | 'm4a' } | null>(null);

  /** Release the mic stream + clear the timer. Idempotent. */
  const teardown = useCallback(() => {
    if (mediaRecorderRef.current) {
      // Stop the MediaStream tracks — otherwise the OS shows the mic
      // indicator forever (and on iOS, the browser may prompt for
      // permission every session).
      const stream = mediaRecorderRef.current.stream;
      stream?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    warningFiredRef.current = false;
    chunksRef.current = [];
    activeMimeRef.current = null;
  }, []);

  /** Stop the recorder and resolve the pending stop() / autoStop. */
  const finalize = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const mime = activeMimeRef.current;
    const resolver = stopResolverRef.current;
    stopResolverRef.current = null;

    if (!recorder || !mime) {
      teardown();
      resolver?.(null);
      return;
    }

    // recorder.onstop fires synchronously after .stop() in modern browsers,
    // and the final ondataavailable runs BEFORE onstop — so chunks are
    // complete by the time onstop runs. We attach this here at finalize
    // time to capture the elapsed duration at the right moment.
    recorder.onstop = () => {
      try {
        const blob = new Blob(chunksRef.current, { type: mime.mimeType });
        const elapsed = durationSeconds; // captured via closure at finalize time
        teardown();
        setIsRecording(false);
        setDurationSeconds(0);
        resolver?.({
          blob,
          durationSeconds: elapsed,
          mimeType: mime.mimeType,
          ext: mime.ext,
        });
      } catch (err) {
        console.error('[useVoiceRecorder] onstop blob error:', err);
        teardown();
        setIsRecording(false);
        setDurationSeconds(0);
        resolver?.(null);
      }
    };

    try {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        // Already stopped — synthesize the blob immediately.
        recorder.onstop?.(new Event('stop') as Event);
      }
    } catch (err) {
      console.error('[useVoiceRecorder] stop threw:', err);
      teardown();
      setIsRecording(false);
      setDurationSeconds(0);
      resolver?.(null);
    }
  }, [teardown, durationSeconds]);

  const start = useCallback(async (): Promise<boolean> => {
    if (isRecording) return false;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('المتصفح لا يدعم تسجيل الصوت');
      return false;
    }

    const mime = pickMimeType();
    if (!mime) {
      toast.error('المتصفح لا يدعم تسجيل الصوت');
      return false;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Most common path: user denied the mic permission prompt.
      console.warn('[useVoiceRecorder] getUserMedia denied:', err);
      const errName = (err as { name?: string })?.name ?? '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        toast.error('لم يتم السماح بالوصول للميكروفون. فعّل الإذن من إعدادات المتصفح.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        toast.error('لا يوجد ميكروفون متاح على هذا الجهاز');
      } else {
        toast.error('فشل تشغيل الميكروفون');
      }
      return false;
    }

    let recorder: MediaRecorder;
    try {
      recorder = MediaRecorder.isTypeSupported?.(mime.mimeType)
        ? new MediaRecorder(stream, { mimeType: mime.mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      console.error('[useVoiceRecorder] MediaRecorder ctor failed:', err);
      stream.getTracks().forEach((t) => t.stop());
      toast.error('فشل بدء التسجيل');
      return false;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorderRef.current = recorder;
    activeMimeRef.current = mime;
    warningFiredRef.current = false;

    setDurationSeconds(0);
    setIsRecording(true);
    recorder.start();

    // Duration ticker + auto-stop at MAX_DURATION_SEC. Uses a 1-second
    // interval; we accept ±1s jitter on the cap (acceptable for v1).
    tickRef.current = setInterval(() => {
      setDurationSeconds((prev) => {
        const next = prev + 1;
        if (next === WARNING_THRESHOLD_SEC && !warningFiredRef.current) {
          warningFiredRef.current = true;
          toast.warning('تبقى 30 ثانية على الحد الأقصى للتسجيل (5 دقائق)');
        }
        if (next >= MAX_DURATION_SEC) {
          // Auto-stop. We can't call finalize directly here because of
          // stale closures over durationSeconds; instead trigger the
          // recorder.stop() and let stop() / the onstop handler handle
          // cleanup via the pending resolver if there is one. If no
          // resolver is pending (user hasn't called stop yet), we
          // resolve via an internal one-shot Promise to capture the
          // result for later consumption.
          if (mediaRecorderRef.current?.state === 'recording') {
            // Force-stop and surface the auto-stop event to the consumer
            // via the existing stopResolver if one is pending; otherwise
            // the user will see isRecording flip to false + a toast.
            toast.info('تم إيقاف التسجيل تلقائياً بعد 5 دقائق');
            // If there's no pending stop() call yet (rare — user kept
            // recording past the cap without clicking stop), we'll
            // finalize synthetically and the consumer can re-query via
            // their own state.
            if (stopResolverRef.current) {
              finalize();
            } else {
              // Synthesize a stop — chunksRef will be flushed and the
              // blob will be discarded (no consumer to deliver it to).
              // This is a defensive path: the UI should always have a
              // stop() pending while isRecording is true.
              try {
                mediaRecorderRef.current.stop();
              } catch {
                /* swallowed */
              }
              teardown();
              setIsRecording(false);
              setDurationSeconds(0);
            }
          }
        }
        return next;
      });
    }, 1000);

    return true;
  }, [isRecording, finalize, teardown]);

  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return null;
    }
    return new Promise<VoiceRecording | null>((resolve) => {
      stopResolverRef.current = resolve;
      finalize();
    });
  }, [finalize]);

  const cancel = useCallback(() => {
    const resolver = stopResolverRef.current;
    stopResolverRef.current = null;
    teardown();
    setIsRecording(false);
    setDurationSeconds(0);
    resolver?.(null);
  }, [teardown]);

  // Component-unmount cleanup. Critical for iOS — without this, the OS
  // mic indicator can linger and the browser may prompt for permission
  // again on the next page open.
  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  const formatDuration = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  return {
    isRecording,
    durationSeconds,
    maxDurationSeconds: MAX_DURATION_SEC,
    start,
    stop,
    cancel,
    formatDuration,
  };
}
