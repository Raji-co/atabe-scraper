const puppeteer = require('puppeteer');

async function testScrape() {
  const browser = await puppeteer.launch({ headless: "new" });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    const pageUrl = 'https://www.facebook.com/profile.php?id=61576883665188';
    console.log("Navigating to", pageUrl);
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    const postData = await page.evaluate(() => {
      const articles = document.querySelectorAll('div[role="article"]');
      if (!articles || articles.length === 0) return { error: 'No posts found or blocked by login wall.' };

      // Let's get the top 3 posts to see if the first one is pinned
      const posts = Array.from(articles).slice(0, 3).map(post => {
        const text = post.innerText;
        const links = Array.from(post.querySelectorAll('a'));
        const timeLink = links.find(a => a.href.includes('/posts/') || a.href.includes('/permalink/'));
        return {
          text: text.substring(0, 100).replace(/\n/g, ' '),
          url: timeLink ? timeLink.href : 'URL not found'
        };
      });

      return { success: true, posts };
    });

    console.log(JSON.stringify(postData, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

testScrape();
