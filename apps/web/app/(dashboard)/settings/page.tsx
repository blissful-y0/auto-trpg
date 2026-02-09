'use client';

import { useState, useEffect } from 'react';
import { settingsApi } from '@/lib/api';

interface ApiKey {
  id: string;
  provider: string;
  hint: string;
  addedAt: string;
  isValid: boolean | null;
}

const providerConfig = {
  openai: { name: 'OpenAI', placeholder: 'sk-...' },
  anthropic: { name: 'Anthropic', placeholder: 'sk-ant-...' },
  google: { name: 'Google AI', placeholder: 'AI...' },
};

// 프론트엔드 → 백엔드 프로바이더 이름 매핑
const providerToBackend: Record<string, string> = {
  anthropic: 'claude',
  openai: 'openai',
  google: 'gemini',
};

// 백엔드 → 프론트엔드 프로바이더 이름 매핑
const providerToFrontend: Record<string, string> = {
  claude: 'anthropic',
  openai: 'openai',
  gemini: 'google',
};

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyProvider, setNewKeyProvider] = useState('openai');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [validating, setValidating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // API 키 목록 로드
  useEffect(() => {
    settingsApi.getApiKeys()
      .then((res: any) => {
        const keys = res?.data || [];
        setApiKeys(keys.map((k: any) => ({
          id: k.id,
          provider: providerToFrontend[k.provider] || k.provider,
          hint: k.key_hint || '***',
          addedAt: k.created_at ? new Date(k.created_at).toLocaleDateString('ko-KR') : '-',
          isValid: k.is_valid ?? null,
        })));
      })
      .catch(() => {
        // API 키 로드 실패 시 빈 배열 유지
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAddKey = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newKeyValue.trim()) return;

    setSaving(true);
    try {
      const backendProvider = providerToBackend[newKeyProvider] || newKeyProvider;
      await settingsApi.addApiKey(backendProvider, newKeyValue);

      // 성공 시 목록 새로고침
      const res = await settingsApi.getApiKeys() as any;
      const keys = res?.data || [];
      setApiKeys(keys.map((k: any) => ({
        id: k.id,
        provider: providerToFrontend[k.provider] || k.provider,
        hint: k.key_hint || '***',
        addedAt: k.created_at ? new Date(k.created_at).toLocaleDateString('ko-KR') : '-',
        isValid: k.is_valid ?? null,
      })));
      setNewKeyValue('');
    } catch (err: any) {
      alert(err.message || 'API 키 등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (key: ApiKey) => {
    try {
      const backendProvider = providerToBackend[key.provider] || key.provider;
      await settingsApi.deleteApiKey(backendProvider);
      setApiKeys(apiKeys.filter((k) => k.id !== key.id));
    } catch (err: any) {
      alert(err.message || 'API 키 삭제에 실패했습니다.');
    }
  };

  const handleValidateKey = async (key: ApiKey) => {
    setValidating(key.id);
    try {
      const backendProvider = providerToBackend[key.provider] || key.provider;
      await settingsApi.validateApiKey(backendProvider);
      setApiKeys(
        apiKeys.map((k) =>
          k.id === key.id ? { ...k, isValid: true } : k,
        ),
      );
    } catch {
      setApiKeys(
        apiKeys.map((k) =>
          k.id === key.id ? { ...k, isValid: false } : k,
        ),
      );
    } finally {
      setValidating(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-100 mb-2">설정</h2>
      <p className="text-slate-400 mb-8">API 키 및 계정 설정을 관리하세요</p>

      {/* API 키 관리 섹션 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">
          API 키 관리
        </h3>
        <p className="text-sm text-slate-400 mb-6">
          BYOK(Bring Your Own Key) — 각 AI 프로바이더의 API 키를 등록하면 해당
          모델을 사용할 수 있습니다.
        </p>

        {loading ? (
          <p className="text-slate-400 text-sm mb-6">키 목록 불러오는 중...</p>
        ) : (
          <>
            {/* 등록된 키 목록 */}
            {apiKeys.length > 0 && (
              <div className="space-y-3 mb-6">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200">
                          {providerConfig[key.provider as keyof typeof providerConfig]?.name ?? key.provider}
                        </span>
                        {key.isValid === true && (
                          <span className="text-xs text-green-400">유효</span>
                        )}
                        {key.isValid === false && (
                          <span className="text-xs text-red-400">만료됨</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        {key.hint}
                      </p>
                    </div>
                    <button
                      onClick={() => handleValidateKey(key)}
                      disabled={validating === key.id}
                      className="text-xs text-primary-400 hover:text-primary-300 disabled:opacity-50"
                    >
                      {validating === key.id ? '검증 중...' : '검증'}
                    </button>
                    <button
                      onClick={() => handleDeleteKey(key)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 새 키 등록 */}
        <form onSubmit={handleAddKey} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <select
              value={newKeyProvider}
              onChange={(e) => setNewKeyProvider(e.target.value)}
              className="input-field"
            >
              {Object.entries(providerConfig).map(([id, config]) => (
                <option key={id} value={id}>
                  {config.name}
                </option>
              ))}
            </select>
            <input
              type="password"
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
              placeholder={
                providerConfig[newKeyProvider as keyof typeof providerConfig]
                  ?.placeholder ?? 'API 키'
              }
              className="input-field col-span-2"
            />
          </div>
          <button
            type="submit"
            disabled={!newKeyValue.trim() || saving}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? '등록 중...' : '키 등록'}
          </button>
        </form>
      </div>
    </div>
  );
}
