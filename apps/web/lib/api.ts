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
  if (!token) {
    throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  }

  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('게임 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => null);
    const message = error?.message ?? `서버 오류 (HTTP ${res.status})`;
    throw new Error(message);
  }

  return res.json();
}

// 세션 API
export const sessionApi = {
  list: () => fetchApi<{ data: unknown[] }>('/api/sessions'),
  get: (id: string) => fetchApi<{ data: unknown }>(`/api/sessions/${id}`),
  create: (data: unknown) =>
    fetchApi<{ data: unknown }>('/api/sessions', { method: 'POST', body: data }),
  join: (id: string) =>
    fetchApi<{ data: unknown }>(`/api/sessions/${id}/join`, { method: 'POST' }),
};

// 캐릭터 API
export const characterApi = {
  get: (sessionId: string) =>
    fetchApi<{ data: unknown }>(`/api/sessions/${sessionId}/character`),
  create: (sessionId: string, data: unknown) =>
    fetchApi<{ data: unknown }>(`/api/sessions/${sessionId}/character`, {
      method: 'POST',
      body: data,
    }),
};

// 채팅 API
export const chatApi = {
  getMessages: (sessionId: string) =>
    fetchApi<{ data: unknown[] }>(`/api/sessions/${sessionId}/messages`),
  sendMessage: (sessionId: string, content: string, isOOC: boolean) =>
    fetchApi<{ data: unknown }>(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: { content, type: isOOC ? 'ooc' : 'player' },
    }),
};

// 규칙서 API
export const rulebookApi = {
  list: () => fetchApi<{ data: unknown[] }>('/api/rulebooks'),
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const token = await getAccessToken();
    if (!token) {
      throw new Error('로그인이 필요합니다.');
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/api/rulebooks/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
    } catch {
      throw new Error('서버에 연결할 수 없습니다.');
    }

    if (!res.ok) throw new Error('업로드 실패');
    return res.json();
  },
};

// 설정 API — 백엔드 경로: /api/keys
export const settingsApi = {
  getApiKeys: () => fetchApi<{ data: unknown[] }>('/api/keys'),
  addApiKey: (provider: string, apiKey: string) =>
    fetchApi<{ data: unknown }>('/api/keys', {
      method: 'POST',
      body: { provider, apiKey },
    }),
  deleteApiKey: (provider: string) =>
    fetchApi<{ message: string }>(`/api/keys/${provider}`, { method: 'DELETE' }),
  validateApiKey: (provider: string) =>
    fetchApi<{ data: { provider: string; isValid: boolean; message: string } }>(`/api/keys/${provider}/validate`, {
      method: 'POST',
    }),
};
