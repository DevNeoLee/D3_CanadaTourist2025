import * as d3 from 'd3';
import { DataService } from '../services/DataService';
import { MapChart } from '../components/MapChart';
import { BarChart } from '../components/BarChart';
import { PieChart } from '../components/PieChart';
import { Year, Month, LoadingManager, TouristData } from '../types';
import { MONTHS, PROVINCES, PROVINCE_ALIASES } from '../constants';
import { loadModel, whenReady, isModelReady, runChat, isOpenAIConfigured, isBlocked, REFUSAL_MESSAGE } from '../services/LLMLoader';
import { PlaneScene } from '../three/PlaneScene';

export class DashboardController {
  private dataService: DataService;
  private mapChart: MapChart;
  private barChart: BarChart;
  private pieChart: PieChart;
  private currentYear: Year = 10;
  private currentMonth: Month = 7;
  private chatMessages: { role: 'user' | 'assistant'; content: string }[] = [];
  private planeScene: PlaneScene | null = null;
  private static readonly CHAT_STORAGE_KEY = 'canada-tourist-chat';
  /** Cap chat history to avoid unbounded memory and crashes. Only last N messages kept. */
  private static readonly MAX_CHAT_MESSAGES = 50;

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

      // Three.js plane scene: mount and start (idle plane visible; map hover not wired yet)
      this.initPlaneScene();

      // Update info display
      this.updateInfoDisplay();
      this.updateLoadingProgress(100);
      
      // Loading complete: hide overlay then focus chat so caret is active on load
      setTimeout(() => {
        this.hideLoading();
        this.focusChatInput();
      }, 500);
      console.log('dataService: ', this.dataService)
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
      console.log('sortedData: ', sortedData)
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

    this.loadChatFromStorage();
    console.log('[Chat] setupChatModal: loaded from storage, message count=', this.chatMessages.length);

    const openModal = (firstQuestion: string, runLLM: boolean): HTMLElement | null => {
      overlay.classList.add('chatModalOpen');
      overlay.setAttribute('aria-hidden', 'false');
      modalMessages.innerHTML = '';
      this.chatMessages.forEach((m) => this.appendModalMessage(modalMessages, m.role, m.content));
      this.appendModalMessage(
        modalMessages,
        'assistant',
        runLLM ? '...' : 'Answer will appear here when LLM is connected.'
      );
      this.scrollModalMessagesToBottom(modalMessages);
      setTimeout(() => modalInput?.focus(), 100);
      return modalMessages;
    };

    const openModalWithHistoryOnly = (): void => {
      overlay.classList.add('chatModalOpen');
      overlay.setAttribute('aria-hidden', 'false');
      modalMessages.innerHTML = '';
      this.chatMessages.forEach((m) => this.appendModalMessage(modalMessages, m.role, m.content));
      this.scrollModalMessagesToBottom(modalMessages);
      setTimeout(() => modalInput?.focus(), 100);
    };

    const closeModal = (): void => {
      overlay.classList.remove('chatModalOpen');
      overlay.setAttribute('aria-hidden', 'true');
    };

