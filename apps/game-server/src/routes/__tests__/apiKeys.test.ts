import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler';

const openaiModelsList = vi.hoisted(() => vi.fn());
const claudeModelsList = vi.hoisted(() => vi.fn());
const geminiGenerateContent = vi.hoisted(() => vi.fn());
const listProviderModels = vi.hoisted(() => vi.fn());
const mockSupabaseFrom = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    models: {
      list: openaiModelsList,
    },
  })),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    models: {
      list: claudeModelsList,
    },
  })),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: geminiGenerateContent,
    })),
  })),
}));

vi.mock('../../services/llm/modelCatalog', () => ({
  listProviderModels: (...args: unknown[]) => listProviderModels(...args),
}));

type ApiKeyRow = {
  id: string;
  user_id: string;
  provider: string;
  encrypted_key: string;
  iv: string;
  auth_tag: string;
  key_hint: string;
  previous_encrypted_key?: string | null;
  previous_iv?: string | null;
  previous_auth_tag?: string | null;
  previous_key_hint?: string | null;
  is_valid: boolean | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type MockDbState = {
  userApiKeys: ApiKeyRow[];
};

type MockQuery = {
  select: (columns?: string) => MockQuery;
  insert: (payload: unknown) => MockQuery;
  update: (payload: Record<string, unknown>) => MockQuery;
  eq: (column: string, value: unknown) => MockQuery;
  is: (column: string, value: unknown) => MockQuery;
  order: (
    column: string,
    _options?: { ascending?: boolean },
  ) => MockQuery;
  single: () => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
  catch: (onRejected: (reason: unknown) => unknown) => Promise<unknown>;
  finally: (onFinally: () => void) => Promise<unknown>;
};

function createUnsupportedQueryChain(table: string): MockQuery {
  const errorResult = {
    data: null,
    error: { message: `mock table ${table} is not supported` },
  } as const;

  const chain: MockQuery = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    single: async () => errorResult,
    maybeSingle: async () => errorResult,
    then: () => Promise.resolve(errorResult),
    catch: () => Promise.resolve(errorResult),
    finally: (onFinally) => {
      onFinally();
      return Promise.resolve(errorResult);
    },
  };

  return chain;
}

function createQueryChain(state: MockDbState, table: string): MockQuery {
  if (table !== 'user_api_keys') {
    return createUnsupportedQueryChain(table);
  }

  let mode: 'select' | 'insert' | 'update' = 'select';
  let selectColumns: string | null = null;
  let orderColumn: string | null = null;
  let orderAscending = true;
  let insertPayload: unknown = null;
  let updatePayload: Record<string, unknown> | null = null;
  const whereClauses: Array<
    { type: 'eq'; column: string; value: unknown } | { type: 'is'; column: string; value: unknown }
  > = [];

  const now = () => new Date().toISOString();

  const applyWhere = (rows: ApiKeyRow[]) => {
    return rows.filter((row) => {
      return whereClauses.every((clause) => {
        if (clause.type === 'eq') {
          return (row as Record<string, unknown>)[clause.column] === clause.value;
        }

        if (clause.value === null) {
          return row[clause.column] === null;
        }

        return false;
      });
    });
  };

  const applyOrder = (rows: ApiKeyRow[]) => {
    if (!orderColumn) return rows;

    return [...rows].sort((a, b) => {
      const lhs = String((a as Record<string, unknown>)[orderColumn]);
      const rhs = String((b as Record<string, unknown>)[orderColumn]);
      const cmp = lhs.localeCompare(rhs);

      return orderAscending ? cmp : -cmp;
    });
  };

  const projectRows = (rows: ApiKeyRow[]) => {
    if (!selectColumns || selectColumns === '*') {
      return rows.map((row) => ({ ...row }));
    }

    const columns = selectColumns
      .split(',')
      .map((column) => column.trim())
      .filter(Boolean);

    return rows.map((row) => {
      const projected: Record<string, unknown> = {};

      for (const column of columns) {
        projected[column] = (row as Record<string, unknown>)[column];
      }

      return projected;
    });
  };

  const run = async (): Promise<{ data: unknown; error: unknown }> => {
    const baseRows = applyOrder(applyWhere(state.userApiKeys));

    if (mode === 'insert') {
      const normalizedPayloads = Array.isArray(insertPayload)
        ? insertPayload
        : [insertPayload];

      const inserted = normalizedPayloads.map((payload, index) => {
        const row = {
          ...(payload as ApiKeyRow),
          id: `key-${state.userApiKeys.length + index + 1}`,
          created_at: now(),
          updated_at: now(),
          deleted_at: null,
        } as ApiKeyRow;

        state.userApiKeys.push(row);
        return row;
      });

      return {
        data: projectRows(inserted),
        error: null,
      };
    }

    if (mode === 'update') {
      const targetIds = new Set(baseRows.map((row) => row.id));

      state.userApiKeys = state.userApiKeys.map((row) => {
        if (!targetIds.has(row.id) || updatePayload === null) {
          return row;
        }

        return {
          ...row,
          ...updatePayload,
          updated_at: now(),
        } as ApiKeyRow;
      });

      const updated = state.userApiKeys.filter((row) =>
        targetIds.has(row.id),
      );

      return {
        data: projectRows(updated),
        error: null,
      };
    }

    return {
      data: projectRows(baseRows),
      error: null,
    };
  };

  const runSingle = async () => {
    const result = await run();

    if (Array.isArray(result.data)) {
      return {
        data: result.data[0] ?? null,
        error: result.error,
      };
    }

    return {
      data: result.data ?? null,
      error: result.error,
    };
  };

  const chain = {
    select: (columns = '*') => {
      selectColumns = columns;
      return chain;
    },
    insert: (payload: unknown) => {
      mode = 'insert';
      insertPayload = payload;
      return chain;
    },
    update: (payload: Record<string, unknown>) => {
      mode = 'update';
      updatePayload = payload;
      return chain;
    },
    eq: (column: string, value: unknown) => {
      whereClauses.push({ type: 'eq', column, value });
      return chain;
    },
    is: (column: string, value: unknown) => {
      whereClauses.push({ type: 'is', column, value });
      return chain;
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      orderColumn = column;
      orderAscending = options?.ascending !== false;
      return chain;
    },
    single: runSingle,
    maybeSingle: runSingle,
    then: (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const promise = run();
      return promise.then(onFulfilled, onRejected);
    },
    catch: (onRejected: (reason: unknown) => unknown) => run().catch(onRejected),
    finally: (onFinally: () => void) => run().finally(onFinally),
  } as MockQuery;

  return chain;
}

