import dotenv from 'dotenv';

// .env 파일에서 환경변수 로드
dotenv.config();

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
    s3Bucket: requireEnv('AWS_S3_BUCKET'),
    accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
  },

  encryption: {
    secret: requireEnv('ENCRYPTION_SECRET'),
  },

  cors: {
    origin: optionalEnv('CORS_ORIGIN', 'http://localhost:3000'),
  },
} as const;