    const sendFromMainBar = (): void => {
      const text = mainInput?.value?.trim() ?? '';
      if (!text) return;
      console.log('[Chat] User message (main bar):', text);
      this.chatMessages.push({ role: 'user', content: text });
      const blocked = isBlocked(text);
      const runLLM = isModelReady() && !blocked;
      console.log('[Chat] Blocked:', blocked, '| Model ready:', isModelReady(), '| Will run LLM:', runLLM);
      const container = openModal(text, runLLM);
      if (mainInput) mainInput.value = '';
      if (blocked && container) {
        console.log('[Chat] Showing blocklist refusal (no LLM).');
        const assistantEl = container.lastElementChild as HTMLElement | null;
        if (assistantEl) assistantEl.textContent = REFUSAL_MESSAGE;
        this.chatMessages.push({ role: 'assistant', content: REFUSAL_MESSAGE });
        this.saveChatToStorage();
        this.scrollModalMessagesToBottom(container);
      } else if (container) {
        const ruleAnswer = this.answerFromFilteredDataByRule(text);
        const dataAnswer = ruleAnswer ?? this.maybeAnswerTotalFromData(text);
        if (dataAnswer !== null) {
          console.log('[Chat] Using rule-based data answer (no LLM):', dataAnswer.slice(0, 60) + '...');
          const assistantEl = container.lastElementChild as HTMLElement | null;
          if (assistantEl) assistantEl.textContent = dataAnswer;
          this.chatMessages.push({ role: 'assistant', content: dataAnswer });
          this.saveChatToStorage();
          this.scrollModalMessagesToBottom(container);
        } else if (runLLM) {
          const assistantEl = container.lastElementChild as HTMLElement | null;
          const history = this.chatMessages.slice(0, -1);
          const isCasual = this.isLikelyCasualOnly(text);
          const dataContext = isCasual ? undefined : this.buildDataContextForPrompt(text);
          console.log('[Chat] Calling LLM, dataContext=', !!dataContext, '| casual=', isCasual);
          runChat(text, history, dataContext, isCasual)
            .then((result) => {
              console.log('[Chat] LLM result received, length:', result?.length ?? 0, '| preview:', (result ?? '').slice(0, 80) + (result && result.length > 80 ? '...' : ''));
              this.chatMessages.push({ role: 'assistant', content: result });
              this.saveChatToStorage();
              if (assistantEl) assistantEl.textContent = result || 'No response.';
              this.scrollModalMessagesToBottom(container);
            })
            .catch((err) => {
              console.log('[Chat] LLM error:', err);
              if (assistantEl) assistantEl.textContent = 'Sorry, something went wrong.';
              this.scrollModalMessagesToBottom(container);
            });
        }
      }
    };

    const sendFromModal = (): void => {
      const text = modalInput?.value?.trim() ?? '';
      if (!text) return;
      console.log('[Chat] User message (modal):', text);
      this.chatMessages.push({ role: 'user', content: text });
      this.appendModalMessage(modalMessages, 'user', text);
      const blocked = isBlocked(text);
      const runLLM = isModelReady() && !blocked;
      console.log('[Chat] Blocked:', blocked, '| Model ready:', isModelReady(), '| Will run LLM:', runLLM);
      this.appendModalMessage(modalMessages, 'assistant', runLLM ? '...' : blocked ? REFUSAL_MESSAGE : 'Follow-up answer will appear here when LLM is connected.');
      this.scrollModalMessagesToBottom(modalMessages);
      if (modalInput) modalInput.value = '';
      if (blocked) {
        console.log('[Chat] Showing blocklist refusal (no LLM).');
        this.chatMessages.push({ role: 'assistant', content: REFUSAL_MESSAGE });
        this.saveChatToStorage();
      } else {
        const ruleAnswer = this.answerFromFilteredDataByRule(text);
        const dataAnswer = ruleAnswer ?? this.maybeAnswerTotalFromData(text);
        if (dataAnswer !== null) {
          console.log('[Chat] Using rule-based data answer (no LLM):', dataAnswer.slice(0, 60) + '...');
          const assistantEl = modalMessages.lastElementChild as HTMLElement | null;
          if (assistantEl) assistantEl.textContent = dataAnswer;
          this.chatMessages.push({ role: 'assistant', content: dataAnswer });
          this.saveChatToStorage();
          this.scrollModalMessagesToBottom(modalMessages);
        } else if (runLLM) {
          const assistantEl = modalMessages.lastElementChild as HTMLElement | null;
          const history = this.chatMessages.slice(0, -1);
          const isCasual = this.isLikelyCasualOnly(text);
          const dataContext = isCasual ? undefined : this.buildDataContextForPrompt(text);
          console.log('[Chat] Calling LLM, dataContext=', !!dataContext, '| casual=', isCasual);
          runChat(text, history, dataContext, isCasual)
            .then((result) => {
              console.log('[Chat] LLM result received, length:', result?.length ?? 0, '| preview:', (result ?? '').slice(0, 80) + (result && result.length > 80 ? '...' : ''));
              this.chatMessages.push({ role: 'assistant', content: result });
              this.saveChatToStorage();
              if (assistantEl) assistantEl.textContent = result || 'No response.';
              this.scrollModalMessagesToBottom(modalMessages);
            })
            .catch((err) => {
              console.log('[Chat] LLM error:', err);
              if (assistantEl) assistantEl.textContent = 'Sorry, something went wrong.';
              this.scrollModalMessagesToBottom(modalMessages);
            });
        }
      }
    };

