export interface SupplierProduct {
  id: string;
  name: string;
  availability: 'in_stock' | 'out_of_stock';
  price_idr: number;
  description: string;
  requires_email: boolean;
}

export type ProductCategory =
  | 'all'
  | 'streaming'
  | 'ai'
  | 'creative'
  | 'office'
  | 'security'
  | 'other';

export interface EnrichedProduct extends SupplierProduct {
  platformId: string;
  platformName: string;
  platformIcon: string;
  logoUrl: string;
  category: ProductCategory;
  sellingPrice: number;
  originalPrice: number;
  durationText: string;
  warrantyText: string;
  features: string[];
  isPopular?: boolean;
}

export interface PlatformConfig {
  id: string;
  name: string;
  icon: string;
  category: ProductCategory;
  keywords: string[];
  logoFile: string;
  defaultFeatures: string[];
  defaultWarranty: string;
}
