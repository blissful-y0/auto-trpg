// 게임 서버 API 래퍼

import { createClient } from '@/lib/supabase/client';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

// Supabase 세션에서 액세스 토큰 가져오기
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function fetchApi<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  // 인증 토큰 자동 추가
  const token = await getAccessToken();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'API 요청 실패' }));
    throw new Error(error.message ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// 세션 API
export const sessionApi = {
  list: () => fetchApi<unknown[]>('/api/sessions'),
  get: (id: string) => fetchApi<unknown>(`/api/sessions/${id}`),
  create: (data: unknown) =>
    fetchApi<unknown>('/api/sessions', { method: 'POST', body: data }),
  join: (id: string) =>
    fetchApi<unknown>(`/api/sessions/${id}/join`, { method: 'POST' }),
};

// 캐릭터 API
export const characterApi = {
  get: (sessionId: string) =>
    fetchApi<unknown>(`/api/sessions/${sessionId}/character`),
  create: (sessionId: string, data: unknown) =>
    fetchApi<unknown>(`/api/sessions/${sessionId}/character`, {
      method: 'POST',
      body: data,
    }),
};

// 채팅 API
export const chatApi = {
  getMessages: (sessionId: string) =>
    fetchApi<unknown[]>(`/api/sessions/${sessionId}/messages`),
  sendMessage: (sessionId: string, content: string, isOOC: boolean) =>
    fetchApi<unknown>(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: { content, isOOC },
    }),
};

// 규칙서 API
export const rulebookApi = {
  list: () => fetchApi<unknown[]>('/api/rulebooks'),
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const token = await getAccessToken();
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    const res = await fetch(`${API_BASE_URL}/api/rulebooks/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) throw new Error('업로드 실패');
    return res.json();
  },
};

// 설정 API
export const settingsApi = {
  getApiKeys: () => fetchApi<unknown[]>('/api/settings/api-keys'),
  addApiKey: (provider: string, key: string) =>
    fetchApi<unknown>('/api/settings/api-keys', {
      method: 'POST',
      body: { provider, key },
    }),
  deleteApiKey: (id: string) =>
    fetchApi<unknown>(`/api/settings/api-keys/${id}`, { method: 'DELETE' }),
  validateApiKey: (id: string) =>
    fetchApi<unknown>(`/api/settings/api-keys/${id}/validate`, {
      method: 'POST',
    }),
};
