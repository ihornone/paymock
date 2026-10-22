/**
 * Deep verification of the MCP server and the merchant API.
 * Checks response bodies and semantics, not just status codes.
 */
const B = process.env.PAYMOCK_URL || 'https://paymock.ihornone.site';
const PROJECT_TOKEN = 'pmk_demo_test1234567890abcdef';
const ACCOUNT_TOKEN = process.env.PAYMOCK_ACCOUNT_TOKEN || '';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function rpc(body, token) {
  const res = await fetch(`${B}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Token': token } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, headers: res.headers, json, text };
}

function toolText(result) {
  if (!result?.result?.content?.[0]?.text) return null;
  try { return JSON.parse(result.result.content[0].text); } catch { return result.result.content[0].text; }
}

async function callTool(name, args, token, id = 1) {
  return rpc({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args || {} } }, token);
}

console.log(`\n═══ MCP: протокол ═══`);

// 1. server/discover
{
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'server/discover' }, ACCOUNT_TOKEN);
  check('server/discover → 200', r.status === 200, `got ${r.status}`);
  check('server/discover → JSON-RPC 2.0', r.json?.jsonrpc === '2.0');
  check('server/discover → supportedVersions', Array.isArray(r.json?.result?.supportedVersions) && r.json.result.supportedVersions.length > 0);
  check('server/discover → capabilities.tools', !!r.json?.result?.capabilities?.tools);
}

// 2. initialize
{
  const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '1' } } }, ACCOUNT_TOKEN);
  check('initialize → 200', r.status === 200, `got ${r.status}`);
  check('initialize → protocolVersion 2024-11-05', r.json?.result?.protocolVersion === '2024-11-05', r.json?.result?.protocolVersion);
  check('initialize → serverInfo', !!r.json?.result?.serverInfo?.name);
}

// 3. notifications/initialized
{
  const r = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, ACCOUNT_TOKEN);
  check('notifications/initialized → 204 (без тіла)', r.status === 204, `got ${r.status}`);
  check('notifications/initialized → порожнє тіло', r.text.length === 0);
}

// 4. ping
{
  const r = await rpc({ jsonrpc: '2.0', id: 3, method: 'ping' }, ACCOUNT_TOKEN);
  check('ping → 200 + result {}', r.status === 200 && JSON.stringify(r.json?.result) === '{}');
}

// 5. tools/list
const EXPECTED_TOOLS = ['list_projects', 'create_project', 'get_project', 'reset_project_token', 'create_invoice', 'get_invoice', 'list_invoices', 'simulate_payment', 'get_webhook_logs', 'retry_webhook'];
{
  const r = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, ACCOUNT_TOKEN);
  const names = (r.json?.result?.tools || []).map(t => t.name);
  check('tools/list → 200', r.status === 200);
  check(`tools/list → усі 10 інструментів (${names.length})`, names.length === 10, `names=${names.join(',')}`);
  for (const t of EXPECTED_TOOLS) {
    check(`tools/list містить ${t}`, names.includes(t));
  }
  const bad = (r.json?.result?.tools || []).filter(t => !t.description || !t.inputSchema);
  check('tools/list → у кожного є description та inputSchema', bad.length === 0, `bad=${bad.map(t=>t.name).join(',')}`);
}

console.log(`\n═══ MCP: інструменти (акаунтний токен) ═══`);

// list_projects
let createdProjectId = null;
{
  const r = await callTool('list_projects', {}, ACCOUNT_TOKEN);
  const data = toolText(r.json);
  check('list_projects → 200', r.status === 200);
  check('list_projects → масив', Array.isArray(data), typeof data);
}

// create_project
{
  const r = await callTool('create_project', { name: 'Verify Bot ' + Date.now() }, ACCOUNT_TOKEN);
  const data = toolText(r.json);
  check('create_project → 200', r.status === 200);
  check('create_project → id присутній', !!data?.project?.id, JSON.stringify(data)?.slice(0, 120));
  check('create_project → токен pmk_live_', String(data?.project?.token || '').startsWith('pmk_live_'));
  createdProjectId = data?.project?.id || null;
}

// get_project
{
  const r = await callTool('get_project', { projectId: createdProjectId }, ACCOUNT_TOKEN);
  const data = toolText(r.json);
  check('get_project → 200', r.status === 200);
  check('get_project → правильний id', data?.id === createdProjectId, `got ${data?.id}`);
}

// create_invoice
let invoiceId = null;
{
  const r = await callTool('create_invoice', { projectId: createdProjectId, amount: 4321, destination: 'Verify MCP' }, ACCOUNT_TOKEN);
  const data = toolText(r.json);
  check('create_invoice → 200', r.status === 200);
  check('create_invoice → invoiceId', !!data?.invoiceId);
  check('create_invoice → amount 4321', data?.amount === 4321, `got ${data?.amount}`);
  check('create_invoice → projectId', data?.projectId === createdProjectId);
  check('create_invoice → pageUrl', String(data?.pageUrl || '').includes(data?.invoiceId || 'x'));
  invoiceId = data?.invoiceId || null;
}

// get_invoice
{
  const r = await callTool('get_invoice', { invoiceId }, ACCOUNT_TOKEN);
  const data = toolText(r.json);
  check('get_invoice → 200', r.status === 200);
  check('get_invoice → destination', data?.destination === 'Verify MCP', `got ${data?.destination}`);
}

// list_invoices
{
  const r = await callTool('list_invoices', { projectId: createdProjectId, limit: 5 }, ACCOUNT_TOKEN);
  const data = toolText(r.json);
  check('list_invoices → 200', r.status === 200);
  check('list_invoices → масив', Array.isArray(data));
  check('list_invoices → не більше limit', Array.isArray(data) && data.length <= 5, `len=${data?.length}`);
}

// simulate_payment
{
  const r = await callTool('simulate_payment', { invoiceId, action: 'success' }, ACCOUNT_TOKEN);
  const data = toolText(r.json);
  check('simulate_payment → 200', r.status === 200);
  check('simulate_payment → статус success у тексті', String(data || '').includes('success'), String(data).slice(0, 80));
}

// get_webhook_logs
{
  const r = await callTool('get_webhook_logs', { projectId: createdProjectId, limit: 5 }, ACCOUNT_TOKEN);
  const data = toolText(r.json);
  check('get_webhook_logs → 200', r.status === 200);
  check('get_webhook_logs → масив', Array.isArray(data));
}

// retry_webhook: без webhook_url помилка — це правильна поведінка
{
  const r = await callTool('retry_webhook', { invoiceId }, ACCOUNT_TOKEN);
  check('retry_webhook без webhook_url → помилка', !!r.json?.error, `got ${r.status}`);
  check('retry_webhook → пояснює причину', String(r.json?.error?.message || '').includes('webhook_url'), r.json?.error?.message);
}
// retry_webhook з явним webhook_url — має відпрацювати
{
  const r = await callTool('retry_webhook', { invoiceId, customUrl: 'https://example.com/hook' }, ACCOUNT_TOKEN);
  const data = toolText(r.json);
  check('retry_webhook з URL → 200', r.status === 200, `got ${r.status} ${r.text.slice(0,80)}`);
  check('retry_webhook → містить HTTP Status', String(data || '').includes('HTTP Status'), String(data).slice(0, 80));
}

// reset_project_token
{
  const before = toolText((await callTool('get_project', { projectId: createdProjectId }, ACCOUNT_TOKEN)).json);
  const r = await callTool('reset_project_token', { projectId: createdProjectId }, ACCOUNT_TOKEN);
  const data = toolText(r.json);
  check('reset_project_token → 200', r.status === 200);
  check('reset_project_token → новий токен', String(data?.newToken || '').startsWith('pmk_live_'));
  check('reset_project_token → токен змінився', data?.newToken !== before?.token, `old=${before?.token} new=${data?.newToken}`);
}

console.log(`\n═══ MCP: ізоляція scope ═══`);

// project token не може створювати проєкти
{
  const r = await callTool('create_project', { name: 'Should Fail' }, PROJECT_TOKEN);
  check('project-токен: create_project заблоковано', !!r.json?.error, `got ${r.status} ${r.text.slice(0, 90)}`);
  check('project-токен: повідомлення пояснює причину', String(r.json?.error?.message || '').includes('проєкт'), r.json?.error?.message);
}

// project token не може читати чужий проєкт
{
  const r = await callTool('get_invoice', { invoiceId }, PROJECT_TOKEN);
  check('project-токен: чужий рахунок недоступний', !!r.json?.error, `got ${r.status} ${r.text.slice(0, 90)}`);
}

// project token бачить тільки свій проєкт
{
  const r = await callTool('list_projects', {}, PROJECT_TOKEN);
  const data = toolText(r.json);
  check('project-токен: list_projects → лише свій проєкт', Array.isArray(data) && data.length === 1, `len=${data?.length}`);
  check('project-токен: id свого проєкту', data?.[0]?.id === 'pm_demo_store', data?.[0]?.id);
}

// підроблений токен
{
  const r = await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }, 'pmk_usr_demo_user');
  check('підроблений PAT → 401', r.status === 401, `got ${r.status}`);
}

// невідомий метод
{
  const r = await rpc({ jsonrpc: '2.0', id: 10, method: 'no/such/method' }, ACCOUNT_TOKEN);
  check('невідомий метод → error -32601', r.json?.error?.code === -32601, `got ${r.json?.error?.code}`);
}

console.log(`\n═══ MCP: resources ═══`);
{
  const r = await rpc({ jsonrpc: '2.0', id: 11, method: 'resources/list' }, ACCOUNT_TOKEN);
  const resources = r.json?.result?.resources || [];
  check('resources/list → 200', r.status === 200);
  check('resources/list → paymock://projects', resources.some(x => x.uri === 'paymock://projects'));
  check('resources/list → ресурси проєкту', resources.some(x => /paymock:\/\/projects\/.+\/stats/.test(x.uri)));
}
{
  const r = await rpc({ jsonrpc: '2.0', id: 12, method: 'resources/read', params: { uri: 'paymock://projects' } }, ACCOUNT_TOKEN);
  const contents = r.json?.result?.contents || [];
  check('resources/read → 200', r.status === 200);
  check('resources/read → contents', contents.length > 0);
}
{
  const r = await rpc({ jsonrpc: '2.0', id: 13, method: 'resources/read', params: { uri: 'paymock://projects/nope/stats' } }, ACCOUNT_TOKEN);
  check('resources/read → невідомий URI → error', !!r.json?.error, `got ${r.status}`);
}

console.log(`\n═══ API мерчанта ═══`);
const H = { 'Content-Type': 'application/json', 'X-Token': PROJECT_TOKEN };

{
  const res = await fetch(`${B}/api/merchant/details`, { headers: { 'X-Token': PROJECT_TOKEN } });
  const body = await res.json();
  check('GET details → 200', res.status === 200);
  check('GET details → merchantId', body.merchantId === 'pm_demo_store', body.merchantId);
  check('GET details → merchantName', !!body.merchantName);
  check('GET details → Cache-Control private', (res.headers.get('cache-control') || '').includes('private'), res.headers.get('cache-control'));
}
{
  const res = await fetch(`${B}/api/merchant/details`);
  check('GET details без токена → 403', res.status === 403, `got ${res.status}`);
}
{
  const res = await fetch(`${B}/api/merchant/details`, { headers: { 'X-Token': 'pmk_live_nope' } });
  check('GET details з невірним токеном → 403', res.status === 403, `got ${res.status}`);
}
{
  const res = await fetch(`${B}/api/merchant/invoice/create`, { method: 'POST', headers: H, body: JSON.stringify({ amount: 1234, ccy: 980, merchantPaymInfo: { destination: 'Verify API' } }) });
  const body = await res.json();
  check('POST invoice/create → 200', res.status === 200, `got ${res.status}`);
  check('POST invoice/create → invoiceId p2_', String(body.invoiceId || '').startsWith('p2_'));
  check('POST invoice/create → pageUrl', String(body.pageUrl || '').includes(body.invoiceId || 'x'));
  globalThis.__apiInvoiceId = body.invoiceId;
}
{
  const res = await fetch(`${B}/api/merchant/invoice/create`, { method: 'POST', headers: H, body: JSON.stringify({ ccy: 980 }) });
  check('POST invoice/create без amount → 400', res.status === 400, `got ${res.status}`);
}
{
  const res = await fetch(`${B}/api/merchant/invoice/create`, { method: 'POST', headers: H, body: 'not json' });
  check('POST invoice/create з битим JSON → 400', res.status === 400, `got ${res.status}`);
}
{
  const res = await fetch(`${B}/api/merchant/invoice/status?invoiceId=p2_doesnotexist`, { headers: { 'X-Token': PROJECT_TOKEN } });
  check('GET status невідомого рахунку → 404', res.status === 404, `got ${res.status}`);
}
{
  const res = await fetch(`${B}/api/openapi.json`);
  const spec = await res.json();
  check('GET openapi.json → 200', res.status === 200);
  check('openapi.json → є paths', !!spec.paths && Object.keys(spec.paths).length > 0, `${Object.keys(spec.paths || {}).length} paths`);
  check('openapi.json → є /api/merchant/details', !!spec.paths?.['/api/merchant/details']);
  check('openapi.json → є /api/mcp', !!spec.paths?.['/api/mcp']);
  check('openapi.json → є /api/admin/projects', !!spec.paths?.['/api/admin/projects']);
  check('openapi.json → є /api/account/tokens', !!spec.paths?.['/api/account/tokens']);
  const specJson = JSON.stringify(spec);
  check('openapi.json → валідний JSON', specJson.length > 0 && !specJson.includes('undefined'));
}

console.log(`\n═══ Підсумок ═══`);
console.log(`  пройдено: ${pass}   провалено: ${fail}`);
if (failures.length) {
  console.log('\n  ПРОВАЛЕНІ:');
  failures.forEach(f => console.log('   - ' + f));
}
process.exit(fail === 0 ? 0 : 1);
