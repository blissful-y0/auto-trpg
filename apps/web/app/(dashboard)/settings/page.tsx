'use client';

import { useState } from 'react';

interface ApiKey {
  id: string;
  provider: string;
  hint: string;
  addedAt: string;
  isValid: boolean | null;
}

// Mock API 키 데이터
const mockApiKeys: ApiKey[] = [
  {
    id: '1',
    provider: 'openai',
    hint: 'sk-...Xf4g',
    addedAt: '2024-01-10',
    isValid: true,
  },
  {
    id: '2',
    provider: 'anthropic',
    hint: 'sk-ant-...Mn2k',
    addedAt: '2024-01-12',
    isValid: null,
  },
];

const providerConfig = {
  openai: { name: 'OpenAI', placeholder: 'sk-...' },
  anthropic: { name: 'Anthropic', placeholder: 'sk-ant-...' },
  google: { name: 'Google AI', placeholder: 'AI...' },
};

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(mockApiKeys);
  const [newKeyProvider, setNewKeyProvider] = useState('openai');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [validating, setValidating] = useState<string | null>(null);

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyValue.trim()) return;

    const hint =
      newKeyValue.slice(0, 5) + '...' + newKeyValue.slice(-4);
    const newKey: ApiKey = {
      id: Date.now().toString(),
      provider: newKeyProvider,
      hint,
      addedAt: new Date().toISOString().split('T')[0],
      isValid: null,
    };

    setApiKeys([...apiKeys, newKey]);
    setNewKeyValue('');
  };

  const handleDeleteKey = (id: string) => {
    setApiKeys(apiKeys.filter((k) => k.id !== id));
  };

  const handleValidateKey = async (id: string) => {
    setValidating(id);
    // TODO: 실제 API 키 유효성 검증
    await new Promise((r) => setTimeout(r, 1500));
    setApiKeys(
      apiKeys.map((k) =>
        k.id === id ? { ...k, isValid: true } : k,
      ),
    );
    setValidating(null);
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
                  onClick={() => handleValidateKey(key.id)}
                  disabled={validating === key.id}
                  className="text-xs text-primary-400 hover:text-primary-300 disabled:opacity-50"
                >
                  {validating === key.id ? '검증 중...' : '검증'}
                </button>
                <button
                  onClick={() => handleDeleteKey(key.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
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
            disabled={!newKeyValue.trim()}
            className="btn-primary disabled:opacity-50"
          >
            키 등록
          </button>
        </form>
      </div>
    </div>
  );
}
