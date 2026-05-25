import { getSafetyNumber } from '../../../services/e2eeService';

export const safetyNumberOption = async ({ selectedUser, setStatusText }) => {
  const peerUid = selectedUser?.uid;
  if (!peerUid) {
    setStatusText?.('Safety number is available for direct chats only.');
    return;
  }
  const value = await getSafetyNumber(peerUid);
  if (!value) {
    setStatusText?.('No safety number available yet. Exchange at least one encrypted message first.');
    return;
  }
  window.alert(`Safety Number for ${selectedUser.displayName || peerUid}:\n\n${value}`);
};
