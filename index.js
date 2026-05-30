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
      
      // Send to n8n webhook
      const webhookUrl = process.env.N8N_WEBHOOK_URL || "https://n8n-pvveottdwc.ramishalabi.xyz/webhook/facebook-posts";
      console.log(`🚀 Sending data to n8n webhook: ${webhookUrl}`);
      
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageUrl: pageUrl,
            postUrl: postData.postUrl,
            postId: postData.postUrl.split('fbid=')[1]?.split('&')[0] || postData.postUrl,
            postText: postData.text
          })
        });
        
        if (response.ok) {
          console.log("✅ Successfully sent post to n8n!");
        } else {
          console.log(`❌ Failed to send to n8n. Status: ${response.status}`);
        }
      } catch (err) {
        console.error("❌ Error sending to n8n webhook:", err.message);
      }
    }
  } catch (error) {
    console.error(`💥 Puppeteer Error:`, error.message);
  } finally {
    console.log(`🛑 Closing browser...`);
    await browser.close();
  }
}

// Delay helper function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Process all active scraping sources
async function processSources() {
  if (!supabase) {
    console.error("❌ No Supabase connection available. Exiting job.");
    return;
  }

  // Random delay between 0 to 30 seconds at the start of the cron job to avoid exact 10:00:00 execution
  const initialDelay = Math.floor(Math.random() * 30000);
  console.log(`⏱️ Initial cron delay: sleeping for ${Math.round(initialDelay/1000)}s to randomize execution...`);
  await sleep(initialDelay);

  console.log("🔍 Fetching active sources from Supabase...");
  const { data: sources, error } = await supabase
    .from('scraping_sources')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error("❌ Error fetching sources:", error.message);
    return;
  }

  if (!sources || sources.length === 0) {
    console.log("⚠️ No active sources found in database.");
    return;
  }

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    
    // Add random delay between each scrape (15 to 45 seconds) to evade Meta limits
    if (i > 0) {
      const waitTime = Math.floor(Math.random() * 30000) + 15000;
      console.log(`⏱️ Waiting ${Math.round(waitTime/1000)}s before next scrape to avoid rate limits...`);
      await sleep(waitTime);
    }

    if (source.platform === 'facebook') {
      await scrapeFacebookPage(source.url);
    }
  }
  console.log("✅ All sources processed for this cycle.");
}

// Run immediately on startup
processSources();

// Schedule to run every 10 minutes
cron.schedule('*/10 * * * *', () => {
  console.log("⏱️ Cron job triggered. Starting cycle...");
  processSources();
});

console.log("🟢 Coolify Scraper Service is running and listening for schedules...");
