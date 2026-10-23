import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/server/auth/session';

/**
 * The internal OpenAPI document.
 *
 * It describes the account-scoped surface — projects, personal access tokens
 * and the MCP server — which is *not* part of the public contract. The
 * document is therefore guarded: without a valid session the response is a
 * plain 401 and no part of the internal API is disclosed.
 *
 * The check is delegated to `authenticateRequest`, the single place where
 * the accepted credentials are defined: an account token (`pmk_usr_…`), a
 * Clerk session (JWT in `Authorization: Bearer` or in the `__session` cookie)
 * or — outside production only — the `x-user-id` development header.
 * The signature of the session token is verified against the instance JWKS
 * there; nothing is re-implemented here.
 */

type JsonSchema = Record<string, unknown>;

type SecurityScheme =
  | {
      type: 'apiKey';
      in: 'header' | 'cookie';
      name: string;
      description?: string;
    }
  | {
      type: 'http';
      scheme: 'bearer';
      bearerFormat?: string;
      description?: string;
    };

type SecurityRequirement = Record<string, string[]>;

interface OpenApiParameter {
  name: string;
  in: 'header' | 'query' | 'path' | 'cookie';
  required?: boolean;
  description?: string;
  schema: JsonSchema;
  example?: unknown;
}

interface OpenApiRequestBody {
  required?: boolean;
  content: Record<string, { schema: JsonSchema }>;
}

interface OpenApiResponse {
  description: string;
  content?: Record<string, { schema: JsonSchema }>;
}

interface OpenApiOperation {
  summary: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security?: SecurityRequirement[];
}

interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers: { url: string; description?: string }[];
  tags?: { name: string; description?: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    securitySchemes?: Record<string, SecurityScheme>;
  };
  security?: SecurityRequirement[];
}

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/** Account token (`pmk_usr_…`) or project token (`pmk_live_…`). */
const ACCOUNT_TOKEN_SECURITY: SecurityRequirement = { XToken: [] };
/** Clerk session in the `__session` cookie. */
const SESSION_COOKIE_SECURITY: SecurityRequirement = { SessionCookie: [] };
/** Clerk session JWT in the `Authorization` header. */
const SESSION_BEARER_SECURITY: SecurityRequirement = { SessionBearer: [] };

/** Any of the accepted account credentials. */
const ACCOUNT_SECURITY: SecurityRequirement[] = [
  ACCOUNT_TOKEN_SECURITY,
  SESSION_COOKIE_SECURITY,
  SESSION_BEARER_SECURITY,
];

