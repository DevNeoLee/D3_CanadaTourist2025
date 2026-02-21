import * as d3 from 'd3';
import { DataService } from '../services/DataService';
import { MapChart } from '../components/MapChart';
import { BarChart } from '../components/BarChart';
import { PieChart } from '../components/PieChart';
import { Year, Month, LoadingManager } from '../types';
import { MONTHS } from '../constants';
import { loadModel, whenReady, isModelReady, runInference, isBlocked, REFUSAL_MESSAGE } from '../services/LLMLoader';

export class DashboardController {
  private dataService: DataService;
  private mapChart: MapChart;
  private barChart: BarChart;
  private pieChart: PieChart;
  private currentYear: Year = 10;
  private currentMonth: Month = 7;
  private chatMessages: { role: 'user' | 'assistant'; content: string }[] = [];

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
      this.setupThickCaret();
      this.setupChatModal();
      this.setupLLMLoading();
      this.updateLoadingProgress(60);
      
      // Update charts
      await this.updateCharts();
      this.updateLoadingProgress(90);
      
      // Update info display
      this.updateInfoDisplay();
      this.updateLoadingProgress(100);
      
      // Loading complete: hide overlay then focus chat so caret is active on load
      setTimeout(() => {
        this.hideLoading();
        this.focusChatInput();
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
   * Position the thick fake caret at the input's cursor (browsers don't support caret width in CSS)
   */
  private setupThickCaret(): void {
    const input = document.getElementById('aiAskInput') as HTMLInputElement | null;
    const fake = document.getElementById('aiCaretFake') as HTMLElement | null;
    if (!input || !fake) return;

    const mirror = document.createElement('span');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:pre;visibility:hidden;pointer-events:none;';
    document.body.appendChild(mirror);

    const sync = (): void => {
      const style = window.getComputedStyle(input);
      mirror.style.font = style.font;
      mirror.style.fontSize = style.fontSize;
      mirror.style.fontFamily = style.fontFamily;
      mirror.style.fontWeight = style.fontWeight;
      mirror.style.letterSpacing = style.letterSpacing;
      const text = (input.value || '').substring(0, input.selectionStart ?? 0);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const w = text.length === 0 ? 0 : (() => { mirror.textContent = text; return mirror.offsetWidth; })();
      fake.style.left = `${paddingLeft + w}px`;
    };

    ['input', 'focus', 'click', 'keyup'].forEach(ev => input.addEventListener(ev, sync));
    sync();
  }

  /**
   * Focus the chat input to encourage user to ask the LLM about the updated charts
   */
  private focusChatInput(): void {
    setTimeout(() => {
      const chatInput = document.getElementById('aiAskInput') as HTMLInputElement | null;
      if (chatInput) {
        chatInput.focus();
      }
    }, 0);
  }

  /**
   * Chat modal: open on first question from LLM bar; subsequent chat in modal.
   */
  private setupChatModal(): void {
    const overlay = document.getElementById('chatModalOverlay');
    const mainInput = document.getElementById('aiAskInput') as HTMLInputElement | null;
    const mainSend = document.querySelector('.aiAskSend.aiPill');
    const modalMessages = document.getElementById('chatModalMessages');
    const modalInput = document.getElementById('chatModalInput') as HTMLInputElement | null;
    const modalSend = document.querySelector('.chatModalSend');
    const modalClose = document.querySelector('.chatModalClose');

    if (!overlay || !modalMessages) return;

    const openModal = (firstQuestion: string, runLLM: boolean): HTMLElement | null => {
      overlay.classList.add('chatModalOpen');
      overlay.setAttribute('aria-hidden', 'false');
      this.appendModalMessage(modalMessages, 'user', firstQuestion);
      this.appendModalMessage(
        modalMessages,
        'assistant',
        runLLM ? '...' : 'Answer will appear here when LLM is connected.'
      );
      this.scrollModalMessagesToBottom(modalMessages);
      setTimeout(() => modalInput?.focus(), 100);
      return modalMessages;
    };

    const closeModal = (): void => {
      overlay.classList.remove('chatModalOpen');
      overlay.setAttribute('aria-hidden', 'true');
    };

    const sendFromMainBar = (): void => {
      const text = mainInput?.value?.trim() ?? '';
      if (!text) return;
      this.chatMessages.push({ role: 'user', content: text });
      const blocked = isBlocked(text);
      const runLLM = isModelReady() && !blocked;
      const container = openModal(text, runLLM);
      if (mainInput) mainInput.value = '';
      if (blocked && container) {
        const assistantEl = container.lastElementChild as HTMLElement | null;
        if (assistantEl) assistantEl.textContent = REFUSAL_MESSAGE;
        this.chatMessages.push({ role: 'assistant', content: REFUSAL_MESSAGE });
        this.scrollModalMessagesToBottom(container);
      } else if (runLLM && container) {
        const assistantEl = container.lastElementChild as HTMLElement | null;
        const history = this.chatMessages.slice(0, -1);
        runInference(text, history)
          .then((result) => {
            this.chatMessages.push({ role: 'assistant', content: result });
            if (assistantEl) assistantEl.textContent = result || 'No response.';
            this.scrollModalMessagesToBottom(container);
          })
          .catch(() => {
            if (assistantEl) assistantEl.textContent = 'Sorry, something went wrong.';
            this.scrollModalMessagesToBottom(container);
          });
      }
    };

    const sendFromModal = (): void => {
      const text = modalInput?.value?.trim() ?? '';
      if (!text) return;
      this.chatMessages.push({ role: 'user', content: text });
      this.appendModalMessage(modalMessages, 'user', text);
      const blocked = isBlocked(text);
      const runLLM = isModelReady() && !blocked;
      this.appendModalMessage(modalMessages, 'assistant', runLLM ? '...' : blocked ? REFUSAL_MESSAGE : 'Follow-up answer will appear here when LLM is connected.');
      this.scrollModalMessagesToBottom(modalMessages);
      if (modalInput) modalInput.value = '';
      if (blocked) {
        this.chatMessages.push({ role: 'assistant', content: REFUSAL_MESSAGE });
      } else if (runLLM) {
        const assistantEl = modalMessages.lastElementChild as HTMLElement | null;
        const history = this.chatMessages.slice(0, -1);
        runInference(text, history)
          .then((result) => {
            this.chatMessages.push({ role: 'assistant', content: result });
            if (assistantEl) assistantEl.textContent = result || 'No response.';
            this.scrollModalMessagesToBottom(modalMessages);
          })
          .catch(() => {
            if (assistantEl) assistantEl.textContent = 'Sorry, something went wrong.';
            this.scrollModalMessagesToBottom(modalMessages);
          });
      }
    };

    mainSend?.addEventListener('click', sendFromMainBar);
    mainInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendFromMainBar();
      }
    });

    modalSend?.addEventListener('click', sendFromModal);
    modalInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendFromModal();
      }
    });

    modalClose?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('chatModalOpen')) closeModal();
    });
  }

  private appendModalMessage(container: HTMLElement, role: 'user' | 'assistant', text: string): void {
    const div = document.createElement('div');
    div.className = `chatModalMsg ${role}`;
    div.textContent = text;
    container.appendChild(div);
  }

  private scrollModalMessagesToBottom(container: HTMLElement): void {
    container.scrollTop = container.scrollHeight;
  }

  private setupLLMLoading(): void {
    const mainInput = document.getElementById('aiAskInput') as HTMLInputElement | null;
    const mainPill = document.querySelector('.aiSummarySection .aiAskSend.aiPill') as HTMLButtonElement | null;
    if (!mainInput || !mainPill) return;

    const setDisabled = (disabled: boolean) => {
      mainInput.disabled = disabled;
      mainPill.disabled = disabled;
      if (disabled) mainPill.classList.add('llm-loading');
      else mainPill.classList.remove('llm-loading');
    };

    setDisabled(true);
    loadModel();
    whenReady().then(() => setDisabled(false)).catch(() => setDisabled(false));
  }

  private setupEventListeners(): void {
    // Year selection event
    const yearSelect = document.querySelector('.select') as HTMLSelectElement;
    if (yearSelect) {
      yearSelect.addEventListener('change', (event) => {
        const target = event.target as HTMLSelectElement;
        this.currentYear = parseInt(target.value);
        this.updateCharts();
        this.updateInfoDisplay();
        this.focusChatInput();
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
        this.focusChatInput();
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