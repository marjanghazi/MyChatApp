import "./ChatCallPanels.css";

const ChatCallPanels = ({
  showCallLogs,
  activeThreadType,
  callLogs,
  setShowCallLogs,
  getCallIcon,
  getCallStatusText,
  formatCallTime,
  startCall,
  selectedCall,
  authUser,
  selectedUser,
  formatCallDuration,
  callDurationSec,
  acceptCall,
  endCall,
  toggleMute,
  isMuted,
  toggleVideo,
  isVideoOff,
  localCallStream,
  remoteCallStream,
  remoteVideoRef,
  localVideoRef,
}) => (
  <>
    {showCallLogs && activeThreadType === "direct" && (
      <div className="qx-call-logs-panel">
        <div className="qx-call-logs-header">
          <h4>Call History</h4>
          <button className="qx-call-logs-close" onClick={() => setShowCallLogs(false)}>✕</button>
        </div>
        <div className="qx-call-logs-list">
          {callLogs.length === 0 ? (
            <div className="qx-call-logs-empty"><p>No call history yet</p></div>
          ) : (
            callLogs.map((log) => (
              <div key={log.id} className={`qx-call-log-item ${log.status === "missed" ? "qx-call-log-item--missed" : ""}`}>
                <div className="qx-call-log-icon">{getCallIcon(log)}</div>
                <div className="qx-call-log-details">
                  <div className="qx-call-log-type">{log.type === "video" ? "Video Call" : "Voice Call"}</div>
                  <div className="qx-call-log-status">{getCallStatusText(log)}</div>
                  <div className="qx-call-log-time">
                    {formatCallTime(log.endedAt || log.startedAt)}
                  </div>
                </div>
                <div className="qx-call-log-actions">
                  <button className="qx-call-log-callback" onClick={() => startCall(log.type)} title="Call back">
                    {log.type === "video" ? "🎥" : "📞"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )}

    {activeThreadType === "direct" && selectedCall && selectedCall.status !== "ended" && (
      <div className={`qx-call-banner qx-call-banner--${selectedCall.status}`}>
        <div className="qx-call-info">
          <div className="qx-call-icon">{selectedCall.type === "video" ? "🎥" : "📞"}</div>
          <div>
            <strong>{selectedCall.type === "video" ? "Video" : "Voice"} Call</strong>
            <span className="qx-call-status">
              {selectedCall.status === "ringing"
                ? selectedCall.from === authUser.uid
                  ? `Calling ${selectedUser?.displayName}…`
                  : "Incoming call…"
                : selectedCall.status === "active"
                ? `In progress · ${formatCallDuration(callDurationSec) || "00:00"}`
                : selectedCall.status}
            </span>
          </div>
        </div>
        <div className="qx-call-controls">
          {selectedCall.to === authUser.uid && selectedCall.status === "ringing" && (
            <>
              <button type="button" className="qx-call-accept" onClick={acceptCall}>Accept</button>
              <button type="button" className="qx-call-decline" onClick={endCall}>Decline</button>
            </>
          )}
          {selectedCall.from === authUser.uid && selectedCall.status === "ringing" && (
            <button type="button" className="qx-call-end" onClick={endCall}>Cancel</button>
          )}
          {selectedCall.status === "active" && (
            <>
              <button type="button" className="qx-call-mute" onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}>
                {isMuted ? "🔇" : "🎤"}
              </button>
              {selectedCall.type === "video" && (
                <button type="button" className="qx-cam-toggle" onClick={toggleVideo} title={isVideoOff ? "Camera on" : "Camera off"}>
                  {isVideoOff ? "📷❌" : "📷"}
                </button>
              )}
              <button type="button" className="qx-call-end" onClick={endCall}>End Call</button>
            </>
          )}
        </div>
      </div>
    )}

    {activeThreadType === "direct" && (localCallStream || remoteCallStream) && selectedCall?.type === "video" && (
      <div className="qx-call-media">
        <div className="qx-video-wrap">
          <video ref={remoteVideoRef} autoPlay playsInline className="qx-video-main" />
          <video ref={localVideoRef}  autoPlay muted playsInline className="qx-video-pip" />
        </div>
      </div>
    )}
  </>
);

export default ChatCallPanels;
