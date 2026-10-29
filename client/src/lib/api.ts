import type { ApiError, CreateRoomRequest, ErrorCode, JoinRoomRequest, RoomPreview, SessionCredentials } from '@playtogether/shared';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode | 'NETWORK',
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiRequestError('Could not reach the server. Check your connection.', 'NETWORK', 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(err.error ?? `Request failed (${res.status})`, (err.code as ErrorCode) ?? 'INTERNAL', res.status);
  }
  return body as T;
}

export const api = {
  createRoom: (body: CreateRoomRequest) => request<SessionCredentials>('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
  previewRoom: (roomId: string) => request<RoomPreview>(`/api/rooms/${encodeURIComponent(roomId)}`),
  joinRoom: (roomId: string, body: JoinRoomRequest) =>
    request<SessionCredentials>(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST', body: JSON.stringify(body) }),
};
