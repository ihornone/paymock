import assert from 'node:assert';

const BASE_URL = process.env.PAYMOCK_URL || 'http://127.0.0.1:8787';
const DEMO_TOKEN = 'pmk_demo_test1234567890abcdef';

async function runTests() {
  console.log(`🚀 Starting Paymock E2E Verification Tests against ${BASE_URL}...`);

  // 1. Auth & Details Test
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

  // 2. Invoice Creation Test
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

  // 3. Status Verification (Initial 'created')
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

  // 4. Simulate Payment Success via Checkout API
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

  // 5. Status Verification (After payment 'success')
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

  // 6. Cancel / Refund Test
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

  // Status after cancel should be 'reversed'
  const resStatusReversed = await fetch(
    `${BASE_URL}/api/merchant/invoice/status?invoiceId=${createdInvoice.invoiceId}`,
    { headers: { 'X-Token': DEMO_TOKEN } }
  );
  const statusReversed = await resStatusReversed.json() as { status: string; finalAmount: number };
  assert.strictEqual(statusReversed.status, 'reversed');
  assert.strictEqual(statusReversed.finalAmount, 0);
  console.log('✅ Invoice successfully cancelled and refunded (status "reversed").');

  // 7. Multi-project Management Test
  console.log('\n[Test 7] Testing multi-project creation and tenant isolation...');
  const resNewProject = await fetch(`${BASE_URL}/api/admin/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'E2E Тестовий Магазин',
      edrpou: '11223344',
    }),
  });
  assert.strictEqual(resNewProject.status, 200);
  const newProjectData = await resNewProject.json() as {
    ok: boolean;
    project: { id: string; token: string; name: string };
  };
  assert.strictEqual(newProjectData.ok, true);
  assert.ok(newProjectData.project.token.startsWith('pmk_live_'));

  // Test details with new project token
  const resCustomDetails = await fetch(`${BASE_URL}/api/merchant/details`, {
    headers: { 'X-Token': newProjectData.project.token },
  });
  assert.strictEqual(resCustomDetails.status, 200);
  const customDetails = await resCustomDetails.json() as { merchantName: string };
  assert.strictEqual(customDetails.merchantName, 'E2E Тестовий Магазин');
  console.log('✅ Multi-project isolation and custom tokens verified.');

  // [Test 8] Global MCP Server (Account-Scoped Tools)
  console.log('\n[Test 8] Testing Global MCP Server (create_project, list_projects, create_invoice)...');
  
  // 8.1 List MCP Tools
  const resMcpTools = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': newProjectData.project.token,
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

  // 8.2 Create a project via MCP AI Tool
  const resCreateProjectMcp = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': newProjectData.project.token,
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
  const createProjectResult = await resCreateProjectMcp.json() as {
    result: { content: Array<{ text: string }> };
  };
  const createdProjectParsed = JSON.parse(createProjectResult.result.content[0].text);
  assert.ok(createdProjectParsed.project.id);
  assert.ok(createdProjectParsed.project.token.startsWith('pmk_live_'));
  assert.strictEqual(createdProjectParsed.project.name, 'AI Автоматичний Магазин');

  const mcpProjectId = createdProjectParsed.project.id;

  // 8.3 Create Invoice in the newly created project via MCP
  const resCreateInvoiceMcp = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': newProjectData.project.token,
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

  // 8.4 Simulate payment via MCP
  const resSimulateMcp = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': newProjectData.project.token,
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

  // 8.5 Reset Project Token via MCP
  const resResetTokenMcp = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': newProjectData.project.token,
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
  assert.notStrictEqual(resetTokenParsed.newToken, createdProjectParsed.project.token);

  console.log('✅ Global MCP Server verified: dynamic project creation, invoice generation & token reset.');

  console.log('\n🎉 ALL PAYMOCK E2E VERIFICATION TESTS PASSED SUCCESSFULLY! 🚀');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
