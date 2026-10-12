import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/lib/db/projects.repository';
import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { WebhooksRepository } from '@/lib/db/webhooks.repository';
import { sendWebhook } from '@/lib/webhook';
import { generateInvoiceId } from '@/src/shared/utils/id';
import { getRequestUserId } from '@/lib/auth-user';
import type { Project } from '@/src/types/models';

function extractToken(req: NextRequest): string | null {
  const xToken = req.headers.get('x-token') || req.headers.get('X-Token');
  if (xToken && xToken.trim()) return xToken.trim();

  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }

  const queryToken = req.nextUrl.searchParams.get('token');
  if (queryToken && queryToken.trim()) return queryToken.trim();

  return null;
}

const MCP_TOOLS = [
  // 1. Projects Management (Account Level)
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

  // 2. Invoices Management
  {
    name: 'create_invoice',
    description: 'Створити рахунок на оплату (інвойс), отримати готове посилання на чекаут (pageUrl) та глибоке посилання (appUrl).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Опціональний ID проєкту. Якщо не вказано, використовується поточний або перший проєкт користувача.',
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
          description: 'Опціональний ID проєкту для фільтрації',
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
          description: 'Опціональний ID проєкту для фільтрації логів',
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
];

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const token = extractToken(req);

  return NextResponse.json({
    name: 'paymock-mcp-server',
    version: '1.1.0',
    protocolVersion: '2024-11-05',
    status: 'active',
    mode: 'global-account-scoped',
    endpoint: `${origin}/api/mcp`,
    authenticated: !!token,
    capabilities: {
      tools: MCP_TOOLS.map((t) => t.name),
    },
    clientConfigExample: {
      url: `${origin}/api/mcp`,
      headers: {
        'X-Token': token || 'pmk_live_токен_будь_якого_проєкту_або_акаунта',
      },
    },
  });
}

