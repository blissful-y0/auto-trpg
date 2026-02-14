'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Key,
  Plus,
  Trash2,
  ShieldCheck,
  Loader2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Edit3,
  Lock,
} from 'lucide-react';
import { settingsApi } from '@/lib/api';

interface ApiKey {
  id: string;
  provider: string;
  hint: string;
  previousKeyHint: string | null;
  addedAt: string;
  isValid: boolean | null;
  lastValidated: string | null;
}

interface ProviderModel {
  id: string;
  label: string;
}

const providerConfig: Record<string, { name: string; placeholder: string; color: string }> = {
  openai: { name: 'OpenAI', placeholder: 'sk-...', color: 'text-success' },
  anthropic: { name: 'Anthropic', placeholder: 'sk-ant-...', color: 'text-gold' },
  google: { name: 'Google AI', placeholder: 'AI...', color: 'text-info' },
};

const providerGuide: Record<string, { url: string; steps: string[] }> = {
  anthropic: {
    url: 'https://console.anthropic.com/settings/keys',
    steps: [
      'console.anthropic.com 접속 후 로그인',
      'Settings → API Keys 메뉴',
      'Create Key 클릭 → 키 복사',
    ],
  },
  openai: {
    url: 'https://platform.openai.com/api-keys',
    steps: [
      'platform.openai.com 접속 후 로그인',
      'API Keys 메뉴',
      'Create new secret key → 키 복사',
    ],
  },
  google: {
    url: 'https://aistudio.google.com/apikey',
    steps: [
      'aistudio.google.com 접속 후 로그인',
      'Get API Key 클릭',
      '프로젝트 선택 → 키 생성 → 복사',
    ],
  },
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

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '어제';
  return `${days}일 전`;
}