    const clearChat = (): void => {
      this.chatMessages = [];
      this.saveChatToStorage();
      modalMessages.innerHTML = '';
    };

    const modalClear = document.querySelector('.chatModalClear');
    modalClear?.addEventListener('click', clearChat);

    const plusButton = document.querySelector('.aiBarLeft');
    plusButton?.addEventListener('click', () => {
      if (this.chatMessages.length > 0) openModalWithHistoryOnly();
    });

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

  /**
   * Parse user prompt for year, month, and province using only filteredData semantics.
   * REF_DATE: first 4 chars = year (e.g. "2010"), 6th and 7th chars = month (e.g. "07").
   * Province: match PROVINCE_ALIASES (abbreviations, misspellings) then full PROVINCES names (longest first).
   */
  private parsePromptForDataQuery(prompt: string): { year?: number; month?: number; province?: string } | null {
    const q = prompt.trim().toLowerCase();
    let year: number | undefined;
    let month: number | undefined;
    let province: string | undefined;

    const yearMatch = q.match(/\b(200\d|201\d)\b/);
    if (yearMatch) year = parseInt(yearMatch[1], 10);

    const monthNamesShort = MONTHS.map((m) => m.toLowerCase());
    const monthNamesFull = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    for (let i = 0; i < 12; i++) {
      if (q.includes(monthNamesShort[i]) || q.includes(monthNamesFull[i])) {
        month = i + 1;
        break;
      }
    }
    if (month === undefined) {
      const numMonth = q.match(/\b(1[0-2]|[1-9])\b/);
      if (numMonth) month = parseInt(numMonth[1], 10);
    }

    const aliasEntries = Object.entries(PROVINCE_ALIASES).sort((a, b) => b[0].length - a[0].length);
    for (const [alias, canonical] of aliasEntries) {
      const match = alias.length <= 3
        ? new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(q)
        : q.includes(alias);
      if (match) {
        province = canonical;
        break;
      }
    }
    if (province === undefined) {
      const provincesByLength = [...PROVINCES].sort((a, b) => b.length - a.length);
      for (const p of provincesByLength) {
        if (q.includes(p.toLowerCase())) {
          province = p;
          break;
        }
      }
    }

    if (year === undefined && month === undefined && province === undefined) return null;
    return { year, month, province };
  }

