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
   * 로딩 진행률 업데이트
   */
  private updateLoadingProgress(progress: number): void {
    const loadingManager = window.loadingManager;
    if (loadingManager && typeof loadingManager.updateProgress === 'function') {
      loadingManager.updateProgress(progress);
    }
  }

  /**
   * 로딩 완료 처리
   */
  private hideLoading(): void {
    const loadingManager = window.loadingManager;
    if (loadingManager && typeof loadingManager.hide === 'function') {
      loadingManager.hide();
    }
  }

  /**
   * 대시보드 초기화
   */
  public async initialize(): Promise<void> {
    try {
      this.updateLoadingProgress(10);
      
      // 데이터 로딩
      await this.dataService.loadData();
      this.updateLoadingProgress(40);
      
      // 이벤트 리스너 설정
      this.setupEventListeners();
      this.updateLoadingProgress(60);
      
      // 차트 업데이트
      await this.updateCharts();
      this.updateLoadingProgress(90);
      
      // 정보 표시 업데이트
      this.updateInfoDisplay();
      this.updateLoadingProgress(100);
      
      // 로딩 완료
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
   * 차트 업데이트
   */
  private async updateCharts(): Promise<void> {
    try {
      const sortedData = this.dataService.getSortedMonthlyData(this.currentYear, this.currentMonth);
      const totalVisitors = this.dataService.getTotalVisitors(this.currentYear, this.currentMonth);

      // 모든 차트를 병렬로 렌더링
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
   * 정보 표시 업데이트
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
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // 연도 선택 이벤트
    const yearSelect = document.querySelector('.select') as HTMLSelectElement;
    if (yearSelect) {
      yearSelect.addEventListener('change', (event) => {
        const target = event.target as HTMLSelectElement;
        this.currentYear = parseInt(target.value);
        this.updateCharts();
        this.updateInfoDisplay();
      });
    }

    // 월 슬라이더 이벤트
    const monthSlider = document.querySelector('.slider') as HTMLInputElement;
    if (monthSlider) {
      monthSlider.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        this.currentMonth = parseInt(target.value);
        
        // 월 표시 업데이트
        const monthDisplay = document.querySelector('.monthDisplay');
        if (monthDisplay) {
          monthDisplay.textContent = MONTHS[this.currentMonth - 1];
        }

        this.updateCharts();
        this.updateInfoDisplay();
      });
    }

    // 윈도우 리사이즈 이벤트
    window.addEventListener('resize', this.debounce(() => {
      this.updateCharts();
    }, 250));
  }

  /**
   * 숫자 포맷팅
   */
  private formatNumber(value: number): string {
    return new Intl.NumberFormat().format(value);
  }

  /**
   * 디바운스 유틸리티
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
   * 에러 표시
   */
  private showError(message: string): void {
    // 에러 메시지를 표시하는 로직
    console.error(message);
    // TODO: 사용자에게 에러 메시지 표시 UI 구현
  }

  /**
   * 대시보드 정리
   */
  public destroy(): void {
    this.mapChart.destroy();
    this.barChart.destroy();
    this.pieChart.destroy();
  }
} 