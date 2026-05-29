require('dotenv').config();
const cron = require('node-cron');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Warning: Supabase credentials not found in environment variables. Running in local-only mode.");
}

const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket }
}) : null;

async function scrapeFacebookPage(pageUrl) {
  console.log(`\n[${new Date().toISOString()}] 🚀 Starting Puppeteer to scrape: ${pageUrl}`);
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-notifications']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    const postData = await page.evaluate(() => {
      const articles = document.querySelectorAll('div[role="article"]');
      if (!articles || articles.length === 0) return { error: 'No posts found or blocked by login wall.' };

      const firstPost = articles[0];
      const text = firstPost.innerText;
      const links = Array.from(firstPost.querySelectorAll('a'));
      const timeLink = links.find(a => a.href.includes('/posts/') || a.href.includes('/permalink/'));
      
      return {
        success: true,
        text: text.substring(0, 1500),
        postUrl: timeLink ? timeLink.href : 'URL not found'
      };
    });

    if (postData.error) {
      console.log(`❌ Error: ${postData.error}`);
    } else {
      console.log(`✅ Extracted Text: ${postData.text.substring(0, 50)}...`);
      console.log(`🔗 Post URL: ${postData.postUrl}`);
      
      // TODO: Connect with OpenAI to analyze the text and extract area + status
      
      // Example of saving to Supabase if connected
      if (supabase) {
        // await supabase.from('service_announcements').insert({...});
        console.log("✅ Data ready to be sent to Supabase.");
      }
    }
  } catch (error) {
    console.error(`💥 Puppeteer Error:`, error.message);
  } finally {
    console.log(`🛑 Closing browser...`);
    await browser.close();
  }
}

// Target Pages
const targetPages = [
  'https://www.facebook.com/atallmagazine',
  // Add other cities/water authorities here
];

// Run immediately on startup
targetPages.forEach(page => scrapeFacebookPage(page));

// Schedule to run every 10 minutes
cron.schedule('*/10 * * * *', () => {
  console.log("⏱️ Running scheduled cron job...");
  targetPages.forEach(page => scrapeFacebookPage(page));
});

console.log("🟢 Coolify Scraper Service is running and listening for schedules...");