export async function GET(req: NextRequest) {
  const actor = await authenticateRequest(req);

  // No valid credential — the internal contract is not disclosed at all.
  if (!actor) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE }
    );
  }

  const host = req.headers.get('host') || 'localhost:8787';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}`;

  const spec: OpenApiDocument = {
    openapi: '3.0.3',
    info: {
      title: 'Paymock Internal API',
      version: '1.0.0',
      description:
        'Внутрішній (account-scoped) API Paymock: керування проєктами, персональні токени доступу та MCP-сервер. Документ доступний лише авторизованим запитам — анонімний відвідувач отримує 401.',
    },
    servers: [
      {
        url: baseUrl,
        description: 'Поточний сервер Paymock',
      },
    ],
    tags: [
      { name: 'Account', description: 'Проєкти та персональні токени акаунта' },
      { name: 'MCP', description: 'Model Context Protocol сервер' },
    ],
    paths: {
      '/api/admin/projects': {
        get: {
          summary: 'Проєкти акаунта, рахунки, вебхуки та статистика',
          description:
            'Повертає дані виключно власного акаунта. Доступ: `X-Token: pmk_usr_…` (персональний токен акаунта) або сесія Clerk (cookie `__session` / `Authorization: Bearer <JWT>`).',
          tags: ['Account'],
          parameters: [
            {
              name: 'projectId',
              in: 'query',
              required: false,
              description: 'Проєкт, дані якого мають бути в полі `currentProjectId`.',
              schema: { type: 'string' },
            },
          ],
          security: ACCOUNT_SECURITY,
          responses: {
            '200': {
              description: 'Дані кабінету',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      projects: { type: 'array', items: { type: 'object' } },
                      currentProjectId: { type: 'string', nullable: true },
                      invoices: { type: 'array', items: { type: 'object' } },
                      webhooks: { type: 'array', items: { type: 'object' } },
                      stats: { type: 'object' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Недійсний або відсутній токен' },
          },
        },
        post: {
          summary: 'Створення проєкту',
          description:
            'Власник проєкту береться із сесії, а не з тіла запиту. Токен проєкту (`X-Token`) повертається **один раз** у відповідь — зберігається лише SHA-256 хеш, тому втрачений токен треба ротувати через `/api/admin/projects/reset-token`.',
          tags: ['Account'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', minLength: 1, maxLength: 120 },
                    edrpou: { type: 'string', maxLength: 32 },
                  },
                },
              },
            },
          },
          security: ACCOUNT_SECURITY,
          responses: {
            '201': {
              description: 'Створений проєкт разом із його X-Token (показується один раз)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      project: { type: 'object' },
                      token: {
                        type: 'string',
                        description: 'Токен проєкту. Показується один раз.',
                        example: '<X-Token>',
                      },
                      webhookSecret: { type: 'string', example: '<webhook-secret>' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Некоректна назва проєкту' },
            '401': { description: 'Недійсний або відсутній токен' },
            '429': { description: 'Перевищено ліміт запитів' },
          },
        },
        patch: {
          summary: 'Оновлення проєкту',
          description:
            'Оновлюється лише проєкт, що належить акаунту. Мутація з cookie-сесією має приходити з того самого origin (захист від CSRF).',
          tags: ['Account'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string', maxLength: 120 },
                    logo_url: { type: 'string', nullable: true },
                    default_webhook_url: { type: 'string', nullable: true },
                    default_success_url: { type: 'string', nullable: true },
                    default_fail_url: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          security: ACCOUNT_SECURITY,
          responses: {
            '200': {
              description: 'Оновлений проєкт',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      logo_url: { type: 'string', nullable: true },
                      default_webhook_url: { type: 'string', nullable: true },
                      default_success_url: { type: 'string', nullable: true },
                      default_fail_url: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
            '400': { description: 'Некоректні параметри' },
            '401': { description: 'Недійсний або відсутній токен' },
            '404': { description: 'Проєкт не знайдено або немає доступу' },
          },
        },
        delete: {
          summary: 'Видалення проєкту разом із його рахунками',
          tags: ['Account'],
          parameters: [
            {
              name: 'id',
              in: 'query',
              required: true,
              description: 'Ідентифікатор проєкту.',
              schema: { type: 'string' },
            },
          ],
          security: ACCOUNT_SECURITY,
          responses: {
            '200': {
              description: 'Проєкт видалено',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { success: { type: 'boolean' } },
                  },
                },
              },
            },
            '400': { description: 'Не вказано ідентифікатор проєкту' },
            '401': { description: 'Недійсний або відсутній токен' },
            '404': { description: 'Проєкт не знайдено або немає доступу' },
          },
        },
      },
      '/api/admin/projects/reset-token': {
        post: {
          summary: 'Ротація X-Token проєкту',
          description:
            'Старий токен перестає працювати одразу після ротації. Новий токен повертається **один раз** — зберігається лише SHA-256 хеш.',
          tags: ['Account'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId'],
                  properties: { projectId: { type: 'string' } },
                },
              },
            },
          },
          security: ACCOUNT_SECURITY,
          responses: {
            '200': {
              description: 'Проєкт із новим токеном (показується один раз)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      project: { type: 'object' },
                      token: {
                        type: 'string',
                        description: 'Новий токен проєкту. Показується один раз.',
                        example: '<X-Token>',
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Не вказано projectId' },
            '401': { description: 'Недійсний або відсутній токен' },
            '404': { description: 'Проєкт не знайдено або немає доступу' },
          },
        },
      },
      '/api/account/tokens': {
        get: {
          summary: 'Активні персональні токени доступу',
          description:
            'Повертає лише метадані — значення токена не відновлюється зі сховища. Доступ: `X-Token: pmk_usr_…` або сесія Clerk.',
          tags: ['Account'],
          security: ACCOUNT_SECURITY,
          responses: {
            '200': {
              description: 'Список активних токенів',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tokens: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            createdAt: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Недійсний або відсутній токен' },
          },
        },
        post: {
          summary: 'Випуск персонального токена доступу',
          description:
            'Значення токена показується один раз — зберігається лише SHA-256 хеш. Токен із префіксом `pmk_usr_` відкриває увесь account API акаунта.',
          tags: ['Account'],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string', maxLength: 64 } },
                },
              },
            },
          },
          security: ACCOUNT_SECURITY,
          responses: {
            '201': {
              description: 'Новий токен (показується один раз)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: {
                        type: 'string',
                        description: 'Значення персонального токена. Показується один раз.',
                        example: '<X-Token>',
                      },
                      id: { type: 'string' },
                      name: { type: 'string' },
                      createdAt: { type: 'string' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Недійсний або відсутній токен' },
            '429': { description: 'Перевищено ліміт запитів' },
          },
        },
        delete: {
          summary: 'Відкликання персональних токенів',
          description:
            'Відкликає всі токени акаунта або лише токен із вказаним іменем. Відкликаний токен більше не приймається жодним ендпоїнтом.',
          tags: ['Account'],
          parameters: [
            {
              name: 'name',
              in: 'query',
              required: false,
              description: 'Ім’я токена. Якщо не задано — відкликаються всі токени акаунта.',
              schema: { type: 'string' },
            },
          ],
          security: ACCOUNT_SECURITY,
          responses: {
            '200': {
              description: 'Кількість відкликаних токенів',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      revoked: { type: 'integer' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Недійсний або відсутній токен' },
          },
        },
      },
      '/api/mcp': {
        post: {
          summary: 'MCP-сервер (Model Context Protocol)',
          description:
            'JSON-RPC 2.0 ендпоїнт для підключення AI-асистентів. Підтримує initialize, server/discover, notifications/initialized, ping, tools/list, tools/call, resources/list, resources/read та prompts/list. Токен проєкту (`pmk_live_…`) обмежує сесію одним проєктом, глобальний токен акаунта (`pmk_usr_…`) або сесія Clerk — усіма проєктами акаунта.',
          tags: ['MCP'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['jsonrpc', 'method'],
                  properties: {
                    jsonrpc: { type: 'string', enum: ['2.0'] },
                    id: { type: ['string', 'number', 'null'] },
                    method: {
                      type: 'string',
                      examples: ['initialize', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'ping'],
                    },
                    params: { type: 'object' },
                  },
                },
              },
            },
          },
          security: ACCOUNT_SECURITY,
          responses: {
            '200': { description: 'JSON-RPC відповідь (result або error)' },
            '204': { description: 'Сповіщення прийнято без відповіді' },
            '400': { description: 'Невірний JSON' },
            '401': { description: 'Недійсний або відсутній токен' },
            '429': { description: 'Перевищено ліміт запитів' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        XToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Token',
          description:
            'Персональний токен акаунта (`pmk_usr_…`) або токен проєкту (`pmk_live_…`). Для account API потрібен саме токен акаунта — токен проєкту не дає доступу до кабінету.',
        },
        SessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: '__session',
          description:
            'Сесія Clerk. Підпис JWT перевіряється за JWKS інстансу; для мутацій додатково перевіряється origin (захист від CSRF).',
        },
        SessionBearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Сесійний JWT Clerk, переданий у заголовку `Authorization: Bearer <token>`.',
        },
      },
    },
    security: ACCOUNT_SECURITY,
  };

  return NextResponse.json(spec, { headers: NO_STORE });
}
