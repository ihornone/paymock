import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const host = req.headers.get('host') || 'localhost:8787';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}`;

  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'Paymock Acquiring API',
      version: '1.0.0',
      description: 'API mock-сервісу інтернет-еквайрингу Paymock. Повна сумісність контракту запитів/відповідей, підтримка мультипроєктності та вебхуків.',
    },
    servers: [
      {
        url: baseUrl,
        description: 'Поточний сервер Paymock',
      },
    ],
    paths: {
      '/api/merchant/details': {
        get: {
          summary: 'Дані поточного мерчанта',
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Успішна відповідь',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      merchantId: { type: 'string' },
                      merchantName: { type: 'string' },
                      edrpou: { type: 'string' },
                    },
                  },
                },
              },
            },
            '403': { description: 'Недійсний або відсутній токен' },
          },
        },
      },
      '/api/merchant/invoice/create': {
        post: {
          summary: 'Створення рахунку (інвойсу)',
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['amount'],
                  properties: {
                    amount: { type: 'integer' },
                    ccy: { type: 'integer', default: 980 },
                    merchantPaymInfo: { type: 'object' },
                    redirectUrl: { type: 'string' },
                    webHookUrl: { type: 'string' },
                    validity: { type: 'integer', default: 900, description: 'Час дії рахунку в секундах (за замовчуванням 900 с / 15 хвилин)' },
                    paymentType: { type: 'string', enum: ['debit', 'hold'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Рахунок створено',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      invoiceId: { type: 'string' },
                      pageUrl: { type: 'string' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Помилка валідації параметрів' },
            '403': { description: 'Недійсний токен' },
          },
        },
      },
      '/api/merchant/invoice/status': {
        get: {
          summary: 'Перевірка статусу рахунку',
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'invoiceId',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Стан рахунку',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      invoiceId: { type: 'string' },
                      status: { type: 'string' },
                      amount: { type: 'integer' },
                      ccy: { type: 'integer' },
                    },
                  },
                },
              },
            },
            '404': { description: 'Рахунок не знайдено' },
          },
        },
      },
      '/api/merchant/invoice/cancel': {
        post: {
          summary: 'Скасування або повернення коштів за рахунком',
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['invoiceId'],
                  properties: {
                    invoiceId: { type: 'string' },
                    extRef: { type: 'string' },
                    amount: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Повернення успішне' },
            '400': { description: 'Неприпустимий стан рахунку або параметри' },
          },
        },
      },
      '/api/merchant/invoice/remove': {
        post: {
          summary: 'Анулювання неоплаченого рахунку',
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['invoiceId'],
                  properties: {
                    invoiceId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Рахунок успішно анульовано' },
            '400': { description: 'Неможливо анулювати цей рахунок' },
          },
        },
      },
    },
  };

  return NextResponse.json(spec);
}
