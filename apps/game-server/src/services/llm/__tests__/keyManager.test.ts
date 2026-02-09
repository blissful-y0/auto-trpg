/**
 * KeyManager 단위 테스트
 *
 * 암호화/복호화 라운드트립, 키 힌트, 에러 케이스 검증.
 */
import { describe, it, expect } from 'vitest';
import { KeyManager } from '../keyManager';

const TEST_SECRET = 'test-encryption-secret-for-unit-tests';

describe('KeyManager', () => {
  describe('encrypt / decrypt 라운드트립', () => {
    it('암호화 후 복호화하면 원본 키가 복원되어야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const originalKey = 'sk-test-1234567890abcdef';

      const encrypted = km.encrypt(originalKey);
      const decrypted = km.decrypt(
        encrypted.encryptedKey,
        encrypted.iv,
        encrypted.authTag,
      );

      expect(decrypted).toBe(originalKey);
    });

    it('한국어가 포함된 키도 정상적으로 라운드트립 되어야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const originalKey = 'AIzaSy-한국어키-abcdef';

      const encrypted = km.encrypt(originalKey);
      const decrypted = km.decrypt(
        encrypted.encryptedKey,
        encrypted.iv,
        encrypted.authTag,
      );

      expect(decrypted).toBe(originalKey);
    });

    it('빈 문자열도 암호화/복호화할 수 있어야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const encrypted = km.encrypt('');
      const decrypted = km.decrypt(
        encrypted.encryptedKey,
        encrypted.iv,
        encrypted.authTag,
      );

      expect(decrypted).toBe('');
    });

    it('긴 API 키도 정상적으로 처리되어야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const longKey = 'sk-' + 'a'.repeat(200);

      const encrypted = km.encrypt(longKey);
      const decrypted = km.decrypt(
        encrypted.encryptedKey,
        encrypted.iv,
        encrypted.authTag,
      );

      expect(decrypted).toBe(longKey);
    });
  });

  describe('암호화 결과 고유성', () => {
    it('서로 다른 키의 암호화 결과가 달라야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const key1 = 'sk-first-key-12345';
      const key2 = 'sk-second-key-67890';

      const encrypted1 = km.encrypt(key1);
      const encrypted2 = km.encrypt(key2);

      expect(encrypted1.encryptedKey).not.toBe(encrypted2.encryptedKey);
    });

    it('같은 키를 두 번 암호화해도 IV가 다르므로 결과가 달라야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const key = 'sk-same-key-12345';

      const encrypted1 = km.encrypt(key);
      const encrypted2 = km.encrypt(key);

      // IV가 무작위이므로 암호문도 달라야 함
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encryptedKey).not.toBe(encrypted2.encryptedKey);
    });

    it('서로 다른 시크릿으로 암호화하면 결과가 달라야 한다', () => {
      const km1 = new KeyManager('secret-one');
      const km2 = new KeyManager('secret-two');
      const key = 'sk-test-key-12345';

      const encrypted1 = km1.encrypt(key);
      // km2로도 암호화해서 다른 결과가 나오는지 확인 (사용하지 않음)
      km2.encrypt(key);

      // 서로 다른 시크릿으로 암호화된 결과는 교차 복호화 불가
      expect(() => {
        km2.decrypt(encrypted1.encryptedKey, encrypted1.iv, encrypted1.authTag);
      }).toThrow();
    });
  });

  describe('잘못된 데이터로 복호화 실패', () => {
    it('잘못된 IV로 복호화하면 실패해야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const key = 'sk-test-key-12345';

      const encrypted = km.encrypt(key);
      const wrongIv = '00'.repeat(12); // 12바이트 = 24 hex 문자

      expect(() => {
        km.decrypt(encrypted.encryptedKey, wrongIv, encrypted.authTag);
      }).toThrow();
    });

    it('잘못된 authTag로 복호화하면 실패해야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const key = 'sk-test-key-12345';

      const encrypted = km.encrypt(key);
      const wrongAuthTag = '00'.repeat(16); // 16바이트 = 32 hex 문자

      expect(() => {
        km.decrypt(encrypted.encryptedKey, encrypted.iv, wrongAuthTag);
      }).toThrow();
    });

    it('변조된 암호문으로 복호화하면 실패해야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const key = 'sk-test-key-12345';

      const encrypted = km.encrypt(key);
      // 암호문의 첫 번째 문자를 변조
      const tampered =
        (encrypted.encryptedKey[0] === '0' ? '1' : '0') +
        encrypted.encryptedKey.slice(1);

      expect(() => {
        km.decrypt(tampered, encrypted.iv, encrypted.authTag);
      }).toThrow();
    });
  });

  describe('키 힌트 생성', () => {
    it('일반적인 API 키의 힌트가 "앞3자...뒤4자" 형식이어야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const hint = km.generateHint('sk-1234567890abcdefXf4g');

      expect(hint).toBe('sk-...Xf4g');
    });

    it('짧은 키(8자 이하)는 "****"로 마스킹되어야 한다', () => {
      const km = new KeyManager(TEST_SECRET);

      expect(km.generateHint('short')).toBe('****');
      expect(km.generateHint('12345678')).toBe('****');
    });

    it('9자 이상의 키는 힌트가 생성되어야 한다', () => {
      const km = new KeyManager(TEST_SECRET);
      const hint = km.generateHint('123456789');

      expect(hint).toBe('123...6789');
    });

    it('OpenAI 스타일 키 힌트', () => {
      const km = new KeyManager(TEST_SECRET);
      const hint = km.generateHint('sk-proj-abcdefghijklmnop');

      expect(hint).toBe('sk-...mnop');
    });

    it('Google API 키 힌트', () => {
      const km = new KeyManager(TEST_SECRET);
      const hint = km.generateHint('AIzaSyD-abc123def456');

      expect(hint).toBe('AIz...f456');
    });
  });

  describe('KeyStore 미설정 시 에러', () => {
    it('saveKey 호출 시 에러가 발생해야 한다', async () => {
      const km = new KeyManager(TEST_SECRET);

      await expect(
        km.saveKey('user-1', 'claude', 'sk-test'),
      ).rejects.toThrow('KeyStore가 설정되지 않았습니다.');
    });

    it('getKey 호출 시 에러가 발생해야 한다', async () => {
      const km = new KeyManager(TEST_SECRET);

      await expect(km.getKey('user-1', 'claude')).rejects.toThrow(
        'KeyStore가 설정되지 않았습니다.',
      );
    });

    it('deleteKey 호출 시 에러가 발생해야 한다', async () => {
      const km = new KeyManager(TEST_SECRET);

      await expect(km.deleteKey('user-1', 'claude')).rejects.toThrow(
        'KeyStore가 설정되지 않았습니다.',
      );
    });
  });
});
