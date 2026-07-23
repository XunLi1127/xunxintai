import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendMessage } from '../src/api';

describe('chat request fallback', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('user_profile', JSON.stringify({
      personal_preferences: 'x'.repeat(1024),
    }));
  });

  it('retries one non-JSON HTTP failure without optional user profile data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: { get: () => 'text/plain' },
        json: async () => { throw new Error('not json'); },
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/event-stream' },
        body: null,
      } as Response);
    const onError = vi.fn();

    await sendMessage(
      'conversation-id',
      'hello',
      null,
      vi.fn(),
      vi.fn(),
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { model: 'deepseek-v4-pro', providerId: 'provider-id' },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(firstBody.user_profile).toBeDefined();
    expect(retryBody.user_profile).toBeUndefined();
    expect(retryBody.message).toBe('hello');
    expect(retryBody.model).toBe('deepseek-v4-pro');
    expect(retryBody.provider_id).toBe('provider-id');
    expect(onError).not.toHaveBeenCalled();
  });
});
