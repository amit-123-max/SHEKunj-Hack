const puppeteer = require('puppeteer');
const path = require('path');

const EXTENSION_PATH = path.join(__dirname, 'extension');

(async () => {
  console.log('🚀 Starting NeuroRead AI E2E Demo...');

  // Launch browser with extension loaded
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`
    ]
  });

  const page = await browser.newPage();
  
  console.log('🌍 Navigating to a test page...');
  await page.goto('https://en.wikipedia.org/wiki/Neurodiversity', { waitUntil: 'networkidle2' });

  console.log('⏳ Waiting for extension scripts to inject...');
  await new Promise(r => setTimeout(r, 2000)); // Allow content scripts to boot

  console.log('🧪 Test 1: Simulating Voice Command (Agent Act)...');
  // Trigger agent assist manually
  await page.evaluate(() => {
    if (window.NR_AgentClient && window.NR_AgentClient.requestAssist) {
      window.NR_AgentClient.requestAssist("voice_command", "", "");
    } else {
      console.error("NR_AgentClient not found on page.");
    }
  });

  await new Promise(r => setTimeout(r, 2000));
  
  // Check if toast or error handled gracefully
  const hasToast = await page.evaluate(() => !!document.getElementById('nr-suggestion-toast'));
  console.log(`💬 Toast visible? ${hasToast ? 'Yes' : 'No (backend might be offline, verifying failover)'}`);

  console.log('🧪 Test 2: Triggering Universal Convert...');
  await page.evaluate(() => {
    if (window.NR_UniversalConvert) {
      window.NR_UniversalConvert.activate();
    }
  });

  await new Promise(r => setTimeout(r, 5000));
  
  // Verify gracefully failing if backend is offline
  const hasConvertCard = await page.evaluate(() => !!document.getElementById('nr-convert-result-card'));
  console.log(`✨ Convert Card visible? ${hasConvertCard ? 'Yes' : 'No'}`);

  console.log('✅ Demo complete. Closing browser in 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
