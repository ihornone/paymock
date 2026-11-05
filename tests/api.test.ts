import assert from 'node:assert';

const BASE_URL = process.env.PAYMOCK_URL || 'http://127.0.0.1:8787';

const DEMO_TOKEN = process.env.PAYMOCK_DEMO_TOKEN || '';
const DEMO_USER_ID = process.env.PAYMOCK_USER_ID || 'demo_user';

const ACCOUNT_TOKEN = process.env.PAYMOCK_ACCOUNT_TOKEN || '';

function accountAuthHeaders(): Record<string, string> {
  if (ACCOUNT_TOKEN) return { 'X-Token': ACCOUNT_TOKEN };
  return { 'x-user-id': DEMO_USER_ID };
}

async function runTests() {
  console.log(`🚀 Starting Paymock E2E Verification Tests against ${BASE_URL}...`);

  console.log('\n[Test 1] Testing /api/merchant/details authorization...');
  const resNoAuth = await fetch(`${BASE_URL}/api/merchant/details`);
  assert.strictEqual(resNoAuth.status, 403, 'Should return 403 when X-Token is missing');
  const errNoAuth = await resNoAuth.json() as { errCode: string };
  assert.strictEqual(errNoAuth.errCode, 'FORBIDDEN');

  const resAuth = await fetch(`${BASE_URL}/api/merchant/details`, {
    headers: { 'X-Token': DEMO_TOKEN },
  });
  assert.strictEqual(resAuth.status, 200, 'Should return 200 with valid X-Token');
  const details = await resAuth.json() as { merchantId: string; merchantName: string };
  assert.strictEqual(details.merchantId, 'pm_demo_store');
  assert.strictEqual(details.merchantName, 'Демо Магазин (Paymock)');
  console.log('✅ Auth and details verified successfully.');

  console.log('\n[Test 2] Testing /api/merchant/invoice/create...');
  const resCreate = await fetch(`${BASE_URL}/api/merchant/invoice/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': DEMO_TOKEN,
    },
    body: JSON.stringify({
      amount: 4200,
      ccy: 980,
      merchantPaymInfo: {
        destination: 'Автоматизований тест',
        reference: 'test_ref_42',
        basketOrder: [{ name: 'Тестовий товар', qty: 1, sum: 4200 }],
      },
      withAppUrl: true,
      webHookUrl: 'https://webhook.site/paymock-automated-test',
    }),
  });
  assert.strictEqual(resCreate.status, 200);
  const createdInvoice = await resCreate.json() as { invoiceId: string; pageUrl: string; appUrl: string };
  assert.ok(createdInvoice.invoiceId.startsWith('p2_'), 'invoiceId should start with p2_');
  assert.ok(createdInvoice.pageUrl.includes(createdInvoice.invoiceId), 'pageUrl should contain invoiceId');
  assert.ok(createdInvoice.appUrl.includes('paymock://'), 'appUrl should contain paymock scheme');
  console.log(`✅ Invoice ${createdInvoice.invoiceId} created successfully.`);

  console.log('\n[Test 3] Testing /api/merchant/invoice/status (initial)...');
  const resStatusInitial = await fetch(
    `${BASE_URL}/api/merchant/invoice/status?invoiceId=${createdInvoice.invoiceId}`,
    { headers: { 'X-Token': DEMO_TOKEN } }
  );
  assert.strictEqual(resStatusInitial.status, 200);
  const statusInitial = await resStatusInitial.json() as { status: string; amount: number };
  assert.strictEqual(statusInitial.status, 'created');
  assert.strictEqual(statusInitial.amount, 4200);
  console.log('✅ Initial invoice status is "created".');

  console.log('\n[Test 4] Simulating payment success...');
  const resSimulate = await fetch(`${BASE_URL}/pay/${createdInvoice.invoiceId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'success' }),
  });
  assert.strictEqual(resSimulate.status, 200);
  const simulateData = await resSimulate.json() as { ok: boolean; status: string };
  assert.strictEqual(simulateData.ok, true);
  assert.strictEqual(simulateData.status, 'success');

  console.log('\n[Test 5] Testing /api/merchant/invoice/status (paid)...');
  const resStatusPaid = await fetch(
    `${BASE_URL}/api/merchant/invoice/status?invoiceId=${createdInvoice.invoiceId}`,
    { headers: { 'X-Token': DEMO_TOKEN } }
  );
  assert.strictEqual(resStatusPaid.status, 200);
  const statusPaid = await resStatusPaid.json() as {
    status: string;
    paymentInfo?: { paymentSystem: string; maskedPan: string };
  };
  assert.strictEqual(statusPaid.status, 'success');
  assert.ok(statusPaid.paymentInfo, 'paymentInfo should be present after payment');
  assert.strictEqual(statusPaid.paymentInfo.paymentSystem, 'Visa');
  console.log('✅ Paid invoice status is "success" with simulated card details.');

  console.log('\n[Test 6] Testing /api/merchant/invoice/cancel...');
  const resCancel = await fetch(`${BASE_URL}/api/merchant/invoice/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': DEMO_TOKEN,
    },
    body: JSON.stringify({
      invoiceId: createdInvoice.invoiceId,
      extRef: 'ext_cancel_e2e_1',
    }),
  });
  assert.strictEqual(resCancel.status, 200);
  const cancelData = await resCancel.json() as { status: string };
  assert.strictEqual(cancelData.status, 'success');

  const resStatusReversed = await fetch(
    `${BASE_URL}/api/merchant/invoice/status?invoiceId=${createdInvoice.invoiceId}`,
    { headers: { 'X-Token': DEMO_TOKEN } }
  );
  const statusReversed = await resStatusReversed.json() as { status: string; finalAmount: number };
  assert.strictEqual(statusReversed.status, 'reversed');
  assert.strictEqual(statusReversed.finalAmount, 0);
  console.log('✅ Invoice successfully cancelled and refunded (status "reversed").');

  console.log('\n[Test 7] Testing multi-project creation and tenant isolation...');
  const resNewProject = await fetch(`${BASE_URL}/api/admin/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...accountAuthHeaders() },
    body: JSON.stringify({
      name: 'E2E Тестовий Магазин',
      edrpou: '11223344',
    }),
  });
  assert.strictEqual(resNewProject.status, 201);
  const newProjectData = await resNewProject.json() as {
    ok: boolean;
    project: { id: string; name: string };
    token: string;
  };
  assert.strictEqual(newProjectData.ok, true);
  assert.ok(newProjectData.token.startsWith('pmk_live_'));

  const resCustomDetails = await fetch(`${BASE_URL}/api/merchant/details`, {
    headers: { 'X-Token': newProjectData.token },
  });
  assert.strictEqual(resCustomDetails.status, 200);
  const customDetails = await resCustomDetails.json() as { merchantName: string };
  assert.strictEqual(customDetails.merchantName, 'E2E Тестовий Магазин');
  console.log('✅ Multi-project isolation and custom tokens verified.');

  console.log('\n[Test 8] Testing Global MCP Server (create_project, list_projects, create_invoice)...');

  const mcpToken = ACCOUNT_TOKEN || newProjectData.token;

  const resMcpTools = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }),
  });
  assert.strictEqual(resMcpTools.status, 200);
  const mcpToolsData = await resMcpTools.json() as {
    result: { tools: Array<{ name: string }> };
  };
  const toolNames = mcpToolsData.result.tools.map((t) => t.name);
  assert.ok(toolNames.includes('create_project'));
  assert.ok(toolNames.includes('list_projects'));
  assert.ok(toolNames.includes('get_project'));
  assert.ok(toolNames.includes('reset_project_token'));
  assert.ok(toolNames.includes('create_invoice'));

  const resCreateProjectMcp = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'create_project',
        arguments: {
          name: 'AI Автоматичний Магазин',
          defaultWebhookUrl: 'https://test-shop.org/api/mcp-webhook',
        },
      },
    }),
  });
  assert.strictEqual(resCreateProjectMcp.status, 200);

  const createProjectPayload = await resCreateProjectMcp.json() as {
    result?: { content: Array<{ text: string }> };
    error?: { code: number; message: string };
  };

  if (!ACCOUNT_TOKEN) {
    assert.ok(
      createProjectPayload.error,
      'a project-scoped MCP session cannot create a project'
    );
    assert.strictEqual(
      createProjectPayload.result,
      undefined,
      'no project is created by a project-scoped session'
    );
    console.log('✅ Project-scoped MCP session is refused for create_project.');
  } else {
    const createdProjectParsed = JSON.parse(createProjectPayload.result!.content[0].text);
    assert.ok(createdProjectParsed.project.id);
    assert.ok(createdProjectParsed.token.startsWith('pmk_live_'));
    assert.strictEqual(createdProjectParsed.project.name, 'AI Автоматичний Магазин');
    console.log('✅ Account-scoped MCP session created a project.');
  }

  const mcpProjectId = ACCOUNT_TOKEN
    ? (JSON.parse((createProjectPayload as { result: { content: Array<{ text: string }> } }).result.content[0].text) as { project: { id: string } }).project.id
    : newProjectData.project.id;

  const resCreateInvoiceMcp = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'create_invoice',
        arguments: {
          projectId: mcpProjectId,
          amount: 5500,
          destination: 'Замовлення через Global MCP',
        },
      },
    }),
  });
  assert.strictEqual(resCreateInvoiceMcp.status, 200);
  const createInvoiceResult = await resCreateInvoiceMcp.json() as {
    result: { content: Array<{ text: string }> };
  };
  const createdInvoiceParsed = JSON.parse(createInvoiceResult.result.content[0].text);
  assert.strictEqual(createdInvoiceParsed.projectId, mcpProjectId);
  assert.strictEqual(createdInvoiceParsed.amount, 5500);
  assert.ok(createdInvoiceParsed.pageUrl.includes(createdInvoiceParsed.invoiceId));

  const resSimulateMcp = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'simulate_payment',
        arguments: {
          invoiceId: createdInvoiceParsed.invoiceId,
          action: 'success',
        },
      },
    }),
  });
  assert.strictEqual(resSimulateMcp.status, 200);
  const simulateMcpResult = (await resSimulateMcp.json()) as {
    result: { content: Array<{ text: string }> };
  };
  assert.ok(simulateMcpResult.result.content[0].text.includes('[success]'));

  const resResetTokenMcp = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'reset_project_token',
        arguments: {
          projectId: mcpProjectId,
        },
      },
    }),
  });
  assert.strictEqual(resResetTokenMcp.status, 200);
  const resetTokenParsed = JSON.parse((await resResetTokenMcp.json() as any).result.content[0].text);
  assert.ok(resetTokenParsed.newToken.startsWith('pmk_live_'));
  assert.notStrictEqual(
    resetTokenParsed.newToken,
    newProjectData.token,
    'the rotated token differs from the previous one'
  );

  const mcpLiveToken = ACCOUNT_TOKEN || resetTokenParsed.newToken;

  const resOversizedBasket = await fetch(`${BASE_URL}/api/merchant/invoice/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': resetTokenParsed.newToken,
    },
    body: JSON.stringify({
      amount: 1000,
      ccy: 980,
      merchantPaymInfo: {
        destination: 'Oversized basket',
        basketOrder: Array.from({ length: 200 }, () => ({ name: 'Item', qty: 1, sum: 100 })),
      },
    }),
  });
  assert.strictEqual(
    resOversizedBasket.status,
    400,
    'a basket with more than 50 items must be rejected'
  );
  console.log('✅ Oversized basket rejected by server-side validation.');

  const resDiscover = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpLiveToken,
      'mcp-method': 'server/discover',
      'mcp-protocol-version': '2026-07-28',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 6,
      method: 'server/discover',
    }),
  });
  assert.strictEqual(resDiscover.status, 200, 'server/discover should return 200 OK');
  const discoverData = (await resDiscover.json()) as any;
  assert.strictEqual(discoverData.jsonrpc, '2.0');
  assert.ok(Array.isArray(discoverData.result.supportedVersions));
  assert.ok(discoverData.result.capabilities.tools);
  console.log('✅ MCP server/discover probe verified successfully.');

  const resInit = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpLiveToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'paymock-test-client', version: '1.0.0' },
      },
    }),
  });
  assert.strictEqual(resInit.status, 200);
  const initData = (await resInit.json()) as any;
  assert.strictEqual(initData.result.protocolVersion, '2024-11-05');
  console.log('✅ MCP initialize handshake verified successfully.');

  const resNotification = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpLiveToken,
      'mcp-protocol-version': '2024-11-05',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });
  assert.ok(
    resNotification.status === 200 || resNotification.status === 204,
    `notifications/initialized should return 204 or 200, got ${resNotification.status}`
  );
  console.log('✅ MCP notifications/initialized acknowledged successfully without 404.');

  const resPing = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpLiveToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 8,
      method: 'ping',
    }),
  });
  assert.strictEqual(resPing.status, 200);
  const pingData = (await resPing.json()) as any;
  assert.deepStrictEqual(pingData.result, {});
  console.log('✅ MCP ping verified successfully.');

  const resResourcesList = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpLiveToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 9,
      method: 'resources/list',
    }),
  });
  assert.strictEqual(resResourcesList.status, 200);
  const resourcesData = (await resResourcesList.json()) as any;
  assert.ok(Array.isArray(resourcesData.result.resources));
  assert.ok(resourcesData.result.resources.some((r: any) => r.uri === 'paymock://projects'));

  const resResourceRead = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpLiveToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 10,
      method: 'resources/read',
      params: { uri: 'paymock://projects' },
    }),
  });
  assert.strictEqual(resResourceRead.status, 200);
  const resourceReadData = (await resResourceRead.json()) as any;
  assert.ok(Array.isArray(resourceReadData.result.contents));
  console.log('✅ MCP resources/list and resources/read verified successfully.');

  const resUnknownMethod = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpLiveToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 11,
      method: 'non_existent_mcp_method',
    }),
  });
  assert.strictEqual(resUnknownMethod.status, 200, 'Unknown JSON-RPC method should return 200 with error object');
  const unknownMethodData = (await resUnknownMethod.json()) as any;
  assert.strictEqual(unknownMethodData.error.code, -32601);
  console.log('✅ Unknown JSON-RPC method cleanly handled with -32601 and HTTP 200.');

  const resOptions = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'OPTIONS',
  });
  assert.strictEqual(resOptions.status, 204);
  assert.strictEqual(resOptions.headers.get('Access-Control-Allow-Origin'), '*');
  console.log('✅ MCP OPTIONS CORS preflight verified successfully.');

  const resNegativeLimit = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpLiveToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'list_invoices', arguments: { limit: -1 } },
    }),
  });
  assert.strictEqual(resNegativeLimit.status, 200);
  const negativeLimitText = await resNegativeLimit.text();
  const negativeLimitResult = JSON.parse(negativeLimitText) as any;
  const negativeLimitRows = JSON.parse(negativeLimitResult.result.content[0].text) as any[];
  assert.ok(
    negativeLimitRows.length <= 200,
    `a negative limit must be clamped to at most 200 rows, got ${negativeLimitRows.length}`
  );
  console.log(`✅ Negative limit clamped to ${negativeLimitRows.length} rows (no unbounded scan).`);

  const resHugeLimit = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': mcpLiveToken,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: { name: 'list_invoices', arguments: { limit: 1_000_000 } },
    }),
  });
  assert.strictEqual(resHugeLimit.status, 200);
  const hugeLimitResult = (await resHugeLimit.json()) as any;
  const hugeLimitRows = JSON.parse(hugeLimitResult.result.content[0].text) as any[];
  assert.ok(
    hugeLimitRows.length <= 200,
    `an oversized limit must be capped at 200 rows, got ${hugeLimitRows.length}`
  );
  console.log(`✅ Oversized limit capped to ${hugeLimitRows.length} rows.`);

  const resPingNoAuth = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 14, method: 'ping' }),
  });
  assert.strictEqual(resPingNoAuth.status, 200, 'ping must not require a token');
  const pingNoAuthData = (await resPingNoAuth.json()) as any;
  assert.deepStrictEqual(pingNoAuthData.result, {});

  const resDiscoverNoAuth = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'mcp-method': 'server/discover' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 15, method: 'server/discover' }),
  });
  assert.strictEqual(resDiscoverNoAuth.status, 200, 'server/discover must not require a token');
  console.log('✅ Protocol methods work without authentication (zero DB queries).');

  const resToolNoAuth = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 16,
      method: 'tools/call',
      params: { name: 'list_projects', arguments: {} },
    }),
  });
  assert.strictEqual(resToolNoAuth.status, 401, 'a tool call without a token must be rejected');
  console.log('✅ Tool calls without a token are rejected with 401.');

  const resForgedToken = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': `pmk_usr_${DEMO_USER_ID}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 17,
      method: 'tools/call',
      params: { name: 'list_projects', arguments: {} },
    }),
  });
  assert.strictEqual(
    resForgedToken.status,
    401,
    'a personal access token that is not stored must be rejected'
  );
  console.log('✅ Forged personal access token rejected with 401.');

  const resForgedAdmin = await fetch(`${BASE_URL}/api/admin/projects`, {
    headers: { 'X-Token': `pmk_usr_${DEMO_USER_ID}` },
  });
  const forgedAdminBody = await resForgedAdmin.json() as {
    projects?: unknown[];
    invoices?: unknown[];
  };
  assert.deepStrictEqual(
    forgedAdminBody.projects ?? [],
    [],
    'a forged personal access token must not expose any project'
  );
  assert.deepStrictEqual(
    forgedAdminBody.invoices ?? [],
    [],
    'a forged personal access token must not expose any invoice'
  );
  console.log('✅ Forged personal access token exposes no account data.');

  console.log('✅ Global MCP Server verified: dynamic project creation, invoice generation & token reset.');

  console.log('\n🎉 ALL PAYMOCK E2E VERIFICATION TESTS PASSED SUCCESSFULLY! 🚀');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
