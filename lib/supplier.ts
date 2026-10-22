// Supplier API Client for prastyaaneki.biz.id

if (!process.env.SUPPLIER_API_KEY) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

const SUPPLIER_BASE_URL =
  process.env.SUPPLIER_API_URL || 'https://api.prastyaaneki.biz.id';
const SUPPLIER_API_KEY = process.env.SUPPLIER_API_KEY || '';

export interface SupplierProduct {
  id: string;
  name: string;
  availability: 'in_stock' | 'out_of_stock';
  price_idr: number;
  description: string;
  requires_email: boolean;
}

export interface SupplierProfile {
  code: number;
  success: boolean;
  user_id: number;
  username: string;
  first_name: string;
  balance: number;
  currency: string;
  stats?: {
    total_orders: number;
    total_spent: number;
  };
  joined_at?: string;
}

export interface SupplierOrderResponse {
  code: number;
  success: boolean;
  order_id?: number | string;
  status?: string;
  delivered_key?: string;
  delivered_keys?: string[];
  message?: string;
}

/**
 * Make an authenticated HTTP request to the supplier API
 */
async function supplierRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${SUPPLIER_BASE_URL}${endpoint}`;
  const headers = {
    'x-api-key': SUPPLIER_API_KEY,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supplier API error [${response.status}] ${response.statusText}: ${errorText}`);
  }

  return (await response.json()) as T;
}

/**
 * Filter to exclude testing/sandbox products from supplier catalogue
 */
