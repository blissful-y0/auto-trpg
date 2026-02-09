// API 키 암호화/복호화 유틸리티 (AES-256-GCM)

import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

export interface EncryptedApiKey {
  encryptedKey: string;
  iv: string;
  authTag: string;
}

function getEncryptionKey(): Buffer {
  // 32바이트 키 생성 (SHA-256 해시)
  return crypto.createHash('sha256').update(config.encryption.secret).digest();
}

/** 평문을 AES-256-GCM으로 암호화 */
export function encrypt(plainText: string): EncryptedApiKey {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encryptedKey: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

function decryptWithParts(encrypted: string, ivHex: string, authTagHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

function decryptLegacyPacked(legacyPacked: string): string {
  const parts = legacyPacked.split(':');

  if (parts.length !== 3) {
    throw new Error('잘못된 암호화 데이터 형식입니다.');
  }

  return decryptWithParts(parts[2], parts[0], parts[1]);
}

/**
 * API 키 복호화
 * - 신형 포맷: encryptedKey(암호문) + iv + authTag 분리 저장
 * - 구형 포맷: encryptedKey에 "iv:authTag:cipher" packed 저장
 */
export function decrypt(encryptedKey: string, iv?: string | null, authTag?: string | null): string {
  if (iv && authTag) {
    return decryptWithParts(encryptedKey, iv, authTag);
  }

  return decryptLegacyPacked(encryptedKey);
}

/** API 키 힌트 생성 (앞 4자 + ... + 뒤 4자) */
export function createKeyHint(apiKey: string): string {
  if (apiKey.length <= 8) return '****';
  return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
}
