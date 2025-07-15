import * as d3 from 'd3';
import { DataService } from '../services/DataService';
import { MapChart } from '../components/MapChart';
import { BarChart } from '../components/BarChart';
import { PieChart } from '../components/PieChart';
import { Year, Month, LoadingManager } from '../types';
import { MONTHS } from '../constants';

export class DashboardController {
  private dataService: DataService;
  private mapChart: MapChart;
  private barChart: BarChart;
  private pieChart: PieChart;
  private currentYear: Year = 10; // 2010
  private currentMonth: Month = 7; // July

  constructor() {
    this.dataService = DataService.getInstance();
    this.mapChart = new MapChart();
    this.barChart = new BarChart();
    this.pieChart = new PieChart();
  }

  /**
   * Update loading progress
   */
  private updateLoadingProgress(progress: number): void {
    const loadingManager = window.loadingManager;
    if (loadingManager && typeof loadingManager.updateProgress === 'function') {
      loadingManager.updateProgress(progress);
    }
  }

  /**
   * Handle loading completion
   */
  private hideLoading(): void {
    const loadingManager = window.loadingManager;
    if (loadingManager && typeof loadingManager.hide === 'function') {
      loadingManager.hide();
    }
  }

  /**
   * Initialize dashboard
   */
  public async initialize(): Promise<void> {
    try {
      this.updateLoadingProgress(10);
      
      // Load data
      await this.dataService.loadData();
      this.updateLoadingProgress(40);
      
      // Setup event listeners
      this.setupEventListeners();
      this.updateLoadingProgress(60);
      
      // Update charts
      await this.updateCharts();
      this.updateLoadingProgress(90);
      
      // Update info display
      this.updateInfoDisplay();
      this.updateLoadingProgress(100);
      
      // Loading complete
      setTimeout(() => {
        this.hideLoading();
      }, 500);

    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
      this.showError('Failed to load data. Please refresh the page.');
      this.hideLoading();
    }
  }

  /**
   * Update charts
   */
  private async updateCharts(): Promise<void> {
    try {
      const sortedData = this.dataService.getSortedMonthlyData(this.currentYear, this.currentMonth);
      const totalVisitors = this.dataService.getTotalVisitors(this.currentYear, this.currentMonth);

      // Render all charts in parallel
      await Promise.all([
        this.mapChart.render(sortedData),
        this.barChart.render(sortedData),
        this.pieChart.render(sortedData, totalVisitors)
      ]);

    } catch (error) {
      console.error('Error updating charts:', error);
      this.showError('Failed to update charts.');
    }
  }

  /**
   * Update info display
   */
  private updateInfoDisplay(): void {
    const totalVisitors = this.dataService.getTotalVisitors(this.currentYear, this.currentMonth);
    const monthName = MONTHS[this.currentMonth - 1];
    const year = 2000 + this.currentYear;

    d3.selectAll('.info').remove();
    d3.select('.infoWrap')
      .append('text')
      .attr('class', 'info')
      .text(`${this.formatNumber(totalVisitors)} Tourists Have Visited Canada on ${monthName} ${year}`);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Year selection event
    const yearSelect = document.querySelector('.select') as HTMLSelectElement;
    if (yearSelect) {
      yearSelect.addEventListener('change', (event) => {
        const target = event.target as HTMLSelectElement;
        this.currentYear = parseInt(target.value);
        this.updateCharts();
        this.updateInfoDisplay();
      });
    }

    // Month slider event
    const monthSlider = document.querySelector('.slider') as HTMLInputElement;
    if (monthSlider) {
      monthSlider.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        this.currentMonth = parseInt(target.value);
        
        // Update month display
        const monthDisplay = document.querySelector('.monthDisplay');
        if (monthDisplay) {
          monthDisplay.textContent = MONTHS[this.currentMonth - 1];
        }

        this.updateCharts();
        this.updateInfoDisplay();
      });
    }

    // Window resize event
    window.addEventListener('resize', this.debounce(() => {
      this.updateCharts();
    }, 250));
  }

  /**
   * Format number
   */
  private formatNumber(value: number): string {
    return new Intl.NumberFormat().format(value);
  }

  /**
   * Debounce utility
   */
  private debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: number;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Show error
   */
  private showError(message: string): void {
    // Logic to display error message
    console.error(message);
    // TODO: Implement error message display UI
  }

  /**
   * Cleanup dashboard
   */
  public destroy(): void {
    this.mapChart.destroy();
    this.barChart.destroy();
    this.pieChart.destroy();
  }
} 