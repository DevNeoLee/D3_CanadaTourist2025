import { DashboardController } from './controllers/DashboardController';

class App {
  private dashboard: DashboardController;

  constructor() {
    this.dashboard = new DashboardController();
  }

  public async start(): Promise<void> {
    try {
      await this.dashboard.initialize();
    } catch (error) {
      console.error('❌ Failed to start application:', error);
      this.showErrorMessage('Failed to load the application. Please refresh the page.');
    }
  }

  private showErrorMessage(message: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #ff6b6b;
      color: white;
      padding: 20px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      z-index: 1000;
      text-align: center;
    `;
    errorDiv.innerHTML = `
      <h3>Error</h3>
      <p>${message}</p>
      <button onclick="location.reload()" style="
        background: white;
        color: #ff6b6b;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 10px;
      ">Refresh Page</button>
    `;
    document.body.appendChild(errorDiv);
  }

  public destroy(): void {
    this.dashboard.destroy();
  }
}

// Start application
const app = new App();

// Start application after DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.start());
} else {
  app.start();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  app.destroy();
});

// Allow global access in development mode
if ((import.meta as any).env?.DEV) {
  (window as any).app = app;
} 