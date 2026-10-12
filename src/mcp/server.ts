import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ProjectsRepository } from '@/lib/db/projects.repository';
import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { WebhooksRepository } from '@/lib/db/webhooks.repository';
import { sendWebhook } from '@/lib/webhook';
import { generateInvoiceId } from '@/src/shared/utils/id';

export interface McpServerConfig {
  baseUrl?: string;
  userId?: string | null;
  defaultProjectId?: string | null;
}

export function createPaymockMcpServer(config: McpServerConfig = {}) {
  const server = new Server(
    {
      name: 'paymock-mcp-server',
      version: '1.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  const projectsRepo = new ProjectsRepository();
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

  const baseUrl = config.baseUrl || process.env.PAYMOCK_URL || 'http://localhost:8787';
  const userId = config.userId || process.env.PAYMOCK_USER_ID || null;

  // Helper to resolve project safely according to user ownership
  async function resolveProject(projectId?: string) {
    if (projectId) {
      return projectsRepo.findById(projectId, userId);
    }
    if (config.defaultProjectId) {
      return projectsRepo.findById(config.defaultProjectId, userId);
    }
    const projects = await projectsRepo.list(userId);
    return projects[0] || null;
  }

  // 1. LIST RESOURCES
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const projects = await projectsRepo.list(userId);
    const resources = [
      {
        uri: 'paymock://projects',
        name: 'Список мерчант-проєктів',
        description: 'Усі доступні проєкти та їхні параметри інтеграції (X-Token, URLs)',
        mimeType: 'application/json',
      },
    ];

    for (const project of projects) {
      resources.push({
        uri: `paymock://projects/${project.id}/stats`,
        name: `Статистика проєкту ${project.name}`,
        description: `Поточні фінансові показники та лічильники статусів для ${project.name}`,
        mimeType: 'application/json',
      });
      resources.push({
        uri: `paymock://projects/${project.id}/invoices/recent`,
        name: `Останні рахунки проєкту ${project.name}`,
        description: `Останні 10 згенерованих рахунків для ${project.name}`,
        mimeType: 'application/json',
      });
    }

    return { resources };
  });

  // 2. READ RESOURCE
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri === 'paymock://projects') {
      const projects = await projectsRepo.list(userId);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    }

    const statsMatch = uri.match(/^paymock:\/\/projects\/([^/]+)\/stats$/);
    if (statsMatch) {
      const pId = statsMatch[1];
      const stats = await invoicesRepo.countStats(pId);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }

    const recentInvoicesMatch = uri.match(/^paymock:\/\/projects\/([^/]+)\/invoices\/recent$/);
    if (recentInvoicesMatch) {
      const pId = recentInvoicesMatch[1];
      const invoices = await invoicesRepo.list({ projectId: pId, limit: 10 });
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(invoices, null, 2),
          },
        ],
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  });

  // 3. LIST TOOLS
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'list_projects',
          description: 'Отримати перелік усіх проєктів поточного користувача з їхніми ID, назвами, токенами авторизації (X-Token) та налаштуваннями.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'create_project',
          description: 'Створити новий мерчант-проєкт (магазин, бот, SaaS) для поточного користувача та згенерувати для нього окремий X-Token.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Назва проєкту, наприклад "Книжковий магазин" або "Telegram Бот Підписок"',
              },
              defaultWebhookUrl: {
                type: 'string',
                description: 'Опціональна дефолтна адреса вашого бекенду для отримання вебхуків',
              },
              defaultSuccessUrl: {
                type: 'string',
                description: 'Опціональний дефолтний URL повернення клієнта після успішної оплати',
              },
              defaultFailUrl: {
                type: 'string',
                description: 'Опціональний дефолтний URL повернення клієнта у разі відхилення',
              },
              edrpou: {
                type: 'string',
                description: 'ЄДРПОУ компанії мерчанта (за замовчуванням "12345678")',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'get_project',
          description: 'Отримати детальну інформацію про конкретний проєкт за його ID або поточний активний проєкт.',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Опціональний ID проєкту. Якщо не вказано, повертає поточний активний проєкт.',
              },
            },
          },
        },
        {
          name: 'reset_project_token',
          description: 'Згенерувати новий секретний X-Token для проєкту замість скомпрометованого чи старого.',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'ID проєкту, для якого потрібно оновити токен',
              },
            },
            required: ['projectId'],
          },
        },
        {
          name: 'create_invoice',
          description: 'Створити рахунок на оплату (інвойс), отримати готове посилання на чекаут (pageUrl) та глибоке посилання (appUrl).',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Опціональний ID проєкту (якщо не вказано, буде використано перший активний проєкт)',
              },
              amount: {
                type: 'number',
                description: 'Сума до сплати в копійках/центах (наприклад, 10000 для 100.00 грн)',
              },
              ccy: {
                type: 'number',
                description: 'Код валюти ISO (980 для UAH, 840 для USD, 978 для EUR). За замовчуванням 980',
              },
              destination: {
                type: 'string',
                description: 'Призначення платежу (наприклад, "Оплата замовлення #1042")',
              },
              comment: {
                type: 'string',
                description: 'Коментар або примітка до рахунку',
              },
              webHookUrl: {
                type: 'string',
                description: 'URL вашого бекенду для отримання вебхука про зміну статусу платежу',
              },
              redirectUrl: {
                type: 'string',
                description: 'URL куди перенаправити клієнта після завершення оплати',
              },
            },
            required: ['amount', 'destination'],
          },
        },
        {
          name: 'get_invoice',
          description: 'Отримати детальну інформацію про рахунок за його invoiceId (статус, сума, реквізити картки тощо).',
          inputSchema: {
            type: 'object',
            properties: {
              invoiceId: {
                type: 'string',
                description: 'Унікальний ідентифікатор рахунку (наприклад, p2_xxxxxxxxxx)',
              },
            },
            required: ['invoiceId'],
          },
        },
        {
          name: 'list_invoices',
          description: 'Отримати список рахунків проєкту з можливістю фільтрації за статусом та проєктом.',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Опціональний ID проєкту (за замовчуванням активний проєкт)',
              },
              status: {
                type: 'string',
                enum: ['all', 'created', 'processing', 'hold', 'success', 'failure', 'reversed', 'expired'],
                description: 'Фільтр за статусом рахунку',
              },
              limit: {
                type: 'number',
                description: 'Кількість записів (за замовчуванням 20)',
              },
            },
          },
        },
        {
          name: 'simulate_payment',
          description: 'Симулювати проведення оплати рахунку (успіх або відхилення), автоматично відправити Webhook на бекенд мерчанта.',
          inputSchema: {
            type: 'object',
            properties: {
              invoiceId: {
                type: 'string',
                description: 'ID рахунку для симуляції',
              },
              action: {
                type: 'string',
                enum: ['success', 'failure', 'expired'],
                description: 'Результат оплати: success (успішно), failure (відхилено), expired (прострочено)',
              },
              failureReason: {
                type: 'string',
                description: 'Опціональна причина відхилення при failure (наприклад, "Недостатньо коштів")',
              },
            },
            required: ['invoiceId', 'action'],
          },
        },
        {
          name: 'get_webhook_logs',
          description: 'Переглянути журнал доставки вебхуків (чи відповів ваш бекенд, код статусу HTTP 200/500, тіло відповіді та час затримки).',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Опціональний ID проєкту для фільтрації',
              },
              invoiceId: {
                type: 'string',
                description: 'Опціональний фільтр за конкретним invoiceId',
              },
              limit: {
                type: 'number',
                description: 'Кількість останніх логів (за замовчуванням 15)',
              },
            },
          },
        },
        {
          name: 'retry_webhook',
          description: 'Повторно надіслати вебхук для рахунку на вказаний або збережений webHookUrl.',
          inputSchema: {
            type: 'object',
            properties: {
              invoiceId: {
                type: 'string',
                description: 'ID рахунку для повторної відправки сповіщення',
              },
              customUrl: {
                type: 'string',
                description: 'Опціональний альтернативний URL для перевірки доставки',
              },
            },
            required: ['invoiceId'],
          },
        },
      ],
    };
  });

  // 4. CALL TOOL
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'list_projects') {
        const projects = await projectsRepo.list(userId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                projects.map((p) => ({
                  id: p.id,
                  name: p.name,
                  token: p.token,
                  edrpou: p.edrpou,
                  defaultWebhookUrl: p.default_webhook_url,
                  defaultSuccessUrl: p.default_success_url,
                  createdAt: p.created_at,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'create_project') {
        const pName = (args as any)?.name;
        const edrpou = (args as any)?.edrpou || '12345678';
        const defaultWebhookUrl = (args as any)?.defaultWebhookUrl || null;
        const defaultSuccessUrl = (args as any)?.defaultSuccessUrl || null;
        const defaultFailUrl = (args as any)?.defaultFailUrl || null;

        if (!pName) {
          throw new Error('Параметр name обов\'язковий для створення проєкту.');
        }
        const created = await projectsRepo.create({
          name: pName,
          userId,
          edrpou,
          defaultWebhookUrl,
          defaultSuccessUrl,
          defaultFailUrl,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `✅ Проєкт "${created.name}" успішно створено!`,
                  project: {
                    id: created.id,
                    name: created.name,
                    token: created.token,
                    edrpou: created.edrpou,
                    defaultWebhookUrl: created.default_webhook_url,
                  },
                  envExample: `PAYMOCK_PROJECT_ID=${created.id}\nPAYMOCK_TOKEN=${created.token}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'get_project') {
        const target = await resolveProject((args as any)?.projectId);
        if (!target) {
          throw new Error('Проєкт не знайдено.');
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: target.id,
                  name: target.name,
                  token: target.token,
                  edrpou: target.edrpou,
                  defaultWebhookUrl: target.default_webhook_url,
                  defaultSuccessUrl: target.default_success_url,
                  defaultFailUrl: target.default_fail_url,
                  createdAt: target.created_at,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'reset_project_token') {
        const projectId = (args as any)?.projectId;
        if (!projectId) throw new Error('Потрібно вказати projectId.');

        const updated = await projectsRepo.resetToken(projectId, userId);
        if (!updated) {
          throw new Error(`Не вдалося оновити токен для проєкту ${projectId}. Перевірте права доступу.`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `🔑 Новий токен для проєкту "${updated.name}" згенеровано!`,
                  projectId: updated.id,
                  newToken: updated.token,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'create_invoice') {
        const { projectId, amount, ccy = 980, destination, comment, webHookUrl, redirectUrl } = (args as any) || {};
        const project = await resolveProject(projectId);
        if (!project) {
          throw new Error('Проєкт не знайдено. Спочатку створіть проєкт через create_project.');
        }

        const invId = generateInvoiceId();
        const pageUrl = `${baseUrl}/pay/${invId}`;
        const appUrl = `paymock://pay?invoiceId=${invId}`;

        const created = await invoicesRepo.create({
          id: invId,
          projectId: project.id,
          amount: Number(amount),
          ccy: Number(ccy),
          paymentType: 'debit',
          destination,
          comment,
          webhookUrl: webHookUrl || project.default_webhook_url || undefined,
          redirectUrl: redirectUrl || project.default_success_url || undefined,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  invoiceId: created.id,
                  status: created.status,
                  amount: created.amount,
                  ccy: created.ccy,
                  destination: created.destination,
                  pageUrl,
                  appUrl,
                  projectId: project.id,
                  projectName: project.name,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'get_invoice') {
        const invId = (args as any)?.invoiceId;
        if (!invId) throw new Error('Потрібно вказати invoiceId.');

        const invoice = await invoicesRepo.findById(invId);
        if (!invoice) throw new Error(`Рахунок ${invId} не знайдено.`);

        const project = await projectsRepo.findById(invoice.project_id, userId);
        if (!project) throw new Error(`Немає доступу до рахунку ${invId}.`);

        return {
          content: [{ type: 'text', text: JSON.stringify(invoice, null, 2) }],
        };
      }

      if (name === 'list_invoices') {
        const { projectId, status, limit = 20 } = (args as any) || {};
        let targetProjectId = projectId;
        if (!targetProjectId) {
          const project = await resolveProject();
          if (project) targetProjectId = project.id;
        }

        const invoices = await invoicesRepo.list({
          projectId: targetProjectId,
          status: status && status !== 'all' ? status : undefined,
          limit: Number(limit),
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                invoices.map((i) => ({
                  id: i.id,
                  status: i.status,
                  amount: i.amount,
                  ccy: i.ccy,
                  destination: i.destination,
                  created_date: i.created_date,
                  payUrl: `${baseUrl}/pay/${i.id}`,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'simulate_payment') {
        const { invoiceId, action, failureReason } = (args as any) || {};
        if (!invoiceId || !action) throw new Error('Параметри invoiceId та action обов\'язкові.');

        const invoice = await invoicesRepo.findById(invoiceId);
        if (!invoice) throw new Error(`Рахунок ${invoiceId} не знайдено.`);

        const project = await projectsRepo.findById(invoice.project_id, userId);
        if (!project) throw new Error(`Немає доступу до рахунку ${invoiceId}.`);

        let newStatus: any = 'created';
        let paymentInfo: any = null;

        if (action === 'success') {
          newStatus = 'success';
          paymentInfo = {
            maskedPan: '4441 11** **** 1234',
            approvalCode: '857321',
            rrn: '104857291048',
            paymentMethod: 'pan',
            paymentSystem: 'Visa',
            country: 'Ukraine',
            fee: 0,
          };
        } else if (action === 'failure') {
          newStatus = 'failure';
        } else if (action === 'expired') {
          newStatus = 'expired';
        }

        const updated = await invoicesRepo.updateStatus(invoiceId, newStatus, {
          paymentInfo,
          failureReason: failureReason || (action === 'failure' ? 'Платіж відхилено' : undefined),
          errCode: action === 'failure' ? 'PAYMENT_DECLINED' : undefined,
        });

        let webhookStatusText = 'вебхук не налаштовано';
        if (updated && updated.webhook_url) {
          await sendWebhook(updated);
          const [latestLog] = await webhooksRepo.list({ projectId: project.id, invoiceId, limit: 1 });
          if (latestLog) {
            webhookStatusText = `надіслано на ${updated.webhook_url} (HTTP ${latestLog.status_code || 'Err'}, ${latestLog.duration_ms ?? 0}ms)`;
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `✅ Статус рахунку ${invoiceId} оновлено на [${newStatus}].\nWebhook: ${webhookStatusText}.`,
            },
          ],
        };
      }

      if (name === 'get_webhook_logs') {
        const { projectId, invoiceId, limit = 15 } = (args as any) || {};
        let targetProjectId = projectId;
        if (!targetProjectId) {
          const project = await resolveProject();
          if (project) targetProjectId = project.id;
        }

        const logs = await webhooksRepo.list({
          projectId: targetProjectId,
          invoiceId,
          limit: Number(limit),
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }],
        };
      }

      if (name === 'retry_webhook') {
        const { invoiceId, customUrl } = (args as any) || {};
        if (!invoiceId) throw new Error('Потрібно вказати invoiceId.');

        const invoice = await invoicesRepo.findById(invoiceId);
        if (!invoice) throw new Error(`Рахунок ${invoiceId} не знайдено.`);

        const project = await projectsRepo.findById(invoice.project_id, userId);
        if (!project) throw new Error(`Немає доступу до рахунку ${invoiceId}.`);

        const targetUrl = customUrl || invoice.webhook_url;
        if (!targetUrl) throw new Error('Не вказано webhook_url.');

        const invoiceToSend = customUrl ? { ...invoice, webhook_url: customUrl } : invoice;
        await sendWebhook(invoiceToSend);

        const [log] = await webhooksRepo.list({ projectId: project.id, invoiceId, limit: 1 });

        return {
          content: [
            {
              type: 'text',
              text: `📡 Вебхук відправлено на ${targetUrl}:\nHTTP Status: ${log?.status_code ?? 'Помилка'}\nЧас: ${log?.duration_ms ?? 0} мс\nТіло відповіді: ${log?.response_body || 'пусто'}`,
            },
          ],
        };
      }

      throw new Error(`Невідомий інструмент: ${name}`);
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Помилка виконання інструменту ${name}: ${err.message || String(err)}` }],
      };
    }
  });

  return server;
}
