import * as d3 from 'd3';
import { TouristData, Year, Month, ApiResponse, ApiProvinceData } from '../types';
import { DataProcessor } from '../utils/dataProcessor';

/**
 * Data source mode: 'csv' for static file, 'api' for server API
 */
type DataSourceMode = 'csv' | 'api';

export class DataService {
  private static instance: DataService;
  private rawData: TouristData[] = [];
  private filteredData: TouristData[] = [];
  private dataSourceMode: DataSourceMode;
  private apiBaseUrl: string;
  private cache: Map<string, TouristData[]> = new Map();

  private constructor() {
    // Determine data source mode from environment or default to 'csv'
    this.dataSourceMode = (import.meta.env?.VITE_DATA_SOURCE as DataSourceMode) || 'csv';
    this.apiBaseUrl = import.meta.env?.VITE_API_URL || 'http://localhost:3001';
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
   * Load initial data
   * Uses CSV or API based on dataSourceMode
   */
  public async loadData(): Promise<void> {
    if (this.dataSourceMode === 'api') {
      // API mode: Load default data (2010-07)
      await this.loadDataFromAPI(10, 7);
    } else {
      // CSV mode: Load all data from file
      try {
        this.rawData = await d3.csv<TouristData>('data/travel_province_data.csv');
        this.filteredData = DataProcessor.filterRelevantData(this.rawData);
        
        if (!DataProcessor.validateData(this.filteredData)) {
          throw new Error('Invalid data format');
        }
      } catch (error) {
        console.error('Error loading data:', error);
        throw error;
      }
    }
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
   * In API mode, fetches from API if not cached
   */
  public async getMonthlyData(year: Year, month: Month): Promise<TouristData[]> {
    if (this.dataSourceMode === 'api') {
      await this.loadDataFromAPI(year, month);
      return this.filteredData;
    } else {
      return DataProcessor.getMonthlyData(this.filteredData, year, month);
    }
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
   * Access raw data (read-only)
   */
  public getRawData(): readonly TouristData[] {
    return this.rawData;
  }

  /**
   * Access filtered data (read-only)
   */
  public getFilteredData(): readonly TouristData[] {
    return this.filteredData;
  }
} 