  /**
   * Answer from filteredData only: match REF_DATE (first 4 = year, 6th 7th = month) and GEO when province given; return VALUE.
   * Supports year+month, or year-only (all 12 months summed). Runs before LLM so we give a correct numeric answer.
   */
  private answerFromFilteredDataByRule(prompt: string): string | null {
    if (!this.dataService.isDataLoaded()) return null;
    const parsed = this.parsePromptForDataQuery(prompt);
    if (!parsed) return null;
    const { year, month, province } = parsed;
    if (year === undefined || year < 2010 || year > 2019) return null;

    const filteredData = this.dataService.getFilteredData() as readonly TouristData[];
    const yearStr = String(year);

    if (month != null && month >= 1 && month <= 12) {
      const monthStr = String(month).padStart(2, '0');
      const rows = (filteredData as TouristData[]).filter((row) => {
        const refYear = row.REF_DATE.slice(0, 4);
        const refMonth = row.REF_DATE.length >= 7 ? row.REF_DATE.slice(5, 7) : '';
        if (refYear !== yearStr || refMonth !== monthStr) return false;
        if (province && row.GEO !== province) return false;
        return true;
      });
      if (rows.length === 0) {
        console.log('[Chat] answerFromFilteredDataByRule: no matching rows for', yearStr, monthStr, province ?? 'total');
        return null;
      }
      const monthName = MONTHS[month - 1];
      if (province) {
        if (rows.length > 1) return null;
        const value = parseInt(rows[0].VALUE, 10);
        const answer = `In ${monthName} ${year} there were ${this.formatNumber(value)} tourists in ${province}.`;
        console.log('[Chat] answerFromFilteredDataByRule: matched province', province, '->', answer.slice(0, 60) + '...');
        return answer;
      }
      const total = rows.reduce((sum, row) => sum + parseInt(row.VALUE, 10), 0);
      const answer = `In ${monthName} ${year} there were ${this.formatNumber(total)} tourists in Canada.`;
      console.log('[Chat] answerFromFilteredDataByRule: matched total for', monthName, year, '->', answer.slice(0, 60) + '...');
      return answer;
    }

    /* Year-only: sum all 12 months for that year (and optional province). */
    const rows = (filteredData as TouristData[]).filter((row) => {
      if (row.REF_DATE.slice(0, 4) !== yearStr) return false;
      if (province && row.GEO !== province) return false;
      return true;
    });
    if (rows.length === 0) {
      console.log('[Chat] answerFromFilteredDataByRule: no rows for year', yearStr, province ?? '');
      return null;
    }
    const yearTotal = rows.reduce((sum, row) => sum + parseInt(row.VALUE, 10), 0);
    const scope = province ? province : 'Canada';
    const answer = `In ${year} there were ${this.formatNumber(yearTotal)} tourists in ${scope} (all months combined).`;
    console.log('[Chat] answerFromFilteredDataByRule: matched year-only', year, '->', answer.slice(0, 60) + '...');
    return answer;
  }

