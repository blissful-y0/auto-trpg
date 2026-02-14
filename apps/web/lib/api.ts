// 게임 서버 API 래퍼

import { createClient } from '@/lib/supabase/client';

const API_BASE_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
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
    throw new ApiError(message, res.status, error?.code);
  }

  return res.json();
}

// 세션 API
export const sessionApi = {
  list: () => fetchApi<{ data: unknown[] }>('/api/sessions'),
  get: (id: string) => fetchApi<{ data: unknown }>(`/api/sessions/${id}`),
  create: (data: unknown) =>
    fetchApi<{ data: unknown }>('/api/sessions', { method: 'POST', body: data }),
  join: (id: string) => fetchApi<{ data: unknown }>(`/api/sessions/${id}/join`, { method: 'POST' }),
  update: (id: string, data: unknown) =>
    fetchApi<{ data: unknown }>(`/api/sessions/${id}`, { method: 'PATCH', body: data }),
};

// 캐릭터 API
export const characterApi = {
  get: (sessionId: string) => fetchApi<{ data: unknown }>(`/api/sessions/${sessionId}/characters`),
  create: (sessionId: string, data: unknown) =>
    fetchApi<{ data: unknown }>(`/api/sessions/${sessionId}/characters`, {
      method: 'POST',
      body: data,
    }),
};

// 채팅 API
export const chatApi = {
  getMessages: (sessionId: string, options?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.before) params.set('before', options.before);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return fetchApi<{ data: unknown[] }>(`/api/sessions/${sessionId}/messages${qs ? `?${qs}` : ''}`);
  },
  sendMessage: (sessionId: string, content: string, isOOC: boolean) =>
    fetchApi<{ data: unknown }>(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: { content, type: isOOC ? 'ooc' : 'player' },
    }),
};

// 규칙서 API
export const rulebookApi = {
  list: () => fetchApi<{ data: unknown[] }>('/api/rulebooks'),
  get: (id: string) =>
    fetchApi<{ data: unknown & { chunkCount: number } }>(`/api/rulebooks/${id}`),

  /** 3단계 업로드: 메타등록 → S3 업로드 → 처리 시작 */
  upload: async (
    file: File,
    title: string,
    gameSystem?: string,
    onProgress?: (step: 'registering' | 'uploading' | 'processing') => void,
  ): Promise<{ rulebookId: string }> => {
    // Step 1: 메타데이터 등록 + presigned URL 획득
    onProgress?.('registering');
    const { data } = await fetchApi<{
      data: { rulebook: { id: string }; uploadUrl: string };
    }>('/api/rulebooks/upload', {
      method: 'POST',
      body: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        title,
        gameSystem: gameSystem || undefined,
      },
    });

    // Step 2: S3에 직접 업로드
    onProgress?.('uploading');
    const uploadRes = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error('파일 업로드에 실패했습니다');
    }

    // Step 3: 처리 시작
    onProgress?.('processing');
    await fetchApi(`/api/rulebooks/${data.rulebook.id}/process`, {
      method: 'POST',
    });

    return { rulebookId: data.rulebook.id };
  },

  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/rulebooks/${id}`, { method: 'DELETE' }),
};

// 설정 API — 백엔드 경로: /api/keys
export const settingsApi = {
  getApiKeys: () => fetchApi<{ data: unknown[] }>('/api/keys'),
  addApiKey: (provider: string, apiKey: string) =>
    fetchApi<{ data: unknown }>('/api/keys', {
      method: 'POST',
      body: { provider, apiKey },
    }),
  rotateApiKey: (provider: string, apiKey: string) =>
    fetchApi<{ data: { rotation: { rotated: boolean; previousKeyHint: string | null } } }>(
      `/api/keys/${provider}/rotate`,
      {
        method: 'POST',
        body: { apiKey },
      },
    ),
  rollbackApiKey: (provider: string) =>
    fetchApi<{ data: { rotation: { rolledBack: boolean; restoredKeyHint: string | null } } }>(
      `/api/keys/${provider}/rollback`,
      {
        method: 'POST',
      },
    ),
  deleteApiKey: (provider: string) =>
    fetchApi<{ message: string }>(`/api/keys/${provider}`, { method: 'DELETE' }),
  validateApiKey: (provider: string) =>
    fetchApi<{ data: { provider: string; isValid: boolean; message: string } }>(
      `/api/keys/${provider}/validate`,
      {
        method: 'POST',
      },
    ),
  getProviderModels: (provider: string) =>
    fetchApi<{
      data: {
        provider: string;
        source: 'live' | 'static';
        models: Array<{ id: string; label: string }>;
      };
    }>(`/api/keys/${provider}/models`),
};

// 세이브/로드 API
export const saveApi = {
  list: (sessionId: string) =>
    fetchApi<{
      data: Array<{
        id: string;
        sessionId: string;
        saveType: 'manual' | 'auto' | 'pause';
        name: string;
        sceneNumber: number;
        characterCount: number;
        createdBy: string;
        createdAt: string;
      }>;
    }>(`/api/sessions/${sessionId}/saves`),
  save: (sessionId: string, name?: string) =>
    fetchApi<{ data: { id: string; saveType: string; name: string; createdAt: string } }>(
      `/api/sessions/${sessionId}/save`,
      {
        method: 'POST',
        body: name ? { name } : {},
      },
    ),
  load: (sessionId: string, savePointId: string) =>
    fetchApi<{ data: { restored: boolean; snapshot: unknown } }>(
      `/api/sessions/${sessionId}/load/${savePointId}`,
      { method: 'POST' },
    ),
  delete: (sessionId: string, savePointId: string) =>
    fetchApi<{ message: string }>(`/api/sessions/${sessionId}/saves/${savePointId}`, {
      method: 'DELETE',
    }),
  pause: (sessionId: string) =>
    fetchApi<{ data: { savePointId: string; status: string } }>(
      `/api/sessions/${sessionId}/pause`,
      { method: 'PUT' },
    ),
  resume: (sessionId: string) =>
    fetchApi<{ data: { status: string } }>(`/api/sessions/${sessionId}/resume`, { method: 'PUT' }),
};

// 캠페인 API
export const campaignApi = {
  list: () => fetchApi<{ data: unknown[] }>('/api/campaigns'),
  get: (id: string) => fetchApi<{ data: unknown }>(`/api/campaigns/${id}`),
  create: (data: { name: string; description?: string; gameSystem?: string }) =>
    fetchApi<{ data: unknown }>('/api/campaigns', { method: 'POST', body: data }),
  update: (id: string, data: unknown) =>
    fetchApi<{ data: unknown }>(`/api/campaigns/${id}`, { method: 'PATCH', body: data }),
  createSession: (campaignId: string, data: unknown) =>
    fetchApi<{ data: unknown }>(`/api/campaigns/${campaignId}/sessions`, {
      method: 'POST',
      body: data,
    }),
  linkSession: (campaignId: string, sessionId: string) =>
    fetchApi<{ data: { linked: boolean } }>(
      `/api/campaigns/${campaignId}/sessions/${sessionId}/link`,
      { method: 'PUT' },
    ),
};