export async function POST(req: NextRequest) {
  const rawToken = extractToken(req);
  let userId = getRequestUserId(req);

  const projectsRepo = new ProjectsRepository();
  let defaultProject: Project | null = null;

  if (rawToken) {
    if (rawToken.startsWith('pmk_usr_')) {
      userId = rawToken.replace('pmk_usr_', '').trim();
    } else if (rawToken.startsWith('user_')) {
      userId = rawToken.trim();
    } else {
      const foundProject = await projectsRepo.findByToken(rawToken);
      if (foundProject) {
        defaultProject = foundProject;
        if (!userId && foundProject.user_id) {
          userId = foundProject.user_id;
        }
      }
    }
  }

  // If no user context and no project found from token, return 401
  if (!userId && !defaultProject) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message:
            'Не знайдено авторизаційних даних. Передайте валідний X-Token вашого проєкту або токен користувача в заголовках запиту.',
        },
        id: null,
      },
      { status: 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null },
      { status: 400 }
    );
  }

  const { id, method, params } = body;
  const origin = req.nextUrl.origin;
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

  // Helper to resolve project safely according to user ownership
  async function resolveTargetProject(targetProjectId?: string) {
    if (targetProjectId) {
      const p = await projectsRepo.findById(targetProjectId, userId);
      if (!p) {
        throw new Error(`Проєкт із ID "${targetProjectId}" не знайдено або до нього немає доступу.`);
      }
      return p;
    }

    if (defaultProject) {
      return defaultProject;
    }

    const userProjects = await projectsRepo.list(userId);
    if (userProjects.length > 0) {
      return userProjects[0];
    }

    throw new Error(
      'У вашому акаунті ще немає створених проєктів. Використайте інструмент create_project, щоб створити перший проєкт!'
    );
  }

  // 1. INITIALIZE
  if (method === 'initialize') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        serverInfo: {
          name: 'paymock-mcp-server',
          version: '1.1.0',
        },
      },
    });
  }

  // 2. TOOLS/LIST
  if (method === 'tools/list') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS,
      },
    });
  }

  // 3. TOOLS/CALL
  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      // --- 3.1. LIST PROJECTS ---
      if (toolName === 'list_projects') {
        const userProjects = await projectsRepo.list(userId);
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  userProjects.map((p) => ({
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
          },
        });
      }

      // --- 3.2. CREATE PROJECT ---
      if (toolName === 'create_project') {
        const { name, defaultWebhookUrl, defaultSuccessUrl, defaultFailUrl, edrpou } = args;
        if (!name || typeof name !== 'string' || !name.trim()) {
          throw new Error('Поле name (назва проєкту) є обов\'язковим.');
        }

        const newProject = await projectsRepo.create({
          name: name.trim(),
          userId,
          edrpou: edrpou || '12345678',
          defaultWebhookUrl: defaultWebhookUrl || null,
          defaultSuccessUrl: defaultSuccessUrl || null,
          defaultFailUrl: defaultFailUrl || null,
        });

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    message: `✅ Проєкт "${newProject.name}" успішно створено!`,
                    project: {
                      id: newProject.id,
                      name: newProject.name,
                      token: newProject.token,
                      edrpou: newProject.edrpou,
                      defaultWebhookUrl: newProject.default_webhook_url,
                    },
                    envExample: `PAYMOCK_PROJECT_ID=${newProject.id}\nPAYMOCK_TOKEN=${newProject.token}`,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        });
      }

      // --- 3.3. GET PROJECT ---
      if (toolName === 'get_project') {
        const target = await resolveTargetProject(args.projectId);
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
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
          },
        });
      }

      // --- 3.4. RESET PROJECT TOKEN ---
      if (toolName === 'reset_project_token') {
        const { projectId } = args;
        if (!projectId) throw new Error('Потрібно вказати projectId.');

        const updated = await projectsRepo.resetToken(projectId, userId);
        if (!updated) {
          throw new Error(`Не вдалося оновити токен для проєкту ${projectId}. Перевірте права доступу.`);
        }

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
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
          },
        });
      }

      // --- 3.5. CREATE INVOICE ---
      if (toolName === 'create_invoice') {
        const { projectId, amount, ccy = 980, destination, comment, webHookUrl, redirectUrl } = args;
        if (!amount || !destination) {
          throw new Error('Поля amount та destination є обов\'язковими.');
        }

        const project = await resolveTargetProject(projectId);

        const invId = generateInvoiceId();
        const pageUrl = `${origin}/pay/${invId}`;
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

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
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
          },
        });
      }

      // --- 3.6. GET INVOICE ---
      if (toolName === 'get_invoice') {
        const invId = args.invoiceId;
        if (!invId) throw new Error('Потрібно вказати invoiceId.');

        const invoice = await invoicesRepo.findById(invId);
        if (!invoice) {
          throw new Error(`Рахунок ${invId} не знайдено.`);
        }

        // Verify user owns this invoice's project
        const project = await projectsRepo.findById(invoice.project_id, userId);
        if (!project) {
          throw new Error(`Рахунок ${invId} належить проєкту іншого користувача.`);
        }

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(invoice, null, 2) }],
          },
        });
      }

      // --- 3.7. LIST INVOICES ---
      if (toolName === 'list_invoices') {
        const { projectId, status, limit = 20 } = args;

        let targetProjectId = projectId;
        if (!targetProjectId) {
          const project = await resolveTargetProject();
          targetProjectId = project.id;
        } else {
          // Verify ownership
          await resolveTargetProject(targetProjectId);
        }

        const invoices = await invoicesRepo.list({
          projectId: targetProjectId,
          status: status && status !== 'all' ? status : undefined,
          limit: Number(limit),
        });

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
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
                    payUrl: `${origin}/pay/${i.id}`,
                  })),
                  null,
                  2
                ),
              },
            ],
          },
        });
      }

      // --- 3.8. SIMULATE PAYMENT ---
      if (toolName === 'simulate_payment') {
        const { invoiceId, action, failureReason } = args;
        if (!invoiceId || !action) throw new Error('Параметри invoiceId та action обов\'язкові.');

        const invoice = await invoicesRepo.findById(invoiceId);
        if (!invoice) {
          throw new Error(`Рахунок ${invoiceId} не знайдено.`);
        }

        // Verify project ownership
        const project = await projectsRepo.findById(invoice.project_id, userId);
        if (!project) {
          throw new Error(`Немає доступу до рахунку ${invoiceId}.`);
        }

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

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `✅ Статус рахунку ${invoiceId} оновлено на [${newStatus}].\nWebhook: ${webhookStatusText}.`,
              },
            ],
          },
        });
      }

      // --- 3.9. GET WEBHOOK LOGS ---
      if (toolName === 'get_webhook_logs') {
        const { projectId, invoiceId, limit = 15 } = args;

        let targetProjectId = projectId;
        if (!targetProjectId) {
          const project = await resolveTargetProject();
          targetProjectId = project.id;
        } else {
          await resolveTargetProject(targetProjectId);
        }

        const logs = await webhooksRepo.list({
          projectId: targetProjectId,
          invoiceId,
          limit: Number(limit),
        });

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }],
          },
        });
      }

      // --- 3.10. RETRY WEBHOOK ---
      if (toolName === 'retry_webhook') {
        const { invoiceId, customUrl } = args;
        if (!invoiceId) throw new Error('Потрібно вказати invoiceId.');

        const invoice = await invoicesRepo.findById(invoiceId);
        if (!invoice) {
          throw new Error(`Рахунок ${invoiceId} не знайдено.`);
        }

        const project = await projectsRepo.findById(invoice.project_id, userId);
        if (!project) {
          throw new Error(`Рахунок ${invoiceId} не належить вашому акаунту.`);
        }

        const targetUrl = customUrl || invoice.webhook_url;
        if (!targetUrl) throw new Error('Не вказано webhook_url.');

        const invoiceToSend = customUrl ? { ...invoice, webhook_url: customUrl } : invoice;
        await sendWebhook(invoiceToSend);

        const [log] = await webhooksRepo.list({ projectId: project.id, invoiceId, limit: 1 });

        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `📡 Вебхук відправлено на ${targetUrl}:\nHTTP Status: ${log?.status_code ?? 'Помилка'}\nЧас: ${log?.duration_ms ?? 0} мс\nТіло відповіді: ${log?.response_body || 'пусто'}`,
              },
            ],
          },
        });
      }

      throw new Error(`Невідомий інструмент: ${toolName}`);
    } catch (err: any) {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err.message || String(err),
        },
      });
    }
  }

  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32601, message: `Method not found: ${method}` }, id },
    { status: 404 }
  );
}