  /**
   * True when the message looks like casual chat only (greetings, thanks, bye) so we skip the big dataset block and let the LLM reply naturally.
   */
  /**
   * True when the message is only casual chat (greetings, thanks, bye) so we skip the dataset block and let the LLM reply naturally.
   * Any data-related hint (year, province, numbers, compare, etc.) forces dataContext to be sent so Groq uses our filtered data.
   */
  private isLikelyCasualOnly(text: string): boolean {
    const t = text.trim().toLowerCase();
    if (t.length > 50) return false;
    const casual = /^(hi|hello|hey|thanks|thank you|bye|goodbye|how are you|what'?s up|yo|sup)\s*[?!.]?$/i;
    if (casual.test(t)) return true;
    const dataRelated =
      /\d{4}|tourist|visitor|province|ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|pei|prince edward|yukon|nwt|nunavut/i;
    const dataRelatedShort = /\b(bc|ab|on|qc|mb|sk|ns|nb|nl|pe)\b|how many|total|canada|number|compare|which|highest|lowest|month|year|july|august|january|february|march|april|may|june|september|october|november|december/i;
    if (dataRelated.test(t) || dataRelatedShort.test(t)) return false;
    if (t.length <= 20) return true;
    return false;
  }

  /**
   * Build LLM context from the mapped dataset only (same data the charts use).
   * Uses only getSortedMonthlyData / getTotalVisitors — never raw CSV. Includes schema description so the LLM knows it only has this mapped set.
   */
  private buildDataContext(): string {
    return this.buildDataContextForPeriod(2000 + this.currentYear, this.currentMonth);
  }

  /**
   * Build data context for a specific calendar year and month (1-12).
   * So Groq receives the exact filtered slice the user is asking about, not only the current page view.
   */
  private buildDataContextForPeriod(calendarYear: number, month: number): string {
    if (!this.dataService.isDataLoaded()) {
      console.log('[Chat] buildDataContextForPeriod: data not loaded, returning fallback.');
      return 'Data not loaded.';
    }
    const internalYear = calendarYear - 2000;
    if (internalYear < 0 || internalYear > 19 || month < 1 || month > 12) {
      console.log('[Chat] buildDataContextForPeriod: out of range', calendarYear, month, '-> using current view.');
      return this.buildDataContextForPeriod(2000 + this.currentYear, this.currentMonth);
    }
    const sorted = this.dataService.getSortedMonthlyData(internalYear as Year, month as Month);
    const total = this.dataService.getTotalVisitors(internalYear as Year, month as Month);
    const monthName = MONTHS[month - 1];
    const totalStr = this.formatNumber(total);
    const lines: string[] = [
      this.dataService.getMappedDatasetDescription(),
      '---',
      `Dataset slice (use only these numbers): ${monthName} ${calendarYear}.`,
      `Total visitors: ${totalStr}.`,
      `For "how many tourists" or "total" for this period, use: In ${monthName} ${calendarYear} there were ${totalStr} tourists in Canada.`,
      'By province (descending):'
    ];
    sorted.forEach((row) => {
      lines.push(`  ${row.GEO}: ${this.formatNumber(parseInt(row.VALUE, 10))}`);
    });
    const context = lines.join('\n');
    console.log('[Chat] buildDataContextForPeriod:', monthName, calendarYear, '| total=', totalStr, '| provinces=', sorted.length, '| context length=', context.length);
    return context;
  }

  /**
   * Build data context for the full calendar year (all 12 months summed). Used when user asks e.g. "how many in 2011" without a month.
   */
  private buildDataContextForYear(calendarYear: number): string {
    if (!this.dataService.isDataLoaded()) return 'Data not loaded.';
    const internalYear = calendarYear - 2000;
    if (internalYear < 0 || internalYear > 19) return this.buildDataContext();
    let yearTotal = 0;
    const byMonth: string[] = [];
    for (let m = 1; m <= 12; m++) {
      const total = this.dataService.getTotalVisitors(internalYear as Year, m as Month);
      yearTotal += total;
      byMonth.push(`  ${MONTHS[m - 1]}: ${this.formatNumber(total)}`);
    }
    const lines: string[] = [
      this.dataService.getMappedDatasetDescription(),
      '---',
      `Dataset slice: full year ${calendarYear} (all months).`,
      `Total visitors in ${calendarYear}: ${this.formatNumber(yearTotal)}.`,
      `For "how many visited in ${calendarYear}" or "total for ${calendarYear}", use: In ${calendarYear} there were ${this.formatNumber(yearTotal)} tourists in Canada (all months combined).`,
      'By month:',
      ...byMonth
    ];
    return lines.join('\n');
  }

  /**
   * Build data context for the LLM based on what the user asked: year+month -> that month; year-only -> full year; else current view.
   */
  private buildDataContextForPrompt(prompt: string): string {
    const parsed = this.parsePromptForDataQuery(prompt);
    if (parsed?.year == null || parsed.year < 2010 || parsed.year > 2019) return this.buildDataContext();
    if (parsed.month != null && parsed.month >= 1 && parsed.month <= 12) {
      return this.buildDataContextForPeriod(parsed.year, parsed.month);
    }
    return this.buildDataContextForYear(parsed.year);
  }

  /**
   * One-line factual answer for "how many tourists" for the current view (no LLM).
   * Used so the user always sees the correct number and we avoid generic/repeated model answers.
   */
  private getTotalTouristsAnswerLine(): string {
    if (!this.dataService.isDataLoaded()) return '';
    const total = this.dataService.getTotalVisitors(this.currentYear, this.currentMonth);
    const year = 2000 + this.currentYear;
    const monthName = MONTHS[this.currentMonth - 1];
    return `In ${monthName} ${year} there were ${this.formatNumber(total)} tourists in Canada.`;
  }

  /**
   * True if the question is asking for total/count of tourists (so we can answer from data directly).
   */
  private isTotalTouristsQuestion(question: string): boolean {
    const q = question.trim().toLowerCase();
    return (
      /how\s+many\s+(tourists?|visitors?)/.test(q) ||
      /(total|number\s+of)\s+(tourists?|visitors?)/.test(q) ||
      /(tourists?|visitors?)\s+(total|count)/.test(q)
    );
  }

  /**
   * If the question is a simple "how many tourists" for the current view, use data-only answer to avoid repetition.
   * Only uses data when the question doesn't specify a different year/month, or when it matches the current view.
   * Returns the answer string, or null if the LLM should answer.
   */
  private maybeAnswerTotalFromData(question: string): string | null {
    const isTotal = this.isTotalTouristsQuestion(question);
    console.log('[Chat] maybeAnswerTotalFromData: question=', question.slice(0, 50) + (question.length > 50 ? '...' : ''), '| isTotalQuestion=', isTotal);
    if (!isTotal) return null;
    const q = question.trim().toLowerCase();
    const currentYear = 2000 + this.currentYear;
    const currentMonthName = MONTHS[this.currentMonth - 1].toLowerCase();
    // If question mentions a year (e.g. 2010, 2005), use data only if it matches current view.
    const yearMatch = q.match(/\b(200\d|201\d)\b/);
    if (yearMatch && parseInt(yearMatch[1], 10) !== currentYear) {
      console.log('[Chat] maybeAnswerTotalFromData: year mismatch (asked', yearMatch[1], 'vs view', currentYear + ') -> LLM will answer');
      return null;
    }
    // If question mentions a month by name, use data only if it matches current view.
    const monthNames = MONTHS.map((m) => m.toLowerCase());
    const mentionedMonth = monthNames.find((m) => q.includes(m));
    if (mentionedMonth && mentionedMonth !== currentMonthName) {
      console.log('[Chat] maybeAnswerTotalFromData: month mismatch (asked', mentionedMonth, 'vs view', currentMonthName + ') -> LLM will answer');
      return null;
    }
    const line = this.getTotalTouristsAnswerLine();
    console.log('[Chat] maybeAnswerTotalFromData: using rule-based total line (period matches view)');
    return line || null;
  }

  /**
   * Trim chat history to last MAX_CHAT_MESSAGES so memory and storage stay bounded.
   */
  private trimChatHistory(): void {
    if (this.chatMessages.length <= DashboardController.MAX_CHAT_MESSAGES) return;
    this.chatMessages = this.chatMessages.slice(-DashboardController.MAX_CHAT_MESSAGES);
    console.log('[Chat] trimChatHistory: trimmed to last', DashboardController.MAX_CHAT_MESSAGES, 'messages');
  }

  private loadChatFromStorage(): void {
    try {
      const raw = localStorage.getItem(DashboardController.CHAT_STORAGE_KEY);
      if (!raw) {
        console.log('[Chat] loadChatFromStorage: no stored chat');
        return;
      }
      const parsed = JSON.parse(raw) as { role: string; content: string }[];
      if (Array.isArray(parsed) && parsed.every((m) => m && typeof m.role === 'string' && typeof m.content === 'string')) {
        this.chatMessages = parsed;
        this.trimChatHistory();
        console.log('[Chat] loadChatFromStorage: restored', this.chatMessages.length, 'messages');
      }
    } catch {
      /* ignore */
    }
  }

  private saveChatToStorage(): void {
    try {
      this.trimChatHistory();
      localStorage.setItem(DashboardController.CHAT_STORAGE_KEY, JSON.stringify(this.chatMessages));
    } catch {
      /* ignore */
    }
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
    if (isOpenAIConfigured()) {
      console.log('[Chat] setupLLMLoading: remote API configured, chat input enabled. Preloading local model for offline fallback.');
      setDisabled(false);
      loadModel().then(() => console.log('[Chat] setupLLMLoading: local model preloaded for offline use.')).catch(() => {});
      return;
    }
    console.log('[Chat] setupLLMLoading: loading local model...');
    loadModel();
    whenReady()
      .then(() => {
        console.log('[Chat] setupLLMLoading: model ready, chat input enabled.');
        setDisabled(false);
      })
      .catch(() => {
        console.log('[Chat] setupLLMLoading: model failed to load, chat input enabled anyway.');
        setDisabled(false);
      });
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
   * Initialize Three.js plane scene and mount to #threeCanvasContainer.
   */
  private initPlaneScene(): void {
    const container = document.getElementById('threeCanvasContainer');
    if (!container) return;
    this.planeScene = new PlaneScene({ width: container.clientWidth || 400, height: container.clientHeight || 300 });
    this.planeScene.mount(container);
    this.planeScene.start();
  }

  public destroy(): void {
    if (this.planeScene) {
      this.planeScene.dispose();
      this.planeScene = null;
    }
    this.mapChart.destroy();
    this.barChart.destroy();
    this.pieChart.destroy();
  }
} 