'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Key, Plus, Trash2, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { settingsApi } from '@/lib/api';

interface ApiKey {
  id: string;
  provider: string;
  hint: string;
  addedAt: string;
  isValid: boolean | null;
}

const providerConfig: Record<string, { name: string; placeholder: string; color: string }> = {
  openai: { name: 'OpenAI', placeholder: 'sk-...', color: 'text-emerald-400' },
  anthropic: { name: 'Anthropic', placeholder: 'sk-ant-...', color: 'text-orange-400' },
  google: { name: 'Google AI', placeholder: 'AI...', color: 'text-blue-400' },
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

function mapApiKeysFromBackend(keys: any[]): ApiKey[] {
  return keys.map((k: any) => ({
    id: k.id,
    provider: providerToFrontend[k.provider] || k.provider,
    hint: k.key_hint || '***',
    addedAt: k.created_at ? new Date(k.created_at).toLocaleDateString('ko-KR') : '-',
    isValid: k.is_valid ?? null,
  }));
}

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newKeyProvider, setNewKeyProvider] = useState('anthropic');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [validating, setValidating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // API 키 목록 로드
  const loadKeys = async () => {
    try {
      setLoadError(null);
      const res = await settingsApi.getApiKeys() as any;
      const keys = res?.data || [];
      setApiKeys(mapApiKeysFromBackend(keys));
    } catch (err: any) {
      const msg = err.message || '서버에 연결할 수 없습니다';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadKeys(); }, []);

  const handleAddKey = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newKeyValue.trim()) return;

    setSaving(true);
    try {
      const backendProvider = providerToBackend[newKeyProvider] || newKeyProvider;
      await settingsApi.addApiKey(backendProvider, newKeyValue);
      toast.success('API 키가 등록되었습니다');
      setNewKeyValue('');
      await loadKeys();
    } catch (err: any) {
      const msg = err.message || 'API 키 등록에 실패했습니다';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (key: ApiKey) => {
    setDeleting(key.id);
    try {
      const backendProvider = providerToBackend[key.provider] || key.provider;
      await settingsApi.deleteApiKey(backendProvider);
      setApiKeys(apiKeys.filter((k) => k.id !== key.id));
      toast.success(`${providerConfig[key.provider]?.name || key.provider} 키가 삭제되었습니다`);
    } catch (err: any) {
      toast.error(err.message || 'API 키 삭제에 실패했습니다');
    } finally {
      setDeleting(null);
    }
  };

  const handleValidateKey = async (key: ApiKey) => {
    setValidating(key.id);
    try {
      const backendProvider = providerToBackend[key.provider] || key.provider;
      const res = await settingsApi.validateApiKey(backendProvider) as any;
      const isValid = res?.data?.isValid ?? false;
      setApiKeys(
        apiKeys.map((k) =>
          k.id === key.id ? { ...k, isValid } : k,
        ),
      );
      if (isValid) {
        toast.success('API 키가 유효합니다');
      } else {
        toast.error('API 키가 유효하지 않습니다');
      }
    } catch (err: any) {
      setApiKeys(
        apiKeys.map((k) =>
          k.id === key.id ? { ...k, isValid: false } : k,
        ),
      );
      toast.error(err.message || '검증에 실패했습니다');
    } finally {
      setValidating(null);
    }
  };

  const validityBadge = (isValid: boolean | null) => {
    if (isValid === true) {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
          <ShieldCheck size={12} /> 유효
        </span>
      );
    }
    if (isValid === false) {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
          <AlertCircle size={12} /> 만료됨
        </span>
      );
    }
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-600/30 text-slate-400 border border-slate-600/20">
        미검증
      </span>
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Key size={24} className="text-primary-400" />
          설정
        </h2>
        <p className="text-slate-400 mt-1">API 키 및 계정 설정을 관리하세요</p>
      </div>

      {/* API 키 관리 섹션 */}
      <div className="card p-6 mb-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-1">
            API 키 관리
          </h3>
          <p className="text-sm text-slate-400">
            BYOK(Bring Your Own Key) — 각 AI 프로바이더의 API 키를 등록하면 해당
            모델을 사용할 수 있습니다.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            키 목록 불러오는 중...
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-8">
            <AlertCircle size={32} className="text-red-400 mb-2" />
            <p className="text-red-400 text-sm mb-1">키 목록을 불러올 수 없습니다</p>
            <p className="text-slate-500 text-xs mb-3">{loadError}</p>
            <button onClick={loadKeys} className="text-xs text-primary-400 hover:text-primary-300">
              다시 시도
            </button>
          </div>
        ) : (
          <>
            {/* 등록된 키 목록 */}
            {apiKeys.length > 0 ? (
              <div className="space-y-2 mb-6">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center gap-3 p-4 bg-slate-700/30 rounded-xl border border-slate-700/50 hover:border-slate-600/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                      <Key size={18} className={providerConfig[key.provider]?.color || 'text-slate-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-200">
                          {providerConfig[key.provider]?.name ?? key.provider}
                        </span>
                        {validityBadge(key.isValid)}
                      </div>
                      <p className="text-xs text-slate-500 font-mono">
                        {key.hint}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleValidateKey(key)}
                        disabled={validating === key.id}
                        className="p-2 rounded-lg text-slate-400 hover:text-primary-400 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                        title="키 검증"
                      >
                        {validating === key.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <ShieldCheck size={16} />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteKey(key)}
                        disabled={deleting === key.id}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title="키 삭제"
                      >
                        {deleting === key.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 mb-6 bg-slate-700/20 rounded-xl border border-dashed border-slate-700">
                <Key size={28} className="text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">등록된 API 키가 없습니다</p>
                <p className="text-xs text-slate-600 mt-1">아래에서 키를 등록하세요</p>
              </div>
            )}
          </>
        )}

        {/* 새 키 등록 */}
        <div className="pt-4 border-t border-slate-700/50">
          <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
            <Plus size={16} />
            새 API 키 등록
          </h4>
          <form onSubmit={handleAddKey} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">프로바이더</label>
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
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">API 키</label>
                <input
                  type="password"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder={
                    providerConfig[newKeyProvider]?.placeholder ?? 'API 키 입력'
                  }
                  className="input-field"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!newKeyValue.trim() || saving}
              className="btn-primary w-full sm:w-auto disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  등록 중...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  키 등록
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* 도움말 */}
      <div className="card p-4 bg-slate-800/50 border-slate-700/50">
        <h4 className="text-sm font-medium text-slate-300 mb-2">API 키 발급 안내</h4>
        <ul className="text-xs text-slate-500 space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="text-orange-400 mt-0.5">{'>'}</span>
            <span>Anthropic: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">console.anthropic.com</a>에서 발급</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">{'>'}</span>
            <span>OpenAI: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">platform.openai.com</a>에서 발급</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">{'>'}</span>
            <span>Google AI: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">aistudio.google.com</a>에서 발급</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
