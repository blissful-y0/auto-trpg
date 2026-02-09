/**
 * BYOK API 키 관리자
 *
 * AES-256-GCM 암호화를 사용하여 사용자 API 키를 안전하게 저장/조회/삭제.
 * 보안 원칙:
 *   - ENCRYPTION_SECRET 환경변수에서 암호화 키 파생
 *   - 평문 키는 메모리에서만 일시적으로 존재
 *   - 복호화 후 사용이 끝나면 변수를 null로 덮어쓰기
 */
import crypto from 'crypto';
import type { LLMProviderId } from './provider';

/** 암호화 결과 */
export interface EncryptedData {
  encryptedKey: string;
  iv: string;
  /** 인증 태그 (GCM 모드) */
  authTag: string;
}

/** Supabase 클라이언트 인터페이스 (의존성 역전) */
export interface KeyStore {
  upsert(params: {
    userId: string;
    provider: LLMProviderId;
    encryptedKey: string;
    iv: string;
    authTag: string;
    keyHint: string;
  }): Promise<void>;

  get(params: {
    userId: string;
    provider: LLMProviderId;
  }): Promise<{ encryptedKey: string; iv: string; authTag: string } | null>;

  delete(params: {
    userId: string;
    provider: LLMProviderId;
  }): Promise<void>;
}

/** 암호화 키 길이 (AES-256) */
const KEY_LENGTH = 32;
/** IV 길이 (GCM 권장) */
const IV_LENGTH = 12;
/** 알고리즘 */
const ALGORITHM = 'aes-256-gcm';

export class KeyManager {
  private encryptionKey: Buffer;
  private keyStore: KeyStore | null;

  /**
   * @param encryptionSecret 암호화 시크릿 (환경변수에서 주입)
   * @param keyStore 키 저장소 (Supabase 등). null이면 저장/조회 비활성화.
   */
  constructor(encryptionSecret: string, keyStore: KeyStore | null = null) {
    // PBKDF2로 고정 길이 키 파생
    this.encryptionKey = crypto.pbkdf2Sync(
      encryptionSecret,
      'auto-trpg-salt',
      100_000,
      KEY_LENGTH,
      'sha256',
    );
    this.keyStore = keyStore;
  }

  /** AES-256-GCM 암호화 */
  encrypt(plainKey: string): EncryptedData {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(plainKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encryptedKey: encrypted,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  /** AES-256-GCM 복호화 */
  decrypt(encryptedKey: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.encryptionKey,
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /** 키 힌트 생성 (예: "sk-...Xf4g") */
  generateHint(key: string): string {
    if (key.length <= 8) {
      return '****';
    }
    const prefix = key.slice(0, 3);
    const suffix = key.slice(-4);
    return `${prefix}...${suffix}`;
  }

  /** 키 저장 (암호화 후 KeyStore에 보관) */
  async saveKey(
    userId: string,
    provider: LLMProviderId,
    apiKey: string,
  ): Promise<void> {
    if (!this.keyStore) {
      throw new Error('KeyStore가 설정되지 않았습니다.');
    }

    const encrypted = this.encrypt(apiKey);
    const keyHint = this.generateHint(apiKey);

    await this.keyStore.upsert({
      userId,
      provider,
      encryptedKey: encrypted.encryptedKey,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyHint,
    });
  }

  /** 키 조회 + 복호화 */
  async getKey(
    userId: string,
    provider: LLMProviderId,
  ): Promise<string | null> {
    if (!this.keyStore) {
      throw new Error('KeyStore가 설정되지 않았습니다.');
    }

    const stored = await this.keyStore.get({ userId, provider });
    if (!stored) return null;

    let decryptedKey: string | null = this.decrypt(
      stored.encryptedKey,
      stored.iv,
      stored.authTag,
    );

    // 반환 값 복사 후 원본 변수 정리
    const result = decryptedKey;
    decryptedKey = null;
    return result;
  }

  /** 키 삭제 */
  async deleteKey(
    userId: string,
    provider: LLMProviderId,
  ): Promise<void> {
    if (!this.keyStore) {
      throw new Error('KeyStore가 설정되지 않았습니다.');
    }

    await this.keyStore.delete({ userId, provider });
  }

  /** 프로바이더별 API 키 검증 */
  async validateKey(
    provider: LLMProviderId,
    apiKey: string,
  ): Promise<boolean> {
    // 동적으로 프로바이더 로드하여 키 검증
    const { ClaudeProvider } = await import('./claude');
    const { OpenAIProvider } = await import('./openai');
    const { GeminiProvider } = await import('./gemini');

    const providers: Record<LLMProviderId, { validateKey(key: string): Promise<boolean> }> = {
      claude: new ClaudeProvider(apiKey),
      openai: new OpenAIProvider(apiKey),
      gemini: new GeminiProvider(apiKey),
    };

    return providers[provider].validateKey(apiKey);
  }
}
