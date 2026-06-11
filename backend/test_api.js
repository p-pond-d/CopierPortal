/**
 * Copier Report Portal - Automated API Integration Test Suite
 * Zero-dependency script to verify Positive, Negative, and Edge cases.
 * Usage: node backend/test_api.js
 */

const http = require('http');

const API_PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${API_PORT}`;

// Helper to make HTTP Requests using built-in http module
function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    try {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname === 'localhost' ? '127.0.0.1' : parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Simple assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTests() {
  console.log('=== STARTING AUTOMATED API INTEGRATION TESTS ===\n');
  let passed = 0;
  let failed = 0;

  const testCases = [
    // ==========================================
    // POSITIVE TEST CASES
    // ==========================================
    {
      name: 'Positive: Login as admin successfully with correct credentials',
      fn: async (ctx) => {
        const res = await request('POST', '/api/login', {}, { username: 'admin', password: '123456' });
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(res.data.token, 'Expected token in response');
        assert(res.data.role === 'admin', `Expected role admin, got ${res.data.role}`);
        ctx.adminToken = res.data.token;
      }
    },
    {
      name: 'Positive: Login as user successfully with correct credentials',
      fn: async (ctx) => {
        const res = await request('POST', '/api/login', {}, { username: 'user', password: '123456' });
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(res.data.token, 'Expected token in response');
        assert(res.data.role === 'user', `Expected role user, got ${res.data.role}`);
        ctx.userToken = res.data.token;
      }
    },
    {
      name: 'Positive: Access reports list using valid Admin token',
      fn: async (ctx) => {
        assert(ctx.adminToken, 'Pre-requisite: adminToken is required');
        const res = await request('GET', '/api/reports', { Authorization: `Bearer ${ctx.adminToken}` });
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(Array.isArray(res.data), 'Expected reports list to be an array');
      }
    },
    {
      name: 'Positive: Fetch current service rates',
      fn: async (ctx) => {
        assert(ctx.adminToken, 'Pre-requisite: adminToken is required');
        const res = await request('GET', '/api/rates', { Authorization: `Bearer ${ctx.adminToken}` });
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(res.data.print_bw !== undefined, 'Expected rates to contain print_bw');
      }
    },

    // ==========================================
    // NEGATIVE TEST CASES
    // ==========================================
    {
      name: 'Negative: Login fails with incorrect password',
      fn: async () => {
        const res = await request('POST', '/api/login', {}, { username: 'admin', password: 'wrongpassword' });
        assert(res.status === 401, `Expected status 401 for bad password, got ${res.status}`);
        assert(res.data.error, 'Expected error message in response');
      }
    },
    {
      name: 'Negative: Access reports fails without Authorization header',
      fn: async () => {
        const res = await request('GET', '/api/reports');
        assert(res.status === 401, `Expected status 401, got ${res.status}`);
        assert(res.data.error, 'Expected unauthorized error message');
      }
    },
    {
      name: 'Negative: User role cannot access Admin-only logs',
      fn: async (ctx) => {
        assert(ctx.userToken, 'Pre-requisite: userToken is required');
        const res = await request('GET', '/api/admin/logs', { Authorization: `Bearer ${ctx.userToken}` });
        assert(res.status === 403, `Expected status 403 (Forbidden) for user accessing admin logs, got ${res.status}`);
      }
    },
    {
      name: 'Negative: User role cannot update rates settings',
      fn: async (ctx) => {
        assert(ctx.userToken, 'Pre-requisite: userToken is required');
        const res = await request('POST', '/api/rates', { Authorization: `Bearer ${ctx.userToken}` }, { print_bw: 2.0 });
        assert(res.status === 403, `Expected status 403, got ${res.status}`);
      }
    },

    // ==========================================
    // EDGE TEST CASES
    // ==========================================
    {
      name: 'Edge: Access reports details with a non-existent report ID',
      fn: async (ctx) => {
        assert(ctx.adminToken, 'Pre-requisite: adminToken is required');
        const res = await request('GET', '/api/reports/99999/details', { Authorization: `Bearer ${ctx.adminToken}` });
        // Non-existent ID should return empty array gracefully instead of throwing 500 error
        assert(res.status === 200, `Expected status 200 (graceful empty return), got ${res.status}`);
        assert(Array.isArray(res.data) && res.data.length === 0, 'Expected empty array for non-existent report details');
      }
    },
    {
      name: 'Edge: Uploading without file returns 400 Bad Request',
      fn: async (ctx) => {
        assert(ctx.adminToken, 'Pre-requisite: adminToken is required');
        // Sending a POST request to upload without multipart data
        const res = await request('POST', '/api/upload', { Authorization: `Bearer ${ctx.adminToken}` }, {});
        assert(res.status === 400, `Expected status 400 for empty upload, got ${res.status}`);
      }
    },
    {
      name: 'Edge: Send malformed JWT token structure',
      fn: async () => {
        const res = await request('GET', '/api/reports', { Authorization: 'Bearer thisisnotavalidjwttoken' });
        assert(res.status === 401, `Expected status 401 for malformed JWT, got ${res.status}`);
        assert(res.data.error, 'Expected validation error');
      }
    },

    // ==========================================
    // INVENTORY AND TREND TEST CASES
    // ==========================================
    {
      name: 'Positive: Create new printer in inventory (Admin)',
      fn: async (ctx) => {
        assert(ctx.adminToken, 'Pre-requisite: adminToken is required');
        const printerData = {
          printer_name: 'TEST_PRINTER_XYZ',
          serial_number: 'SN-TEST-12345',
          location: 'Test Location A'
        };
        const res = await request('POST', '/api/inventory/printers', { Authorization: `Bearer ${ctx.adminToken}` }, printerData);
        assert(res.status === 201, `Expected status 201, got ${res.status}`);
        assert(res.data.message === 'เพิ่มเครื่องพิมพ์เข้าคลังสำเร็จ', `Expected success message, got ${res.data.message}`);
      }
    },
    {
      name: 'Positive: Get list of inventory printers',
      fn: async (ctx) => {
        assert(ctx.adminToken, 'Pre-requisite: adminToken is required');
        const res = await request('GET', '/api/inventory/printers', { Authorization: `Bearer ${ctx.adminToken}` });
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(Array.isArray(res.data), 'Expected array of printers');
        const testPrinter = res.data.find(p => p.printer_name === 'TEST_PRINTER_XYZ');
        assert(testPrinter, 'Expected to find the created test printer');
        ctx.testPrinterId = testPrinter.id;
      }
    },
    {
      name: 'Positive: Update inventory printer details (Admin)',
      fn: async (ctx) => {
        assert(ctx.adminToken, 'Pre-requisite: adminToken is required');
        assert(ctx.testPrinterId, 'Pre-requisite: testPrinterId is required');
        const updateData = {
          printer_name: 'TEST_PRINTER_XYZ_UPDATED',
          serial_number: 'SN-TEST-99999',
          location: 'Test Location B'
        };
        const res = await request('PUT', `/api/inventory/printers/${ctx.testPrinterId}`, { Authorization: `Bearer ${ctx.adminToken}` }, updateData);
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
      }
    },
    {
      name: 'Negative: Normal user cannot modify printer inventory',
      fn: async (ctx) => {
        assert(ctx.userToken, 'Pre-requisite: userToken is required');
        assert(ctx.testPrinterId, 'Pre-requisite: testPrinterId is required');
        const updateData = {
          printer_name: 'TEST_PRINTER_HACK',
          serial_number: 'SN-TEST-HACK',
          location: 'Hack'
        };
        const res = await request('PUT', `/api/inventory/printers/${ctx.testPrinterId}`, { Authorization: `Bearer ${ctx.userToken}` }, updateData);
        assert(res.status === 403, `Expected status 403 (Forbidden) for user role, got ${res.status}`);
      }
    },
    {
      name: 'Positive: Fetch categories trend grouping',
      fn: async (ctx) => {
        assert(ctx.adminToken, 'Pre-requisite: adminToken is required');
        const res = await request('GET', '/api/reports/categories/trend?year=2026', { Authorization: `Bearer ${ctx.adminToken}` });
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(Array.isArray(res.data), 'Expected category trend data to be an array');
      }
    },
    {
      name: 'Positive: Delete inventory printer (Admin)',
      fn: async (ctx) => {
        assert(ctx.adminToken, 'Pre-requisite: adminToken is required');
        assert(ctx.testPrinterId, 'Pre-requisite: testPrinterId is required');
        const res = await request('DELETE', `/api/inventory/printers/${ctx.testPrinterId}`, { Authorization: `Bearer ${ctx.adminToken}` });
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
      }
    }
  ];

  const context = {};

  for (const tc of testCases) {
    try {
      await tc.fn(context);
      console.log(`[PASS] ${tc.name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${tc.name}`);
      console.error(`       Reason: ${err.message || err}\n`);
      if (err.stack && !err.message) {
        console.error(`       Stack: ${err.stack}\n`);
      }
      failed++;
    }
  }

  console.log('\n=== TEST RUN SUMMARY ===');
  console.log(`Total tests: ${testCases.length}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);

  if (failed > 0) {
    console.error('\nResult: Some tests failed. Please inspect the logs.');
    process.exit(1);
  } else {
    console.log('\nResult: All tests passed successfully!');
    process.exit(0);
  }
}

// Add a slight delay to ensure database connection is ready, then run
setTimeout(() => {
  runTests().catch(err => {
    console.error('Unhandled test failure:', err);
    process.exit(1);
  });
}, 500);
