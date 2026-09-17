import { apiRequest } from './apiClient';

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('surfaces a domain-specific FastAPI detail instead of a generic 404', async () => {
  fetch.mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ detail: 'Contact must sign in with the updated app before encrypted messaging' }),
  });

  await expect(apiRequest('/api/keys/v2/bundle/bob/classical')).rejects.toThrow(
    'Contact must sign in with the updated app before encrypted messaging'
  );
});

test('turns an unmatched route into an actionable error', async () => {
  fetch.mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ message: 'Not Found' }),
  });

  await expect(apiRequest('/api/chat/messages/send', { method: 'POST' })).rejects.toThrow(
    'Backend API route not found: POST /api/chat/messages/send'
  );
});
