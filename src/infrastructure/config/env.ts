import { z } from 'zod';

/**
 * Fail-fast environment validation (dayuse-vibes: no plaintext secrets, validate all input).
 * Parsed once at startup; the process refuses to boot on a bad config.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(3000),
    MCP_PUBLIC_URL: z.string().url(),

    DATABASE_URL: z.string().url(),

    // 32-byte key, base64-encoded (AES-256-GCM for refresh tokens — ADR 0003).
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded'),

    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
    GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),

    GTM_ACCOUNT_ID: z.string().min(1),
    GTM_WEB_CONTAINER_ID: z.string().min(1),
    GTM_SERVER_CONTAINER_ID: z.string().min(1),

    GOOGLE_CHAT_WEBHOOK_URL: z.string().url().optional(),
    PENDING_CHANGESET_TTL_HOURS: z.coerce.number().int().positive().default(72),

    // dataLayer catalog (ADR 0008). Optional so the server boots without it; the catalog
    // tools report "not configured" when unset. Token set ⇒ project id is required.
    GITLAB_TOKEN: z.string().min(1).optional(),
    GITLAB_CATALOG_PROJECT_ID: z.string().min(1).optional(),

    // Min collaborator-skill version the server accepts (ADR 0009 handshake). Optional;
    // falls back to DEFAULT_MIN_SKILL_VERSION. Raise at deploy time to force stale bundles to warn.
    MIN_SKILL_VERSION: z.string().min(1).optional(),
  })
  .refine((e) => e.GITLAB_TOKEN === undefined || e.GITLAB_CATALOG_PROJECT_ID !== undefined, {
    message: 'GITLAB_CATALOG_PROJECT_ID is required when GITLAB_TOKEN is set',
    path: ['GITLAB_CATALOG_PROJECT_ID'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
