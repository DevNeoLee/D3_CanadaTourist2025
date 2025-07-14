import * as d3 from 'd3';
import { TouristData, Year, Month } from '../types';
import { DataProcessor } from '../utils/dataProcessor';

export class DataService {
  private static instance: DataService;
  private rawData: TouristData[] = [];
  private filteredData: TouristData[] = [];

  private constructor() {}

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
   */
  public async loadData(): Promise<void> {
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

  /**
   * Get data for a specific year and month
   */
  public getMonthlyData(year: Year, month: Month): TouristData[] {
    return DataProcessor.getMonthlyData(this.filteredData, year, month);
  }

  /**
   * Get sorted monthly data
   */
  public getSortedMonthlyData(year: Year, month: Month): TouristData[] {
    const monthlyData = this.getMonthlyData(year, month);
    return DataProcessor.sortByValue(monthlyData);
  }

  /**
   * Calculate total number of visitors
   */
  public getTotalVisitors(year: Year, month: Month): number {
    const monthlyData = this.getMonthlyData(year, month);
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