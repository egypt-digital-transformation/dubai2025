export interface IconicProject {
  id: string;
  name: string;
  subtitle: string;
  region: 'egypt' | 'amea';
  country: string;
  countryCode: string;
  coordinates: { lat: number; lng: number };
  /** Percentage-based position for rendering on the AMEA map (0–100) */
  mapPosition?: { x: number; y: number };
  heroImage: string;
  description: string;
  engineeringHighlight: string;
  stats: ProjectStats;
  products: HolcimProduct[];
  tags: string[];
  order: number;
}

export interface ProjectStats {
  co2Reduction?: string;
  concreteVolume?: string;
  certifications?: string[];
  height?: string;
  yearCompleted?: string;
  customStats?: { label: string; value: string; icon?: string }[];
}

export interface HolcimProduct {
  name: string;
  percentage?: string;
  description?: string;
  color?: string;
}
