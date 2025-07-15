export interface TouristData {
  REF_DATE: string;
  GEO: string;
  VALUE: string;
  'Traveller characteristics': string;
  'Seasonal adjustment': string;
}

export interface CityData {
  city: string;
  lat: number;
  lng: number;
}

export interface ProvinceData {
  type: string;
  properties: {
    name: string;
    [key: string]: any;
  };
  geometry: {
    type: string;
    coordinates: number[][][];
  };
}

export interface MapData {
  type: string;
  features: ProvinceData[];
}

export interface ChartConfig {
  width: number;
  height: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface ColorScale {
  domain: number[];
  range: string[];
}

export interface ChartDimensions {
  width: number;
  height: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface LoadingManager {
  updateProgress(progress: number): void;
  hide(): void;
}

export type Year = number;
export type Month = number;

// Window 객체 확장
declare global {
  interface Window {
    loadingManager?: LoadingManager;
  }
} 