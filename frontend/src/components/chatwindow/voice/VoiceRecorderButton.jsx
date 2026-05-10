import { useEffect, useRef, useState } from "react";
import "./VoiceRecorderButton.css";

function VoiceRecorderButton({ disabled, onVoiceRecorded, onStatusChange }) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationRef = useRef(null);
  const recordingStartedAtRef = useRef(0);

  const [isRecording, setIsRecording] = useState(false);
  const [pendingVoiceBlob, setPendingVoiceBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [levels, setLevels] = useState(() => Array.from({ length: 24 }, () => 0.08));


  useEffect(() => {
    if (!pendingVoiceBlob) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(pendingVoiceBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingVoiceBlob]);

  const cleanup = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    recordingStartedAtRef.current = 0;
    setRecordingSeconds(0);
    setLevels(Array.from({ length: 24 }, () => 0.08));
  };

  const startRecording = async () => {
    if (disabled || isRecording || isSending || pendingVoiceBlob) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onStatusChange?.("Voice recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioContextCtor) {
        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.8;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        sourceRef.current = source;

        const dataBuffer = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(dataBuffer);
          let sum = 0;
          for (let i = 0; i < dataBuffer.length; i += 1) {
            const normalized = (dataBuffer[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / dataBuffer.length);
          const nextLevel = Math.min(1, 0.12 + rms * 4.2);
          setLevels((prev) => [...prev.slice(1), nextLevel]);
          setRecordingSeconds(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
          animationRef.current = requestAnimationFrame(tick);
        };
        animationRef.current = requestAnimationFrame(tick);
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        setIsRecording(false);

        if (!blob.size) {
          onStatusChange?.("Voice message was empty. Try again.");
          return;
        }

        setPendingVoiceBlob(blob);
        onStatusChange?.("Voice note ready. Tap send to share it.");
      };

      recorder.start();
      setIsRecording(true);
      onStatusChange?.("Recording voice note... tap stop when done.");
    } catch {
      cleanup();
      setIsRecording(false);
      onStatusChange?.("Microphone permission denied.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const discardPendingVoice = () => {
    setPendingVoiceBlob(null);
    onStatusChange?.("Voice note discarded.");
  };

  const sendPendingVoice = async () => {
    if (!pendingVoiceBlob || isSending || disabled) return;
    setIsSending(true);
    try {
      const mimeType = pendingVoiceBlob.type || "audio/webm";
      const ext = mimeType.includes("ogg") ? "ogg" : "webm";
      const voiceFile = new File([pendingVoiceBlob], `voice-${Date.now()}.${ext}`, { type: mimeType });
      onStatusChange?.("Uploading voice note...");
      const sent = await onVoiceRecorded?.(voiceFile);
      if (!sent) {
        onStatusChange?.("Voice note failed to send.");
        return;
      }
      setPendingVoiceBlob(null);
      onStatusChange?.("Voice note sent.");
      setTimeout(() => onStatusChange?.(""), 1800);
    } catch {
      onStatusChange?.("Failed to send voice note.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="qx-voice-recorder-wrap">
      {isRecording && (
        <div className="qx-voice-live">
          <span className="qx-voice-live-dot" />
          <span className="qx-voice-live-time">
            {`${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`}
          </span>
          <div className="qx-voice-live-wave" aria-hidden="true">
            {levels.map((level, index) => (
              <span
                key={index}
                className="qx-voice-live-bar"
                style={{ transform: `scaleY(${Math.max(0.14, level)})` }}
              />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className={`qx-composer-btn qx-composer-btn--voice ${isRecording ? "qx-composer-btn--recording" : ""}`}
        title={isRecording ? "Stop recording" : "Record voice note"}
        disabled={disabled || isSending || !!pendingVoiceBlob}
        onClick={isRecording ? stopRecording : startRecording}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0014 0" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
        {isRecording && <span className="qx-recording-dot" />}
      </button>

      {pendingVoiceBlob && (
        <div className="qx-voice-confirm">
          <audio
            className="qx-voice-preview"
            controls
            preload="metadata"
            src={previewUrl}
          />
          <button
            type="button"
            className="qx-voice-action qx-voice-action--discard"
            onClick={discardPendingVoice}
            disabled={isSending}
            title="Discard voice note"
          >
            ✕
          </button>
          <button
            type="button"
            className="qx-voice-action qx-voice-action--send"
            onClick={sendPendingVoice}
            disabled={isSending || disabled}
            title="Send voice note"
          >
            {isSending ? "..." : "➤"}
          </button>
        </div>
      )}
    </div>
  );
}

export default VoiceRecorderButton;
