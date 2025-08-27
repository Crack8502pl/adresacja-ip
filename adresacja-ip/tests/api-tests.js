/**
 * API Tests for IP addressing generator server
 * Tests HTTP endpoints functionality
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

let testCount = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
    testCount++;
    if (condition) {
        console.log(`✓ ${message}`);
        passedTests++;
    } else {
        console.log(`✗ ${message}`);
        failedTests++;
    }
}

function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const jsonBody = body ? JSON.parse(body) : null;
                    resolve({ status: res.statusCode, headers: res.headers, body: jsonBody });
                } catch {
                    resolve({ status: res.statusCode, headers: res.headers, body: body });
                }
            });
        });

        req.on('error', reject);
        
        if (data) {
            if (data instanceof FormData) {
                data.pipe(req);
            } else {
                req.write(JSON.stringify(data));
                req.end();
            }
        } else {
            req.end();
        }
    });
}

async function testServerEndpoints() {
    console.log('🌐 Testing Server Endpoints...\n');
    
    const baseURL = 'http://localhost:3000';
    
    try {
        // Test 1: Test main page loads
        console.log('📄 Testing main page...');
        const mainPage = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/',
            method: 'GET'
        });
        assert(mainPage.status === 200, 'Main page should load successfully');
        
        // Test 2: Test CSV upload and summary
        console.log('\n📤 Testing CSV upload and summary...');
        const testCSV = `Nazwa Obiektu;Kategoria;Nazwa;Ilość;Klasa
TestObject;cat1;Device1;2;brak
TestObject;cat1;Device2;1;lan
TestObject2;cat2;WV-U1532LA;1;lanz
TestObject3;cat3;DHCPDevice;1;lanz1`;

        fs.writeFileSync('tests/test-data/api-test.csv', testCSV, 'utf8');
        
        const form = new FormData();
        form.append('file', fs.createReadStream('tests/test-data/api-test.csv'), {
            filename: 'api-test.csv',
            contentType: 'text/csv'
        });

        const summaryResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/summary',
            method: 'POST',
            headers: form.getHeaders()
        }, form);

        assert(summaryResponse.status === 200, 'Summary endpoint should return 200');
        assert(summaryResponse.body && summaryResponse.body.summary, 'Response should contain summary');
        assert(summaryResponse.body.fileId, 'Response should contain fileId');
        assert(summaryResponse.body.summary.length === 4, 'Summary should contain 4 rows');
        
        const fileId = summaryResponse.body.fileId;
        
        // Test 3: Test generation endpoint
        console.log('\n⚙️  Testing generation endpoint...');
        const generateResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/generate',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { fileId: fileId });

        assert(generateResponse.status === 200, 'Generate endpoint should return 200');
        assert(generateResponse.body && generateResponse.body.network, 'Response should contain network');
        assert(generateResponse.body.mask, 'Response should contain mask');
        assert(generateResponse.body.rows, 'Response should contain rows');
        assert(generateResponse.body.fileName, 'Response should contain fileName');
        
        const fileName = generateResponse.body.fileName;
        
        // Test 4: Test download endpoint
        console.log('\n💾 Testing download endpoint...');
        const downloadResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: `/download/${fileName}`,
            method: 'GET'
        });

        assert(downloadResponse.status === 200, 'Download endpoint should return 200');
        assert(downloadResponse.headers['content-disposition'], 'Should have content-disposition header');
        
        // Test 5: Test error cases
        console.log('\n❌ Testing error cases...');
        
        // Test invalid file upload
        const invalidForm = new FormData();
        invalidForm.append('file', Buffer.from('invalid content'), {
            filename: 'invalid.txt',
            contentType: 'text/plain'
        });

        const invalidResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/summary',
            method: 'POST',
            headers: invalidForm.getHeaders()
        }, invalidForm);

        assert(invalidResponse.status === 400, 'Invalid file should return 400');
        
        // Test generation with invalid fileId
        const invalidGenResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/generate',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { fileId: 'nonexistent' });

        assert(invalidGenResponse.status === 400, 'Invalid fileId should return 400');
        
        // Test download of nonexistent file
        const invalidDownload = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/download/nonexistent.csv',
            method: 'GET'
        });

        assert(invalidDownload.status === 404, 'Nonexistent file should return 404');
        
    } catch (error) {
        console.error('API test failed:', error.message);
        failedTests++;
    }
    
    console.log('\n📊 API Test Summary:');
    console.log(`Total tests: ${testCount}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    
    return failedTests === 0;
}

module.exports = { testServerEndpoints };

// Run if called directly
if (require.main === module) {
    testServerEndpoints().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(err => {
        console.error('Test execution failed:', err);
        process.exit(1);
    });
}