import { getSafetyNumber, trustContactIdentity } from '../../../services/e2eeService';

export const safetyNumberOption = async ({ selectedUser, setStatusText }) => {
  const peerUid = selectedUser?.uid;
  if (!peerUid) return;
  try {
    const value = await getSafetyNumber(peerUid);
    if (!value) throw new Error('Sign in to view safety numbers');
    const verified = window.confirm(`Compare this safety number with ${selectedUser.displayName || peerUid} using a separate trusted channel. Both screens must show the same number.\n\n${value}\n\nChoose OK only after you have compared them to trust this identity. Choose Cancel to leave trust unchanged.`);
    if (verified) {
      await trustContactIdentity(peerUid, value);
      setStatusText?.('Contact identity verified for the current encryption mode.');
    }
  } catch (error) { setStatusText?.(error.message); }
};
