// API 키 암호화/복호화 유틸리티 (AES-256-GCM)

import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  // 32바이트 키 생성 (SHA-256 해시)
  return crypto.createHash('sha256').update(config.encryption.secret).digest();
}

/** 평문을 AES-256-GCM으로 암호화 → iv:authTag:encrypted 형태 반환 */
export function encrypt(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/** iv:authTag:encrypted 형태의 문자열을 복호화 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');

  if (parts.length !== 3) {
    throw new Error('잘못된 암호화 데이터 형식입니다.');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/** API 키 힌트 생성 (앞 4자 + ... + 뒤 4자) */
export function createKeyHint(apiKey: string): string {
  if (apiKey.length <= 8) return '****';
  return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
}
