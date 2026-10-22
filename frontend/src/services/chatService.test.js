import { apiRequest } from './apiClient';
import { decryptEnvelopeWithParticipants, encryptMessageEnvelope } from './e2eeService';
import { resolveEncryptedMedia } from './mediaService';
import { sendChatMessage, editChatMessage, fetchThreadMessages } from './chatService';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));
jest.mock('./e2eeService', () => ({ encryptMessageEnvelope: jest.fn(), decryptEnvelopeWithParticipants: jest.fn() }));
jest.mock('./mediaService', () => ({ resolveEncryptedMedia: jest.fn() }));
const envelope = { ciphertext_b64: 'cipher', nonce_b64: 'nonce', aad_b64: 'aad', protocol_version: '2.0' };
beforeEach(() => {
  jest.clearAllMocks();
  encryptMessageEnvelope.mockResolvedValue(envelope);
  apiRequest.mockResolvedValue({ ok: true });
  resolveEncryptedMedia.mockImplementation(async (value) => value);
});

test('direct sends encrypt the complete content and replies before transport', async () => {
  const payload = { type: 'file', text: 'private caption', fileName: 'private.txt', fileURL: 'ciphertext-url', fileEncryption: { key_b64: 'private-key' } };
  const replyTo = { id: 'prior', text: 'private quote' };
  await sendChatMessage({ threadType: 'direct', threadId: 'a_b', actorUid: 'a', targetUid: 'b', payload, replyTo });
  expect(JSON.parse(encryptMessageEnvelope.mock.calls[0][1].plaintext)).toEqual({ ...payload, replyTo });
  const wire = JSON.parse(apiRequest.mock.calls[0][1].body);
  expect(wire.payload).toEqual(envelope);
  expect(wire.replyTo).toBeUndefined();
  expect(JSON.stringify(wire)).not.toContain('private');
});

test('encrypted edits never submit plaintext text to the API', async () => {
  await editChatMessage({ threadType: 'direct', threadId: 'a_b', actorUid: 'a', targetUid: 'b', messageId: 'id', text: 'edited secret', content: { type: 'file', fileURL: 'encrypted-url', fileEncryption: { key_b64: 'private-key' } } });
  const wire = JSON.parse(apiRequest.mock.calls[0][1].body);
  expect(wire.text).toBeUndefined();
  expect(wire.content).toBeUndefined();
  expect(JSON.parse(encryptMessageEnvelope.mock.calls[0][1].plaintext)).toMatchObject({ type: 'file', fileURL: 'encrypted-url', text: 'edited secret' });
  expect(wire.payload).toEqual(envelope);
  expect(JSON.stringify(wire)).not.toContain('edited secret');
});

test('community posts stay outside direct encryption', async () => {
  await sendChatMessage({ threadType: 'group', threadId: 'group', actorUid: 'a', payload: { text: 'group post' } });
  expect(encryptMessageEnvelope).not.toHaveBeenCalled();
});

test('history uses the logged-in viewer and cannot replace server identifiers', async () => {
  apiRequest.mockResolvedValue({ messages: [{ ...envelope, id: 'real-id', senderId: 'a', receiverId: 'b' }] });
  decryptEnvelopeWithParticipants.mockResolvedValue(JSON.stringify({ text: 'secret', id: 'fake-id', senderId: 'mallory', type: 'text' }));
  const result = await fetchThreadMessages('direct', 'a_b', 'a');
  expect(decryptEnvelopeWithParticipants.mock.calls[0].slice(3)).toEqual(['b', 'a', 'a']);
  expect(result.messages[0]).toMatchObject({ id: 'real-id', senderId: 'a', text: 'secret' });
});

test('failed authentication does not display plaintext fallback or reset identities', async () => {
  apiRequest.mockResolvedValue({ messages: [{ ...envelope, id: 'id', senderId: 'a', receiverId: 'b', text: 'untrusted fallback' }] });
  decryptEnvelopeWithParticipants.mockResolvedValue(null);
  const result = await fetchThreadMessages('direct', 'a_b', 'b');
  expect(result.messages[0].text).toBe('[Unable to verify or decrypt message on this device]');
  expect(apiRequest).toHaveBeenCalledTimes(1);
});