function mapApiKeysFromBackend(keys: any[]): ApiKey[] {
  return keys.map((k: any) => ({
    id: k.id,
    provider: providerToFrontend[k.provider] || k.provider,
    hint: k.key_hint || '***',
    previousKeyHint: k.previous_key_hint || null,
    addedAt: k.created_at ? new Date(k.created_at).toLocaleDateString('ko-KR') : '-',
    isValid: k.is_valid ?? null,
    lastValidated: k.updated_at ? getRelativeTime(k.updated_at) : null,
  }));
}

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [modelProvider, setModelProvider] = useState('anthropic');
  const [modelSource, setModelSource] = useState<'live' | 'static' | null>(null);
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // 프로바이더별 인라인 상태
  const [newKeyValues, setNewKeyValues] = useState<Record<string, string>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editKeyValue, setEditKeyValue] = useState('');
  const [showGuide, setShowGuide] = useState<string | null>(null);

  // API 키 목록 로드
  const loadKeys = async () => {
    try {
      setLoadError(null);
      const res = (await settingsApi.getApiKeys()) as any;
      const keys = res?.data || [];
      setApiKeys(mapApiKeysFromBackend(keys));
    } catch (err: any) {
      const msg = err.message || '서버에 연결할 수 없습니다';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const loadProviderModels = async (frontendProvider: string, silent = false) => {
    setLoadingModels(true);
    try {
      const backendProvider = providerToBackend[frontendProvider] || frontendProvider;
      const res = (await settingsApi.getProviderModels(backendProvider)) as any;
      setModelSource(res?.data?.source ?? null);
      setProviderModels(res?.data?.models ?? []);
    } catch (err: any) {
      setModelSource(null);
      setProviderModels([]);
      if (!silent) {
        toast.error(err.message || '모델 목록을 불러오지 못했습니다');
      }
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    void loadProviderModels(modelProvider, true);
  }, [modelProvider]);

  const handleSaveKey = async (provider: string) => {
    const existingKey = getKeyForProvider(provider);
    const keyValue = existingKey ? editKeyValue : newKeyValues[provider];
    if (!keyValue.trim()) return;

    const isRotate = Boolean(existingKey);

    setSaving(true);
    try {
      const backendProvider = providerToBackend[provider] || provider;
      const res = isRotate
        ? await settingsApi.rotateApiKey(backendProvider, keyValue)
        : await settingsApi.addApiKey(backendProvider, keyValue);
      const autoValidation = (res as any)?.data?.autoValidation;
      if (autoValidation?.isValid) {
        toast.success(
          isRotate ? 'API 키가 회전되고 검증되었습니다' : 'API 키가 등록되고 검증되었습니다',
        );
      } else if (autoValidation && !autoValidation.isValid) {
        toast.success(
          isRotate
            ? 'API 키가 회전되었지만 검증에 실패했습니다. 키를 확인해주세요'
            : 'API 키가 등록되었습니다 (검증 실패 -- 키를 확인해주세요)',
        );
      } else {
        toast.success(isRotate ? 'API 키가 회전되었습니다' : 'API 키가 등록되었습니다');
      }
      if (isRotate) {
        setEditingProvider(null);
        setEditKeyValue('');
      } else {
        setNewKeyValues((prev) => ({ ...prev, [provider]: '' }));
      }
      await loadKeys();
    } catch (err: any) {
      const msg = err.message || (isRotate ? 'API 키 회전에 실패했습니다' : 'API 키 등록에 실패했습니다');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRollbackKey = async (key: ApiKey) => {
    const backendProvider = providerToBackend[key.provider] || key.provider;
    setRollingBack(key.id);
    try {
      const res = (await settingsApi.rollbackApiKey(backendProvider)) as any;
      const restoredHint = res?.data?.rotation?.restoredKeyHint;
      if (restoredHint) {
        toast.success(`이전 키(${restoredHint})로 복원되었습니다`);
      } else {
        toast.success('이전 키로 복원되었습니다');
      }
      await loadKeys();
    } catch (err: any) {
      const msg = err.message || 'API 키 롤백에 실패했습니다';
      toast.error(msg);
    } finally {
      setRollingBack(null);
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
      const res = (await settingsApi.validateApiKey(backendProvider)) as any;
      const isValid = res?.data?.isValid ?? false;
      setApiKeys(apiKeys.map((k) => (k.id === key.id ? { ...k, isValid } : k)));
      if (isValid) {
        toast.success('API 키가 유효합니다');
      } else {
        toast.error('API 키가 유효하지 않습니다');
      }
    } catch (err: any) {
      setApiKeys(apiKeys.map((k) => (k.id === key.id ? { ...k, isValid: false } : k)));
      toast.error(err.message || '검증에 실패했습니다');
    } finally {
      setValidating(null);
    }
  };

  const validityBadge = (isValid: boolean | null) => {
    if (isValid === true) {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success/15 text-success">
          <ShieldCheck size={12} /> 유효
        </span>
      );
    }
    if (isValid === false) {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-danger/15 text-danger">
          <AlertCircle size={12} /> 만료됨
        </span>
      );
    }
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-bg-overlay text-text-tertiary border border-line">
        미검증
      </span>
    );
  };

  const getKeyForProvider = (provider: string): ApiKey | undefined => {
    return apiKeys.find((k) => k.provider === provider);
  };

  // 프로바이더 카드 순서
  const providerOrder = ['anthropic', 'openai', 'google'];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-heading-1 text-text-primary flex items-center gap-2">
          <Key size={24} className="text-gold" />
          설정
        </h2>
        <p className="text-text-tertiary mt-1">API 키 및 계정 설정을 관리하세요</p>
      </div>

      {/* API 키 관리 — 프로바이더별 카드 */}
      <div className="mb-6">
        <div className="mb-4">
          <h3 className="text-heading-3 text-text-primary mb-1">API 키 관리</h3>
          <p className="text-sm text-text-tertiary">
            BYOK(Bring Your Own Key) -- 각 AI 프로바이더의 API 키를 등록하면 해당 모델을 사용할 수
            있습니다.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-tertiary">
            <Loader2 size={20} className="animate-spin mr-2" />키 목록 불러오는 중...
          </div>
        ) : loadError ? (
          <div className="card p-6 flex flex-col items-center py-8">
            <AlertCircle size={32} className="text-danger mb-2" />
            <p className="text-danger text-sm mb-1">키 목록을 불러올 수 없습니다</p>
            <p className="text-text-tertiary text-xs mb-3">{loadError}</p>
            <button onClick={loadKeys} className="text-xs text-gold hover:text-gold-dim">
              다시 시도
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {providerOrder.map((provider) => {
              const config = providerConfig[provider];
              const guide = providerGuide[provider];
              const existingKey = getKeyForProvider(provider);
              const isEditing = editingProvider === provider;

              return (
                <div
                  key={provider}
                  className="card p-5 border border-line hover:border-line-strong transition-colors"
                >
                  {/* 카드 헤더 */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-bg-inset flex items-center justify-center shrink-0">
                      <Key size={18} className={config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          {config.name}
                        </span>
                        {existingKey ? (
                          validityBadge(existingKey.isValid)
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-bg-overlay text-text-tertiary border border-line">
                            미등록
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 등록된 키 정보 */}
                  {existingKey && !isEditing && (
                    <div className="space-y-3">
                      <div className="bg-bg-inset rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-text-tertiary">키 힌트</span>
                          <span className="text-sm font-mono text-text-secondary">
                            {existingKey.hint}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-text-tertiary">등록일</span>
                          <span className="text-xs text-text-secondary">{existingKey.addedAt}</span>
                        </div>
                        {existingKey.lastValidated && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-text-tertiary">마지막 검증</span>
                            <span className="text-xs text-text-secondary">
                              {existingKey.lastValidated}
                            </span>
                          </div>
                        )}
                        {existingKey.previousKeyHint && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-text-tertiary">이전 키</span>
                            <span className="text-xs font-mono text-text-secondary">
                              {existingKey.previousKeyHint}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleValidateKey(existingKey)}
                          disabled={validating === existingKey.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-gold hover:bg-bg-inset transition-colors disabled:opacity-50"
                        >
                          {validating === existingKey.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                          검증
                        </button>
                        <button
                          onClick={() => {
                            setEditingProvider(provider);
                            setEditKeyValue('');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-info hover:bg-bg-inset transition-colors"
                        >
                          <Edit3 size={14} />
                          키 회전
                        </button>
                        <button
                          onClick={() => handleDeleteKey(existingKey)}
                          disabled={deleting === existingKey.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                        >
                          {deleting === existingKey.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          삭제
                        </button>
                        <button
                          onClick={() => handleRollbackKey(existingKey)}
                          disabled={rollingBack === existingKey.id || !existingKey.previousKeyHint}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-gold hover:bg-bg-inset transition-colors disabled:opacity-50"
                        >
                          {rollingBack === existingKey.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                          이전 키로 롤백
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 키 변경 인라인 폼 */}
                  {existingKey && isEditing && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={editKeyValue}
                          onChange={(e) => setEditKeyValue(e.target.value)}
                          placeholder={config.placeholder}
                          className="input-field flex-1"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveKey(provider)}
                          disabled={!editKeyValue.trim() || saving}
                          className="btn-primary px-4 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                        >
                          {saving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                          회전
                        </button>
                        <button
                          onClick={() => {
                            setEditingProvider(null);
                            setEditKeyValue('');
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-inset transition-colors"
                        >
                          취소
                        </button>
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
                        <Lock size={12} />
                        API 키는 AES-256-GCM으로 암호화되어 저장됩니다. 평문은 서버에 보관되지
                        않습니다.
                      </p>
                    </div>
                  )}

                  {/* 미등록 — 인라인 등록 폼 */}
                  {!existingKey && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={newKeyValues[provider] || ''}
                          onChange={(e) =>
                            setNewKeyValues((prev) => ({ ...prev, [provider]: e.target.value }))
                          }
                          placeholder={config.placeholder}
                          className="input-field flex-1"
                        />
                        <button
                          onClick={() => handleSaveKey(provider)}
                          disabled={!(newKeyValues[provider] || '').trim() || saving}
                          className="btn-primary px-4 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                        >
                          {saving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Plus size={14} />
                          )}
                          등록
                        </button>
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
                        <Lock size={12} />
                        API 키는 AES-256-GCM으로 암호화되어 저장됩니다. 평문은 서버에 보관되지
                        않습니다.
                      </p>
                    </div>
                  )}

                  {/* 발급 가이드 토글 */}
                  <div className="mt-4 pt-3 border-t border-line">
                    <button
                      onClick={() => setShowGuide(showGuide === provider ? null : provider)}
                      className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                      {showGuide === provider ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                      발급 가이드 보기
                    </button>

                    {showGuide === provider && (
                      <div className="mt-3 space-y-2">
                        <ol className="text-xs text-text-tertiary space-y-1.5 list-none">
                          {guide.steps.map((step, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-text-tertiary font-mono shrink-0">
                                {i + 1}.
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                        <a
                          href={guide.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline mt-1"
                        >
                          <ExternalLink size={12} />
                          {config.name} 키 발급 페이지
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 제공 모델 목록 */}
      <div className="card p-6 mb-6">
        <div className="mb-4">
          <h3 className="text-heading-3 text-text-primary mb-1">제공 모델 목록</h3>
          <p className="text-sm text-text-tertiary">등록된 API 키로 최신 모델 목록을 조회합니다.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs text-text-tertiary mb-1">프로바이더</label>
            <select
              value={modelProvider}
              onChange={(e) => setModelProvider(e.target.value)}
              className="input-field"
            >
              {Object.entries(providerConfig).map(([id, config]) => (
                <option key={id} value={id}>
                  {config.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button
              onClick={() => loadProviderModels(modelProvider)}
              disabled={loadingModels}
              className="btn-primary w-full sm:w-auto disabled:opacity-50 flex items-center justify-center gap-2"
              type="button"
            >
              {loadingModels ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  조회 중...
                </>
              ) : (
                '모델 새로고침'
              )}
            </button>
          </div>
        </div>

        <div className="text-xs text-text-tertiary mb-3">
          {modelSource === 'live' && '실시간 모델 목록'}
          {modelSource === 'static' && '정적 fallback 모델 목록'}
          {modelSource === null && '모델 목록을 조회하세요'}
        </div>

        {providerModels.length > 0 ? (
          <div className="max-h-56 overflow-auto rounded-lg border border-line bg-bg-inset p-2 space-y-1">
            {providerModels.map((model) => (
              <div
                key={model.id}
                className="px-3 py-2 rounded-md bg-bg-overlay text-sm text-text-secondary"
              >
                <div className="font-medium">{model.label || model.id}</div>
                <div className="text-xs text-text-tertiary mt-0.5">{model.id}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-text-tertiary">조회된 모델이 없습니다.</div>
        )}
      </div>

      {/* 도움말 */}
      <div className="card p-4">
        <h4 className="text-sm font-medium text-text-secondary mb-2">API 키 발급 안내</h4>
        <ul className="text-xs text-text-tertiary space-y-1.5">
          {providerOrder.map((provider) => {
            const config = providerConfig[provider];
            const guide = providerGuide[provider];
            return (
              <li key={provider} className="flex items-start gap-2">
                <span className={`${config.color} mt-0.5`}>{'>'}</span>
                <span>
                  {config.name}:{' '}
                  <a
                    href={guide.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold hover:underline"
                  >
                    {new URL(guide.url).hostname}
                  </a>
                  에서 발급
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
