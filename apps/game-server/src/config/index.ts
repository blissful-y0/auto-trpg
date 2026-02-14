import dotenv from 'dotenv';
import path from 'path';

// .env 파일에서 환경변수 로드 (로컬 → 모노레포 루트 순서로 탐색)
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`필수 환경변수 ${key}가 설정되지 않았습니다.`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEncryptionSecret(): string {
  const secret = process.env.ENCRYPTION_SECRET;

  if (!secret) {
    throw new Error(
      'ENCRYPTION_SECRET 환경변수가 설정되지 않았습니다. ' +
        '모든 환경에서 반드시 설정해야 합니다.',
    );
  }

  return secret;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  supabase: {
    url: requireEnv('SUPABASE_URL'),
    anonKey: requireEnv('SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },

  redis: {
    url: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
  },

  aws: {
    region: optionalEnv('AWS_REGION', 'ap-northeast-2'),
    s3Bucket: optionalEnv('AWS_S3_BUCKET', 'auto-trpg-rulebooks'),
    accessKeyId: optionalEnv('AWS_ACCESS_KEY_ID', ''),
    secretAccessKey: optionalEnv('AWS_SECRET_ACCESS_KEY', ''),
  },

  encryption: {
    secret: getEncryptionSecret(),
  },

  cors: {
    origin: optionalEnv('CORS_ORIGIN', 'http://localhost:3000'),
  },
} as const;
