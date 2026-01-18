import { TouristData, Year, Month, ApiResponse, ApiProvinceData } from '../types';
import { DataProcessor } from '../utils/dataProcessor';

export class DataService {
  private static instance: DataService;
  private filteredData: TouristData[] = [];
  private apiBaseUrl: string;
  private cache: Map<string, TouristData[]> = new Map();

  private constructor() {
    // Use environment variable or default to localhost for development
    // In production, VITE_API_URL must be set in Vercel environment variables
    const envUrl = import.meta.env?.VITE_API_URL;
    if (envUrl) {
      this.apiBaseUrl = envUrl;
    } else if (import.meta.env?.DEV) {
      // Development fallback
      this.apiBaseUrl = 'http://localhost:3001';
    } else {
      // Production fallback - should not happen if env var is set
      console.warn('VITE_API_URL not set. API calls may fail.');
      this.apiBaseUrl = '/api'; // Relative path fallback
    }
  }

  /**
   * Load initial data
   */
  public static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  /**
   * Load initial data from API
   * Loads default data (2010-07) on initialization
   */
  public async loadData(): Promise<void> {
    // Load default data (2010-07)
    await this.loadDataFromAPI(10, 7);
  }

  /**
   * Load data from API
   */
  private async loadDataFromAPI(year: Year, month: Month): Promise<void> {
    const cacheKey = `${year}-${month}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      this.filteredData = this.cache.get(cacheKey)!;
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tourists?year=${year}&month=${month}`);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const apiData: ApiResponse = await response.json();
      
      // Convert API response to TouristData format
      this.filteredData = this.convertApiDataToTouristData(apiData);
      
      // Cache the data
      this.cache.set(cacheKey, this.filteredData);
      
    } catch (error) {
      console.error('Error loading data from API:', error);
      throw error;
    }
  }

  /**
   * Convert API response to TouristData format
   */
  private convertApiDataToTouristData(apiData: ApiResponse): TouristData[] {
    return apiData.provinces.map((province: ApiProvinceData): TouristData => ({
      REF_DATE: province.ref_date,
      GEO: province.geo,
      VALUE: province.value.toString(),
      'Traveller characteristics': 'Total non resident tourists',
      'Seasonal adjustment': 'Unadjusted'
    }));
  }

  /**
   * Get data for a specific year and month
   * Fetches from API if not cached
   */
  public async getMonthlyData(year: Year, month: Month): Promise<TouristData[]> {
    await this.loadDataFromAPI(year, month);
    return this.filteredData;
  }

  /**
   * Get sorted monthly data
   */
  public async getSortedMonthlyData(year: Year, month: Month): Promise<TouristData[]> {
    const monthlyData = await this.getMonthlyData(year, month);
    return DataProcessor.sortByValue(monthlyData);
  }

  /**
   * Calculate total number of visitors
   */
  public async getTotalVisitors(year: Year, month: Month): Promise<number> {
    const monthlyData = await this.getMonthlyData(year, month);
    return DataProcessor.calculateTotalVisitors(monthlyData);
  }

  /**
   * Check if data is loaded
   */
  public isDataLoaded(): boolean {
    return this.filteredData.length > 0;
  }

  /**
   * Access filtered data (read-only)
   */
  public getFilteredData(): readonly TouristData[] {
    return this.filteredData;
  }
} 