const dbState: MockDbState = { userApiKeys: [] };

vi.mock('../../lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args: [string]) => mockSupabaseFrom(...args),
  },
}));

vi.mock('../../config', () => ({
  config: {
    port: 3001,
    nodeEnv: 'test',
    supabase: {
      url: 'http://localhost:54321',
      anonKey: 'anon-key',
      serviceRoleKey: 'service-key',
    },
    redis: {
      url: 'redis://localhost:6379',
    },
    aws: {
      region: 'ap-northeast-2',
      s3Bucket: 'auto-trpg-rulebooks',
      accessKeyId: '',
      secretAccessKey: '',
    },
    encryption: {
      secret: 'test-server-secret',
    },
    cors: {
      origin: 'http://localhost:3000',
    },
  },
}));

import apiKeysRouter from '../apiKeys';

type RouteErrorBody = {
  status: string;
  message: string;
};

let activeUserId = 'user-1';
let testCaseCounter = 0;
let requestAgent: ReturnType<typeof supertest>;

function createApiKeysTestApp() {
  const app: Express = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = {
      id: activeUserId,
    };
    req.accessToken = 'test-token';
    next();
  });

  app.use('/api/keys', apiKeysRouter);
  app.use(errorHandler);

  return app;
}

describe('apiKeys 라우트 통합 테스트', () => {
  let app: Express;

  beforeEach(() => {
    activeUserId = `user-${++testCaseCounter}`;
    app = createApiKeysTestApp();
    requestAgent = request(app);

    dbState.userApiKeys.length = 0;
    openaiModelsList.mockReset().mockResolvedValue({
      data: [{ id: 'gpt-4o-mini' }],
    });
    claudeModelsList.mockReset().mockResolvedValue({
      data: [{ id: 'claude-3-5-sonnet-20240620' }],
    });
    geminiGenerateContent.mockReset().mockResolvedValue({
      response: { text: 'ok' },
    });
    listProviderModels.mockReset().mockResolvedValue({
      provider: 'openai',
      source: 'live',
      models: [{ id: 'gpt-4o-mini', label: 'GPT-4o Mini' }],
    });

    mockSupabaseFrom.mockReset().mockImplementation((table: string) => {
      return createQueryChain(dbState, table);
    });
  });

  it('POST /api/keys는 기존 키가 없으면 새 키를 등록하고 201을 반환해야 한다', async () => {
    const res = await requestAgent
      .post('/api/keys')
      .send({ provider: 'openai', apiKey: 'sk-openai-test-key-123456' });

    const body = res.body as {
      data: {
        provider: string;
        key_hint: string;
        is_valid: boolean;
      };
    };
    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      data: {
        provider: 'openai',
        key_hint: 'sk-o...3456',
        is_valid: true,
      },
    });
  });

  it('POST /api/keys는 기존 provider 키가 있으면 업데이트하고 200을 반환해야 한다', async () => {
    const first = await requestAgent
      .post('/api/keys')
      .send({ provider: 'openai', apiKey: 'sk-openai-first-111111' });
    const firstBody = first.body as { data: { id: string; key_hint: string } };

    const second = await requestAgent
      .post('/api/keys')
      .send({ provider: 'openai', apiKey: 'sk-openai-second-222222' });
    const secondBody = second.body as { data: { id: string; key_hint: string } };

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(secondBody.data.id).toBe(firstBody.data.id);
    expect(secondBody.data.key_hint).toBe('sk-o...2222');
  });

  it('GET /api/keys는 사용자 키 목록 힌트를 반환해야 한다', async () => {
    await requestAgent
      .post('/api/keys')
      .send({ provider: 'openai', apiKey: 'sk-openai-test-key-123456' });

    await requestAgent
      .post('/api/keys')
      .send({ provider: 'claude', apiKey: 'sk-claude-test-key-123456' });

    const res = await requestAgent.get('/api/keys');
    const body = res.body as { data: Array<{ provider: string; key_hint: string }> };

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data.map((item) => item.provider)).toEqual(['claude', 'openai']);
    expect(body.data.every((item) => item.key_hint.includes('...'))).toBe(true);
  });

  it('GET /api/keys/:provider/models는 모델 목록을 조회하고 캐시한다', async () => {
    await requestAgent
      .post('/api/keys')
      .send({ provider: 'openai', apiKey: 'sk-openai-test-key-123456' });

    const first = await requestAgent.get('/api/keys/openai/models');
    const second = await requestAgent.get('/api/keys/openai/models');

    const firstBody = first.body as {
      data: {
        provider: string;
        models: Array<{ id: string; label: string }>;
      };
    };
    const secondBody = second.body as typeof firstBody;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody).toMatchObject({
      data: {
        provider: 'openai',
        models: [{ id: 'gpt-4o-mini', label: 'GPT-4o Mini' }],
      },
    });
    expect(firstBody).toEqual(secondBody);
    expect(listProviderModels).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/keys/:provider 삭제 시 404 처리와 400 유효성 검증을 수행해야 한다', async () => {
    const missing = await requestAgent.delete('/api/keys/openai');
    const missingBody = missing.body as RouteErrorBody;

    expect(missing.status).toBe(404);
    expect(missingBody.message).toBe('openai API 키가 등록되지 않았습니다.');

    const invalid = await requestAgent.delete('/api/keys/wrong');
    const invalidBody = invalid.body as RouteErrorBody;

    expect(invalid.status).toBe(400);
    expect(invalidBody.message).toMatch(/provider 파라미터가 올바르지 않습니다/);
  });

  it('DELETE는 삭제 후 해당 provider 모델 캐시를 무효화해야 한다', async () => {
    await requestAgent
      .post('/api/keys')
      .send({ provider: 'claude', apiKey: 'sk-claude-base-key-123456' });

    listProviderModels.mockResolvedValue({
      provider: 'claude',
      source: 'live',
      models: [{ id: 'claude-1', label: 'claude-1' }],
    });

    await requestAgent.get('/api/keys/claude/models');

    await requestAgent.delete('/api/keys/claude');

    listProviderModels.mockResolvedValue({
      provider: 'claude',
      source: 'live',
      models: [{ id: 'claude-2', label: 'claude-2' }],
    });

    await requestAgent
      .post('/api/keys')
      .send({ provider: 'claude', apiKey: 'sk-claude-readded-key-987654' });

    await requestAgent.get('/api/keys/claude/models');

    expect(listProviderModels).toHaveBeenCalledTimes(2);
  });

  it('POST /api/keys/:provider/validate는 false 응답을 반영해야 한다', async () => {
    await requestAgent
      .post('/api/keys')
      .send({ provider: 'openai', apiKey: 'sk-openai-valid-123456' });

    openaiModelsList.mockRejectedValueOnce(new Error('invalid key'));

    const res = await requestAgent.post('/api/keys/openai/validate');
    const body = res.body as {
      data: {
        provider: string;
        isValid: boolean;
        message: string;
      };
    };

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      provider: 'openai',
      isValid: false,
      message: 'API 키가 유효하지 않습니다.',
    });
  });

  it('POST /api/keys/:provider/rotate는 기존 키를 새 키로 회전하고 이전 키를 보관해야 한다', async () => {
    await requestAgent
      .post('/api/keys')
      .send({ provider: 'openai', apiKey: 'sk-openai-test-key-111111' });

    const before = dbState.userApiKeys.find((item) => item.provider === 'openai');
    expect(before).toBeTruthy();

    const beforeKeyHint = before?.key_hint;

    const rotateRes = await requestAgent
      .post('/api/keys/openai/rotate')
      .send({ apiKey: 'sk-openai-test-key-222222' });

    const rotateBody = rotateRes.body as {
      data: {
        key_hint: string;
        rotation: { rotated: boolean; previousKeyHint: string };
      };
    };

    expect(rotateRes.status).toBe(200);
    expect(rotateBody.data.rotation).toMatchObject({
      rotated: true,
      previousKeyHint: beforeKeyHint,
    });
    expect(rotateBody.data.key_hint).toBe('sk-o...2222');

    const after = dbState.userApiKeys.find((item) => item.provider === 'openai');
    expect(after).toBeTruthy();
    expect(after?.previous_key_hint).toBe(beforeKeyHint);
    expect(after?.key_hint).toBe('sk-o...2222');
    expect(after?.previous_encrypted_key).toBeTruthy();
    expect(after?.previous_iv).toBeTruthy();
    expect(after?.previous_auth_tag).toBeTruthy();
  });

  it('POST /api/keys/:provider/rotate는 키 검증 실패 시 400을 반환하고 회전을 수행하지 않아야 한다', async () => {
    await requestAgent
      .post('/api/keys')
      .send({ provider: 'openai', apiKey: 'sk-openai-test-key-111111' });

    openaiModelsList.mockRejectedValueOnce(new Error('invalid key'));

    const rotateRes = await requestAgent
      .post('/api/keys/openai/rotate')
      .send({ apiKey: 'sk-openai-bad-key-999999' });

    const rotateBody = rotateRes.body as { message: string };
    expect(rotateRes.status).toBe(400);
    expect(rotateBody.message).toBe('API 키가 유효하지 않습니다.');

    const unchanged = dbState.userApiKeys.find((item) => item.provider === 'openai');
    expect(unchanged?.key_hint).toBe('sk-o...1111');
    expect(unchanged?.previous_encrypted_key).toBeUndefined();
    expect(unchanged?.previous_key_hint).toBeUndefined();
  });

  it('POST /api/keys/:provider/rollback는 최근 회전의 이전 키로 복원해야 한다', async () => {
    await requestAgent
      .post('/api/keys')
      .send({ provider: 'openai', apiKey: 'sk-openai-test-key-111111' });

    const rotateRes = await requestAgent
      .post('/api/keys/openai/rotate')
      .send({ apiKey: 'sk-openai-test-key-222222' });
    const rotateBody = rotateRes.body as {
      data: {
        rotation: { previousKeyHint: string };
        key_hint: string;
      };
    };

    expect(rotateRes.status).toBe(200);
    expect(rotateBody.data.key_hint).toBe('sk-o...2222');

    const rollbackRes = await requestAgent.post('/api/keys/openai/rollback');
    const rollbackBody = rollbackRes.body as {
      data: {
        key_hint: string;
        rotation: { rolledBack: boolean; restoredKeyHint: string; previousKeyHint: string };
      };
    };

    expect(rollbackRes.status).toBe(200);
    expect(rollbackBody.data.rotation).toMatchObject({
      rolledBack: true,
      restoredKeyHint: rotateBody.data.rotation.previousKeyHint,
    });
    expect(rollbackBody.data.rotation.previousKeyHint).toBe('sk-o...2222');
    expect(rollbackBody.data.key_hint).toBe('sk-o...1111');

    const restored = dbState.userApiKeys.find((item) => item.provider === 'openai');
    expect(restored?.key_hint).toBe('sk-o...1111');
    expect(restored?.previous_key_hint).toBeNull();
    expect(restored?.previous_encrypted_key).toBeNull();
    expect(restored?.previous_iv).toBeNull();
    expect(restored?.previous_auth_tag).toBeNull();
  });
});
