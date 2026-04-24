import { useRef, useState } from "react";
import "./VoiceRecorderButton.css";

const VoiceRecorderButton = ({ disabled, onVoiceRecorded, onStatusChange }) => {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  };

  const startRecording = async () => {
    if (disabled || isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onStatusChange?.("Voice recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        setIsRecording(false);

        if (!blob.size) {
          onStatusChange?.("Voice message was empty. Try again.");
          return;
        }

        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const voiceFile = new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType });
        onStatusChange?.("Uploading voice note...");
        await onVoiceRecorded?.(voiceFile);
      };

      recorder.start();
      setIsRecording(true);
      onStatusChange?.("Recording voice note... tap mic to stop.");
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

  return (
    <button
      type="button"
      className={`qx-composer-btn qx-composer-btn--voice ${isRecording ? "qx-composer-btn--recording" : ""}`}
      title={isRecording ? "Stop recording" : "Record voice note"}
      disabled={disabled}
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
  );
};

export default VoiceRecorderButton;
