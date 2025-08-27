/**
 * Browser UI Tests for IP addressing generator
 * Tests the web interface functionality
 */

async function testWebInterface() {
    console.log('🌐 Testing Web Interface...\n');
    
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

    try {
        // Note: This would require running browser automation
        // For now, we'll test the server is responding and serving static files
        const http = require('http');
        
        // Test static file serving
        const staticTest = await new Promise((resolve) => {
            const req = http.request({
                hostname: 'localhost',
                port: 3000,
                path: '/index.html',
                method: 'GET'
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body }));
            });
            req.on('error', () => resolve({ status: 500, body: '' }));
            req.end();
        });

        assert(staticTest.status === 200, 'Static HTML should be served');
        assert(staticTest.body.includes('Generator Adresacji IP') || staticTest.body.includes('html'), 
            'HTML content should be valid');

        // Test CSS serving
        const cssTest = await new Promise((resolve) => {
            const req = http.request({
                hostname: 'localhost',
                port: 3000,
                path: '/styles.css',
                method: 'GET'
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body }));
            });
            req.on('error', () => resolve({ status: 500, body: '' }));
            req.end();
        });

        assert(cssTest.status === 200, 'CSS should be served');
        
        console.log('\n📊 UI Test Summary:');
        console.log(`Total tests: ${testCount}`);
        console.log(`Passed: ${passedTests}`);
        console.log(`Failed: ${failedTests}`);
        
        return failedTests === 0;
        
    } catch (error) {
        console.error('UI test failed:', error.message);
        return false;
    }
}

module.exports = { testWebInterface };

// Run if called directly
if (require.main === module) {
    testWebInterface().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(err => {
        console.error('Test execution failed:', err);
        process.exit(1);
    });
}