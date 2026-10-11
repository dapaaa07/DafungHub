import fs from 'fs';
import path from 'path';

const LOGO_DIR = path.resolve(process.cwd(), 'assets/logos');
if (!fs.existsSync(LOGO_DIR)) {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
}

// Domain map for official app logos
const PLATFORM_DOMAINS: Record<string, string> = {
  netflix: 'https://netflix.com',
  canva: 'https://canva.com',
  capcut: 'https://capcut.com',
  duolingo: 'https://duolingo.com',
  claude: 'https://claude.ai',
  gemini: 'https://gemini.google.com',
  codex: 'https://openai.com',
  prime_video: 'https://primevideo.com',
  apple_tv: 'https://tv.apple.com',
  hbo: 'https://max.com',
  office: 'https://office.com',
  zoom: 'https://zoom.us',
  notion: 'https://notion.so',
  vpn: 'https://nordvpn.com',
  adobe: 'https://adobe.com',
  figma: 'https://figma.com',
  scribd: 'https://scribd.com',
};

async function downloadLogo(id: string, domain: string): Promise<boolean> {
  const dest = path.join(LOGO_DIR, `${id}.png`);

  const url = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(
    domain
  )}&size=256`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Logo] Failed downloading ${id} from ${domain}: ${res.status}`);
      return false;
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength < 500) {
      console.warn(`[Logo] Response too small for ${id}`);
      return false;
    }

    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
    console.log(`[Logo] Saved ${id}.png (${arrayBuffer.byteLength} bytes)`);
    return true;
  } catch (err) {
    console.warn(`[Logo] Error downloading ${id}:`, err);
    return false;
  }
}

async function run() {
  console.log('Downloading official platform logos...');
  for (const [id, domain] of Object.entries(PLATFORM_DOMAINS)) {
    // Keep existing high-res netflix/canva if already there
    const dest = path.join(LOGO_DIR, `${id}.png`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
      console.log(`[Logo] ${id}.png already exists.`);
      continue;
    }
    await downloadLogo(id, domain);
  }
  console.log('Finished downloading platform logos!');
}

run();
