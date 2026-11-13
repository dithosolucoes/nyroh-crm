export interface AuditCheckItem {
  id: string;
  title: string;
  category: 'performance' | 'seo' | 'conversion' | 'security';
  status: 'pass' | 'fail' | 'warning';
  scoreImpact: number; // e.g. -15 or +20
  observedValue: string;
  recommendation: string;
  salesPitch: string;
}

export interface WebsiteAuditReport {
  leadId: string;
  leadName: string;
  analyzedUrl: string;
  hasWebsite: boolean;
  timestamp: string;
  overallScore: number; // 0 to 100
  scores: {
    performance: number; // 0 to 100
    seo: number; // 0 to 100
    conversion: number; // 0 to 100
    security: number; // 0 to 100
  };
  metrics: {
    responseTimeMs?: number;
    hasHttps: boolean;
    hasViewport: boolean;
    hasWhatsApp: boolean;
    hasTelLinks: boolean;
    h1Text?: string;
    h1Count: number;
    titleText?: string;
    titleLength: number;
    metaDescription?: string;
    hasMetaDescription: boolean;
    imagesWithoutAltCount: number;
    totalImagesCount: number;
    hasOpenGraph: boolean;
    serverHeader?: string;
    cmsDetected?: string;
  };
  checks: AuditCheckItem[];
  nyrohComparison: {
    currentScore: number;
    nyrohScore: number;
    highlights: Array<{ label: string; current: string; nyroh: string }>;
  };
}
