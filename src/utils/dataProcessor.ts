import { TouristData, Year, Month } from '../types';
import { PROVINCES } from '../constants';

export class DataProcessor {
  /**
   * Filter only relevant data from the original dataset
   */
  static filterRelevantData(data: TouristData[]): TouristData[] {
    return data.filter(item => 
      PROVINCES.includes(item.GEO as any) &&
      item['Traveller characteristics'] === "Total non resident tourists" &&
      item['Seasonal adjustment'] === "Unadjusted" &&
      item.REF_DATE[0] === '2'
    );
  }

  /**
   * Extract data for a specific year and month
   */
  static getMonthlyData(data: TouristData[], year: Year, month: Month): TouristData[] {
    const monthlyData: TouristData[] = [];
    
    for (const item of data) {
      const itemYear = parseInt(item.REF_DATE.slice(2, 4));
      const itemMonth = parseInt(item.REF_DATE.slice(5, 7));
      
      if (itemYear === year && itemMonth === month) {
        monthlyData.push(item);
      }
      
      if (monthlyData.length === 12) break;
    }
    
    return monthlyData;
  }

  /**
   * Sort data by value
   */
  static sortByValue(data: TouristData[]): TouristData[] {
    return [...data].sort((a, b) => parseInt(b.VALUE) - parseInt(a.VALUE));
  }

  /**
   * Calculate total number of visitors
   */
  static calculateTotalVisitors(data: TouristData[]): number {
    return data.reduce((total, item) => total + parseInt(item.VALUE), 0);
  }

  /**
   * Extract year (based on 2000)
   */
  static extractYear(dateString: string): Year {
    return parseInt(dateString.slice(2, 4));
  }

  /**
   * Extract month
   */
  static extractMonth(dateString: string): Month {
    return parseInt(dateString.slice(5, 7));
  }

  /**
   * Validate data
   */
  static validateData(data: TouristData[]): boolean {
    return data.every(item => 
      item.REF_DATE && 
      item.GEO && 
      item.VALUE && 
      !isNaN(parseInt(item.VALUE))
    );
  }
} 