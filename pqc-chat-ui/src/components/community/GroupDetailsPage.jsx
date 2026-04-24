import "./GroupDetailsPage.css";

const GroupDetailsPage = ({
  selectedGroup,
  authUser,
  usersById,
  contacts,
  onBack,
  onLeaveGroup,
  onToggleAdmin,
  onRemoveMember,
  onAddMember,
}) => {
  if (!selectedGroup) return null;

  const memberUsers = (selectedGroup.memberIds || [])
    .map((memberId) => usersById.get(memberId))
    .filter(Boolean)
    .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

  const isGroupAdmin = (selectedGroup.admins || []).includes(authUser?.uid);

  return (
    <section className="qx-group-details-page">
      <div className="qx-group-details-header">
        <button type="button" className="qx-btn qx-btn--secondary" onClick={onBack}>← Back to chat</button>
        <h2>{selectedGroup.name}</h2>
        <p>{(selectedGroup.memberIds || []).length} members</p>
      </div>

      <div className="qx-group-details-card">
        <h3>Admins</h3>
        <p>
          {(selectedGroup.admins || [])
            .map((id) => usersById.get(id)?.displayName || usersById.get(id)?.email || "Unknown")
            .join(", ") || "None"}
        </p>
      </div>

      <div className="qx-group-details-card">
        <h3>Members</h3>
        <div className="qx-group-details-list">
          {memberUsers.map((member) => {
            const memberIsAdmin = (selectedGroup.admins || []).includes(member.uid);
            const isMe = member.uid === authUser.uid;
            return (
              <div key={member.uid} className="qx-group-details-item">
                <div>
                  <strong>{member.displayName || member.email || "Member"} {isMe ? "(You)" : ""}</strong>
                  <p>{memberIsAdmin ? "Admin" : "Member"} · {member.email || member.phoneNumber || "No contact"}</p>
                </div>
                {isGroupAdmin && !isMe && (
                  <div className="qx-group-details-actions">
                    <button
                      type="button"
                      className="qx-btn"
                      onClick={() => onToggleAdmin(member.uid, !memberIsAdmin)}
                    >
                      {memberIsAdmin ? "Remove admin" : "Make admin"}
                    </button>
                    <button
                      type="button"
                      className="qx-btn qx-btn--danger-soft"
                      onClick={() => onRemoveMember(member.uid)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isGroupAdmin && (
        <div className="qx-group-details-card">
          <h3>Add members</h3>
          <div className="qx-group-details-list">
            {contacts
              .filter((entry) => !(selectedGroup.memberIds || []).includes(entry.uid))
              .map((entry) => (
                <div key={entry.uid} className="qx-group-details-item">
                  <div>
                    <strong>{entry.displayName || entry.email || "Contact"}</strong>
                    <p>{entry.email || entry.phoneNumber || "No contact"}</p>
                  </div>
                  <button type="button" className="qx-btn" onClick={() => onAddMember(entry.uid)}>
                    Add
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="qx-group-details-footer">
        <button type="button" className="qx-btn qx-btn--danger-soft" onClick={onLeaveGroup}>
          Leave Group
        </button>
      </div>
    </section>
  );
};

export default GroupDetailsPage;