export function isTestProduct(product: { id?: string; name?: string; description?: string }): boolean {
  const id = (product.id || '').toLowerCase();
  const name = (product.name || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  return (
    id.startsWith('loc_test') ||
    id.startsWith('test_') ||
    id === 'test' ||
    /\btest(?:ing)?\b/i.test(id) ||
    /\btest\b/i.test(name) ||
    /\btesting\b/i.test(name) ||
    /\bsandbox\b/i.test(name) ||
    /\btesting developer\b/i.test(desc)
  );
}

/**
 * Fetch available products catalogue from supplier (excluding testing/sandbox products unless includeTest is true)
 */
export async function getSupplierProducts(includeTest: boolean = false): Promise<SupplierProduct[]> {
  const data = await supplierRequest<{ products: SupplierProduct[] }>('/v1/products');
  const products = data.products || [];
  if (includeTest) return products;
  return products.filter((p) => !isTestProduct(p));
}

/**
 * Fetch current user balance from supplier
 */
export async function getSupplierBalance(): Promise<{ balance: number; currency: string }> {
  return await supplierRequest<{ balance: number; currency: string }>('/v1/balance');
}

/**
 * Fetch user profile from supplier
 */
export async function getSupplierProfile(): Promise<SupplierProfile> {
  return await supplierRequest<SupplierProfile>('/v1/profile');
}

/**
 * Create order with supplier
 */
export async function createSupplierOrder(
  productId: string,
  quantity: number = 1,
  email?: string
): Promise<SupplierOrderResponse> {
  return await supplierRequest<SupplierOrderResponse>('/v1/order', {
    method: 'POST',
    body: JSON.stringify({
      product_id: productId,
      quantity,
      ...(email ? { email } : {}),
    }),
  });
}

import { EnrichedProduct, PlatformConfig, ProductCategory } from './types';
import { calculateSellingPrice, calculateOriginalPrice, getEffectiveSellingPrice } from './pricing';
import { getCustomPrices } from './custom-prices';
import { query, Product } from './db';

export const PLATFORMS: PlatformConfig[] = [
  {
    id: 'netflix',
    name: 'Netflix Premium',
    icon: '🔴',
    category: 'streaming',
    keywords: ['netflix'],
    logoFile: '/logos/netflix.png',
    defaultFeatures: ['Kualitas Ultra HD 4K & HDR', 'Anti-on hold & bebas buffering', 'Bisa di HP, Laptop, & Smart TV', 'Garansi ganti akun full durasi'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'spotify',
    name: 'Spotify Premium',
    icon: '🟢',
    category: 'streaming',
    keywords: ['spotify'],
    logoFile: '/logos/spotify.png',
    defaultFeatures: ['Bebas Iklan & Download Lagu Bebas', 'Kualitas Audio High Quality 320kbps', 'Bisa Semua Device (HP, PC, Smart TV)', 'Garansi Full Durasi'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'canva',
    name: 'Canva Pro',
    icon: '🎨',
    category: 'creative',
    keywords: ['canva'],
    logoFile: '/logos/canva.png',
    defaultFeatures: ['100+ Juta Foto & Elemen Premium', 'Background Remover 1-Klik', 'Resize Desain Bebas', 'Brand Kit & Cloud Storage Besar'],
    defaultWarranty: 'Garansi Akun Aktif',
  },
  {
    id: 'capcut',
    name: 'CapCut Pro',
    icon: '✂️',
    category: 'creative',
    keywords: ['capcut'],
    logoFile: '/logos/capcut.png',
    defaultFeatures: ['Semua Efek & Filter VIP Terbuka', 'Export 4K 60fps Tanpa Watermark', 'AI Auto-Captions & Voiceover', 'Support Android, iOS & PC Desktop'],
    defaultWarranty: 'Garansi 30 Hari Penuh',
  },
  {
    id: 'alight_motion',
    name: 'Alight Motion Pro',
    icon: '🎬',
    category: 'creative',
    keywords: ['alight motion', 'alightmotion'],
    logoFile: '/logos/alight_motion.png',
    defaultFeatures: ['Semua Preset & Efek VIP Terbuka', 'Export Video Tanpa Watermark', 'Multi-layer Grafik & Audio', 'Support Android & iOS'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'picsart',
    name: 'Picsart Gold',
    icon: '🎨',
    category: 'creative',
    keywords: ['picsart'],
    logoFile: '/logos/picsart.png',
    defaultFeatures: ['Semua Fitur VIP & Font Premium', 'Hapus Background AI & Object Remover', 'Akses Ribuan Stiker & Template', 'Garansi Akun Aktif'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'meitu',
    name: 'Meitu VIP',
    icon: '💄',
    category: 'creative',
    keywords: ['meitu'],
    logoFile: '/logos/meitu.png',
    defaultFeatures: ['Fitur AI Retouch & Beauty VIP', 'Filter Eksklusif Kualitas HD', 'Video Editing & Body Sculpting AI', 'Garansi Masa Aktif'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'wink',
    name: 'Wink VIP+',
    icon: '✨',
    category: 'creative',
    keywords: ['wink'],
    logoFile: '/logos/wink.png',
    defaultFeatures: ['AI Video Repair & Enhancement 4K', 'Portret AI & Face Retouching', 'Night View Restoration', 'Garansi Masa Aktif'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs AI',
    icon: '🎙️',
    category: 'ai',
    keywords: ['elevenlabs', 'eleven labs', 'eleven'],
    logoFile: '/logos/elevenlabs.png',
    defaultFeatures: ['Voice Cloning AI Realistis', 'Text-to-Speech Berkualitas Studio', 'Support Multi-bahasa Termasuk Indonesia', 'Akses Credit / Token Resmi'],
    defaultWarranty: 'Garansi Saldo Token',
  },
  {
    id: 'ilovepdf',
    name: 'iLovePDF Premium',
    icon: '📑',
    category: 'office',
    keywords: ['ilovepdf', 'ilove pdf'],
    logoFile: '/logos/ilovepdf.png',
    defaultFeatures: ['Kompres & Konversi PDF Tanpa Batas', 'OCR Teks Berkecepatan Tinggi', 'Edit, Gabung, & Split PDF Mudah', 'Garansi Akun Aktif'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'jetbrains',
    name: 'JetBrains All Products',
    icon: '💻',
    category: 'office',
    keywords: ['jetbrains', 'intellij', 'pycharm', 'webstorm'],
    logoFile: '/logos/jetbrains.png',
    defaultFeatures: ['Akses Semua IDE JetBrains (IntelliJ, PyCharm, dll)', 'Lisensi Resmi Developer / Edu', 'Coding Tools Kelas Industri', 'Garansi Masa Aktif'],
    defaultWarranty: 'Garansi 1 Tahun',
  },
  {
    id: 'claude',
    name: 'Claude AI Pro',
    icon: '🤖',
    category: 'ai',
    keywords: ['claude'],
    logoFile: '/logos/claude.png',
    defaultFeatures: ['Akses Claude 3.5 Sonnet / Opus', 'Batas Pesan 5x Lebih Banyak', 'Coding & Analisis Dokumen Panjang', 'Akses Fitur Terbaru Lebih Awal'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'gemini',
    name: 'Gemini AI Advanced',
    icon: '✨',
    category: 'ai',
    keywords: ['gemini'],
    logoFile: '/logos/gemini.png',
    defaultFeatures: ['Akses Model Gemini 1.5 Pro Ultra', 'Context Window 1M Token', 'Integrasi Google Workspace', 'Pemrosesan Dokumen & Video Multimodal'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'codex',
    name: 'ChatGPT / OpenAI',
    icon: '💻',
    category: 'ai',
    keywords: ['codex', 'gpt', 'chatgpt', 'openai'],
    logoFile: '/logos/codex.png',
    defaultFeatures: ['Akses GPT-4o & Canvas Mode', 'DALL-E 3 Image Generator', 'Browsing Web & Code Interpreter', 'Akses Tanpa Batas Jam Sibuk'],
    defaultWarranty: 'Garansi Akun Resmi',
  },
  {
    id: 'office',
    name: 'Microsoft 365 Office',
    icon: '📊',
    category: 'office',
    keywords: ['office', 'microsoft', 'word', 'excel'],
    logoFile: '/logos/office.png',
    defaultFeatures: ['Word, Excel, PPT, Outlook Terbaru', '1TB OneDrive Cloud Storage Aman', 'Bisa untuk 5 Perangkat Sekaligus', 'Akun Resmi & Terjamin'],
    defaultWarranty: 'Garansi 1 Tahun Penuh',
  },
  {
    id: 'prime_video',
    name: 'Prime Video',
    icon: '📺',
    category: 'streaming',
    keywords: ['prime video', 'amazon'],
    logoFile: '/logos/prime_video.png',
    defaultFeatures: ['Streaming Kualitas Full HD / 4K', 'Film & Serial Eksklusif Amazon', 'Audio jernih & multi-subtitle Indo', 'Garansi lancar tanpa kendala'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'apple_tv',
    name: 'Apple TV+',
    icon: '🍏',
    category: 'streaming',
    keywords: ['apple tv', 'apple'],
    logoFile: '/logos/apple_tv.png',
    defaultFeatures: ['Apple Originals Kualitas 4K HDR', 'Spatial Audio & Dolby Atmos', 'Streaming di iPhone, iPad, Mac, TV', 'Garansi resmi terpercaya'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'hbo',
    name: 'HBO Max',
    icon: '🍿',
    category: 'streaming',
    keywords: ['hbo'],
    logoFile: '/logos/hbo.png',
    defaultFeatures: ['Warner Bros, HBO & DC Universe', 'Kualitas 4K UHD & Audio Surround', 'Profile pribadi bebas bentrok', 'Garansi penggantian instan'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'notion',
    name: 'Notion AI & Plus',
    icon: '📓',
    category: 'ai',
    keywords: ['notion'],
    logoFile: '/logos/notion.png',
    defaultFeatures: ['Unlimited Blocks & File Uploads', 'Notion AI Writer & Summary', 'Kolaborasi Tim & Workspace Terpadu', 'Integrasi API & Database'],
    defaultWarranty: 'Garansi Penuh',
  },
  {
    id: 'adobe',
    name: 'Adobe Creative Cloud',
    icon: '🖌️',
    category: 'creative',
    keywords: ['adobe'],
    logoFile: '/logos/adobe.png',
    defaultFeatures: ['Photoshop, Illustrator, Premiere Pro', 'Adobe Fonts & Cloud Storage', 'Semua Fitur Generative Fill AI', 'Akses Resmi Tanpa Crack'],
    defaultWarranty: 'Garansi Full Masa Aktif',
  },
  {
    id: 'figma',
    name: 'Figma Professional',
    icon: '🎯',
    category: 'creative',
    keywords: ['figma'],
    logoFile: '/logos/figma.png',
    defaultFeatures: ['Unlimited Version History', 'Shared Team Libraries', 'Dev Mode & Advanced Prototyping', 'Kolaborasi real-time tanpa batas'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'scribd',
    name: 'Scribd / Everand',
    icon: '📚',
    category: 'office',
    keywords: ['scribd', 'everand'],
    logoFile: '/logos/scribd.png',
    defaultFeatures: ['Jutaan Buku, Audiobook, & Dokumen', 'Download offline baca di aplikasi', 'Akses riset & materi kuliah lengkap', 'Garansi aktif anti-logout'],
    defaultWarranty: 'Garansi Penuh',
  },
  {
    id: 'duolingo',
    name: 'Duolingo Super',
    icon: '🦉',
    category: 'office',
    keywords: ['duolingo'],
    logoFile: '/logos/duolingo.png',
    defaultFeatures: ['Nyawa Tanpa Batas (Unlimited Hearts)', 'Bebas Iklan Pengganggu', 'Praktek Kesalahan Khusus', 'Belajar Bahasa Jadi 2x Lebih Cepat'],
    defaultWarranty: 'Garansi Full Durasi',
  },
  {
    id: 'vpn',
    name: 'Premium VPN',
    icon: '🛡️',
    category: 'security',
    keywords: ['vpn', 'nord', 'expressvpn', 'hma', 'surfshark', 'avira'],
    logoFile: '/logos/vpn.png',
    defaultFeatures: ['Bypass Blokir & Enkripsi Militer', 'Ribuan Server di 100+ Negara', 'Kecepatan Tinggi Anti Lemot', 'Proteksi Privasi & Bebas Log'],
    defaultWarranty: 'Garansi Full Masa Aktif',
  },
  {
    id: 'zoom',
    name: 'Zoom Pro Meeting',
    icon: '📹',
    category: 'office',
    keywords: ['zoom'],
    logoFile: '/logos/zoom.png',
    defaultFeatures: ['Meeting Tanpa Batas Waktu 40 Menit', 'Kapasitas Hingga 100/300 Peserta', 'Cloud Recording 5GB', 'Fitur Co-host & Polling Interaktif'],
    defaultWarranty: 'Garansi Durasi Penuh',
  },
  {
    id: 'gmail',
    name: 'Google & Gmail',
    icon: '📧',
    category: 'office',
    keywords: ['gmail', 'google mail'],
    logoFile: '/logos/gmail.png',
    defaultFeatures: ['Akun Google / Gmail Baru & Bersih (PVA)', 'Bisa Ganti Password & Nomor Recovery', 'Cocok untuk Registrasi & Bisnis', 'Format Email : Password Siap Pakai'],
    defaultWarranty: 'Garansi First Login',
  },
  {
    id: 'miro',
    name: 'Miro Board',
    icon: '📋',
    category: 'office',
    keywords: ['miro'],
    logoFile: '/logos/miro.png',
    defaultFeatures: ['Unlimited Whiteboard & Kolaborasi Tim', 'Akses Template Presentasi & Diagram', 'Integrasi Tools Produktivitas', 'Garansi Masa Aktif'],
    defaultWarranty: 'Garansi Penuh',
  },
  {
    id: 'framer',
    name: 'Framer AI Pro',
    icon: '🌐',
    category: 'creative',
    keywords: ['framer'],
    logoFile: '/logos/framer.png',
    defaultFeatures: ['Website Builder AI Modern', 'Custom Domain & Unlimited CMS', 'Animasi & Interaksi Halus', 'Garansi Masa Aktif'],
    defaultWarranty: 'Garansi 1 Tahun',
  },
  {
    id: 'telegram',
    name: 'Telegram Account',
    icon: '✈️',
    category: 'security',
    keywords: ['telegram'],
    logoFile: '/logos/telegram.png',
    defaultFeatures: ['Akun Telegram Bersih & Terverifikasi', 'Siap Pakai untuk Bisnis & Bot', 'Format Session / Kredensial Aman', 'Garansi First Login'],
    defaultWarranty: 'Garansi First Login',
  },
  {
    id: 'autodesk',
    name: 'Autodesk All Apps',
    icon: '📐',
    category: 'creative',
    keywords: ['autodesk', 'autocad', '3ds max', 'maya', 'revit'],
    logoFile: '/logos/autodesk.png',
    defaultFeatures: ['AutoCAD, 3ds Max, Maya, Revit Terbaru', 'Lisensi Resmi Autodesk Cloud', 'Akses Penuh Semua Software Desain', 'Garansi 1 Tahun Penuh'],
    defaultWarranty: 'Garansi 1 Tahun',
  },
  {
    id: 'email',
    name: 'Akun Email Fresh',
    icon: '📧',
    category: 'office',
    keywords: ['outlook', 'hotmail', 'email'],
    logoFile: '/logos/office.png',
    defaultFeatures: ['Akun Baru Bersih (PVA)', 'Bisa Ganti Password & Recovery', 'Cocok untuk Registrasi & Bisnis', 'Format Langsung Email : Password'],
    defaultWarranty: 'Garansi First Login',
  },
];

export function matchProductPlatform(productName: string): PlatformConfig | null {
  const lower = productName.toLowerCase();
  for (const plat of PLATFORMS) {
    if (plat.keywords.some((k) => lower.includes(k))) {
      return plat;
    }
  }
  return null;
}

export function extractDuration(name: string, description: string): string {
  const combined = (name + ' ' + (description || '')).toLowerCase();

  if (/1\s*(?:yr|year|tahun)|12\s*(?:m|bln|bulan)|365\s*hari/.test(combined)) {
    return '1 Tahun';
  }
  if (/6\s*(?:m|bln|bulan)/.test(combined)) {
    return '6 Bulan';
  }
  if (/3\s*(?:m|bln|bulan)/.test(combined)) {
    return '3 Bulan';
  }
  if (/1\s*(?:m|bln|bulan)|30\s*(?:hari|days)/.test(combined)) {
    return '30 Hari';
  }
  if (/14\s*(?:hari|days)/.test(combined)) {
    return '14 Hari';
  }
  if (/7\s*(?:hari|days)/.test(combined)) {
    return '7 Hari';
  }
  if (/lifetime|permanen/.test(combined)) {
    return 'Permanen';
  }

  return 'Paket Spesial';
}

export function extractFeatures(description: string, fallbackFeatures: string[]): string[] {
  if (!description) return fallbackFeatures;

  const lines = description
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 5);

  const parsed: string[] = [];

  for (const line of lines) {
    if (line.startsWith('-') || line.startsWith('•') || line.startsWith('🔻') || line.startsWith('✅') || line.startsWith('⚡')) {
      const clean = line.replace(/^[-•🔻✅⚡⚠️]\s*/, '').trim();
      if (clean && clean.length > 4 && !clean.toLowerCase().includes('connect to') && !clean.toLowerCase().includes('delivery instructions')) {
        parsed.push(clean);
      }
    }
    if (parsed.length >= 4) break;
  }

  if (parsed.length >= 2) {
    return parsed;
  }

  return fallbackFeatures;
}

export function enrichProduct(
  product: SupplierProduct,
  customPricesMap?: Map<string, number>
): EnrichedProduct {
  const platform = matchProductPlatform(product.name);
  const sellingPrice = getEffectiveSellingPrice(product, customPricesMap);
  const originalPrice = calculateOriginalPrice(sellingPrice);
  const durationText = extractDuration(product.name, product.description);

  let category: ProductCategory = 'other';
  let platformName = product.name;
  let platformIcon = '💎';
  let logoUrl = '';
  let features = [
    'Garansi aktif selama masa langganan',
    'Pengiriman instan & otomatis 24/7',
    'Kredensial aman & panduan lengkap',
    'Customer service ramah siap bantu',
  ];
  let warrantyText = 'Garansi Penuh';

  if (platform) {
    category = platform.category;
    platformName = platform.name;
    platformIcon = platform.icon;
    logoUrl = platform.logoFile;
    features = extractFeatures(product.description, platform.defaultFeatures);
    warrantyText = platform.defaultWarranty;
  } else {
    const lower = product.name.toLowerCase();
    if (/\b(?:vpn|security|antivirus)\b/i.test(lower)) {
      category = 'security';
      logoUrl = '/logos/vpn.png';
    } else if (/\b(?:music|audio|stream|streaming|video)\b/i.test(lower)) {
      category = 'streaming';
      logoUrl = '';
    } else if (/\b(?:ai|bot|gpt|llm)\b/i.test(lower)) {
      category = 'ai';
      logoUrl = '';
    } else {
      category = 'other';
      logoUrl = '';
    }
  }

  const isPopular =
    product.name.toLowerCase().includes('netflix') ||
    product.name.toLowerCase().includes('spotify') ||
    product.name.toLowerCase().includes('canva') ||
    product.name.toLowerCase().includes('capcut') ||
    product.name.toLowerCase().includes('claude') ||
    product.name.toLowerCase().includes('office') ||
    product.name.toLowerCase().includes('gemini');

  return {
    ...product,
    platformId: platform ? platform.id : 'custom',
    platformName,
    platformIcon,
    logoUrl,
    category,
    sellingPrice,
    originalPrice,
    durationText,
    warrantyText,
    features,
    isPopular,
  };
}

export const FALLBACK_PRODUCTS: SupplierProduct[] = [
  {
    id: '6a2fda51035a6d898f2106fe',
    name: 'Capcut Pro 1 Month FW',
    availability: 'in_stock',
    price_idr: 25300,
    description: `- Full 30 days private Pro Team account\n- Maximum 2 devices, with full warranty\n- Stable Account full 30 days\n- Login to mobile App & desktop App`,
    requires_email: false,
  },
  {
    id: '6a2fe23a1c8697b163aedcbd',
    name: 'Microsoft Office 365 Plus 1 year',
    availability: 'in_stock',
    price_idr: 6700,
    description: `Microsoft Office 365 Plus 1 Year\n- Word, Excel, PowerPoint, Outlook\n- 1TB OneDrive Storage\n- Support 5 Devices PC/Mac`,
    requires_email: false,
  },
  {
    id: '6a5b873847b606c66fc160b2',
    name: 'Adobe Express 12M Premium',
    availability: 'in_stock',
    price_idr: 7400,
    description: `- Upgrade instantly to Premium member 12 bulan\n- Fitur lengkap Adobe Express & Fonts\n- Full garansi resmi`,
    requires_email: false,
  },
  {
    id: '6a6207cf92969197bb382958',
    name: 'iLovePdf Premium 1Yr',
    availability: 'in_stock',
    price_idr: 9600,
    description: `🔻 Full access to all iLovePDF tools\n🔻 Unlimited document processing\n🔻 Access across Web, Mobile, and Desktop\n🔻 2000 AI Credits`,
    requires_email: false,
  },
  {
    id: '6a612473af18a2a83bc049a0',
    name: 'Gmails Accounts Fresh PVA',
    availability: 'in_stock',
    price_idr: 13100,
    description: `Fresh Gmail account format email | password. Siap pakai untuk pendaftaran dan verifikasi.`,
    requires_email: false,
  },
];

export function enrichManualProduct(product: Product): EnrichedProduct {
  const platform = matchProductPlatform(product.name);
  return {
    id: product.id,
    name: product.name,
    availability: (product.stock ?? 0) > 0 ? 'in_stock' : 'out_of_stock',
    price_idr: product.price,
    description: product.description || '',
    requires_email: Boolean(product.requires_email),
    platformId: platform ? platform.id : 'manual',
    platformName: platform ? platform.name : 'Produk Khusus',
    platformIcon: platform ? platform.icon : '✨',
    logoUrl: platform?.logoFile || '',
    category: (platform ? platform.category : 'other') as ProductCategory,
    sellingPrice: product.price,
    originalPrice: Math.round(product.price * 1.25),
    durationText: 'Produk Manual',
    warrantyText: 'Garansi Dafung Hub',
    features: ['Kredensial dikirim via sistem Dafung Hub', 'Garansi resmi admin'],
    isPopular: false,
    is_manual: true,
    stock: product.stock,
  };
}

export async function getAllEnrichedProducts(includeTest: boolean = false): Promise<EnrichedProduct[]> {
  try {
    const [rawProducts, customPrices, manualDbResult] = await Promise.all([
      getSupplierProducts(includeTest).catch(() => FALLBACK_PRODUCTS),
      getCustomPrices().catch(() => new Map<string, number>()),
      query<Product>(
        'SELECT * FROM products WHERE is_manual = true AND is_active = true ORDER BY created_at DESC'
      ).catch(() => ({ rows: [] as Product[], rowCount: 0, command: '', oid: 0, fields: [] })),
    ]);
    const productsToEnrich = !rawProducts || rawProducts.length === 0 ? FALLBACK_PRODUCTS : rawProducts;
    const enrichedSupplier = productsToEnrich
      .filter((p) => includeTest || !isTestProduct(p))
      .map((p) => enrichProduct(p, customPrices));

    const enrichedManual = (manualDbResult?.rows || []).map(enrichManualProduct);

    return [...enrichedManual, ...enrichedSupplier];
  } catch (err) {
    console.error('[Supplier] Error fetching products for catalogue, using fallbacks:', err);
    return FALLBACK_PRODUCTS.filter((p) => includeTest || !isTestProduct(p)).map((p) => enrichProduct(p));
  }
}


