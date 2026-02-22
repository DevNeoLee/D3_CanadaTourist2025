# Canada Tourist Visualization Dashboard

Interactive visualization of Canadian tourist data from 2000-2019 using modern D3.js and TypeScript.

## 🚀 Live Demo

**[View Live Site](https://devneolee.github.io/Canada_Tourist_Chart_d3/)**

## 🛠️ Technology Stack

- **Frontend**: TypeScript, HTML5, CSS3
- **Data Visualization**: D3.js v7
- **Build Tool**: Vite
- **Package Manager**: npm
- **Linting**: ESLint
- **Type Checking**: TypeScript
- **LLM / AI**: [transformers.js](https://huggingface.co/docs/transformers.js) (browser-side mini LLM), [Groq](https://groq.com/) API (cloud)

## 📊 Features

### Interactive Visualizations
- **Map Chart**: Geographic representation of tourist data by province
- **Bar Chart**: Comparative analysis with square-root scaling
- **Pie Chart**: Proportional distribution with interactive segments

### User Controls
- **Year Selection**: 2000-2019 range
- **Month Selection**: Interactive slider (1-12 months)
- **Real-time Updates**: All charts update simultaneously

### Data Insights
- Provincial tourist trends over 20 years
- Seasonal patterns and peak tourism periods
- Geographic distribution of visitors
- Comparative analysis between provinces

### 🤖 LLM: Local Browser Mini LLM + Groq API
- **Browser-side mini LLM** (transformers.js): LaMini-Flan-T5 runs locally in the browser for chat when offline or as a fallback. No server required; model is cached after first load.
- **Groq API**: When online, questions can be answered by Groq for richer, broader responses about the dataset and general Canada tourism context.
- **Smart routing**: Casual greetings (hi, hello, thanks) get short friendly replies; data questions (year, province, “how many visitors”) use the app’s filtered dataset so answers match the charts.
- **Offline-first**: If the network is unavailable, the app uses the local model so chat still works after the model has been downloaded once.

## 🏗️ Architecture

### Modern Code Organization
```
src/
├── components/          # Chart components
│   ├── BaseChart.ts    # Abstract base class
│   ├── MapChart.ts     # Geographic visualization
│   ├── BarChart.ts     # Bar chart implementation
│   ├── PieChart.ts     # Pie chart implementation
│   └── Tooltip.ts      # Reusable tooltip component
├── controllers/         # Application logic
│   └── DashboardController.ts
├── services/           # Data & LLM
│   ├── DataService.ts
│   ├── LLMLoader.ts    # Local model (transformers.js) + Groq routing
│   └── OpenAIClient.ts # Groq / OpenAI API client
├── types/              # TypeScript definitions
│   └── index.ts
├── utils/              # Utility functions
│   └── dataProcessor.ts
├── constants/          # Configuration constants
│   └── index.ts
└── main.ts            # Application entry point
```

### Design Patterns
- **Singleton Pattern**: DataService for centralized data management
- **Factory Pattern**: Chart component creation
- **Observer Pattern**: Event-driven updates
- **Strategy Pattern**: Different scaling methods for data visualization

## 🤖 LLM: Local Mini LLM + Groq API

The dashboard includes an AI chat that answers questions about the data and supports casual conversation. It combines a **local mini LLM** in the browser (transformers.js) with the **Groq API** to broaden answers and provide extra information about the dataset.

### How it works
- **Online**: The app uses Groq first. The current (or asked) slice of the dataset is sent as context so answers match the visualization (e.g. “How many in July 2011?” uses 2011 data).
- **Offline / fallback**: When offline or when Groq fails, the app uses a small model (LaMini-Flan-T5-248M) that runs entirely in the browser via transformers.js. The model is downloaded and cached on first use.
- **Rule-based answers**: Simple data questions (e.g. “How many tourists in 2011?” or “Ontario in July 2010”) are answered from the dataset directly when possible, without calling the LLM.

### Setup (optional)
- **Groq (recommended for best answers)**: Create an API key at [Groq](https://console.groq.com/), then add to `.env`:
  ```env
  VITE_GROQ_API_KEY=your_groq_api_key_here
  ```
- **Local-only**: If you do not set `VITE_GROQ_API_KEY`, the app will use only the browser-side mini LLM. The first chat may take a moment while the model downloads.

See `.env.example` for all optional variables (e.g. OpenAI proxy).

### Where it’s implemented
- **`src/services/LLMLoader.ts`**: Loads the local model (transformers.js), runs inference, and calls the remote API (Groq) with rules and data context; handles offline and fallback.
- **`src/services/OpenAIClient.ts`**: Sends chat requests to Groq (or OpenAI/proxy if configured).
- **`src/controllers/DashboardController.ts`**: Builds dataset context from the current or asked year/month, detects casual vs data questions, and wires the chat UI to the LLM.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm 9+

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/DevNeoLee/DataVisualization4.git
   cd DataVisualization4
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

### Build for Production

```bash
npm run build
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Type checking
npm run type-check
```

## 📁 Project Structure

```
Canada_Tourist_Chart_d3/
├── data/                    # Data files
│   ├── travel_province_data.csv  # Main tourist data (22MB)
│   ├── province_map.json         # GeoJSON map data
│   └── canadian_cities.csv       # City coordinates
├── src/                    # Source code
│   ├── components/         # Chart components
│   ├── controllers/        # Application logic
│   ├── services/          # Data services & LLM (LLMLoader, OpenAIClient)
│   ├── types/             # TypeScript types
│   ├── utils/             # Utilities
│   ├── constants/         # Constants
│   └── main.ts           # Entry point
├── stylesheets/           # CSS styles
├── image/                 # Static assets
├── public/                # Public assets
├── dist/                  # Build output
├── package.json           # Dependencies & scripts
├── tsconfig.json          # TypeScript config
├── vite.config.ts         # Vite configuration
├── .eslintrc.json         # ESLint rules
└── index.html            # Main HTML file
```

## 🎨 D3.js Implementation

### Advanced Scaling Techniques
- **Threshold Scale**: Geographic color mapping
- **Square-Root Scale**: Bar chart value distribution
- **Linear Scale**: Pie chart proportions

### Interactive Features
- **Tooltips**: Detailed information on hover
- **Animations**: Smooth transitions and loading effects
- **Responsive Design**: Adapts to different screen sizes

### Performance Optimizations
- **Lazy Loading**: Data loaded on demand
- **Debounced Updates**: Efficient event handling
- **Memory Management**: Proper cleanup and disposal

## 📈 Data Analysis

### Key Insights
1. **Most Popular Provinces**: Ontario and British Columbia consistently lead
2. **Seasonal Trends**: Summer months (July-August) show peak tourism
3. **Growth Patterns**: Steady increase in total visitors over 20 years
4. **Geographic Distribution**: Clear concentration in major urban centers

### Data Sources
- **Statistics Canada**: Official government tourism statistics
- **Time Period**: January 2000 - December 2019
- **Data Type**: Non-resident tourist arrivals by province

## 🔧 Development

### Code Quality Standards
- **TypeScript**: Strict type checking enabled
- **ESLint**: Consistent code style enforcement
- **Modular Architecture**: Separation of concerns
- **Error Handling**: Comprehensive error management

### Testing Strategy
- **Unit Tests**: Component-level testing (planned)
- **Integration Tests**: Chart interaction testing (planned)
- **Performance Testing**: Load time optimization

### Browser Support
- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+
- **Mobile**: Responsive design for tablets and phones

## 🚀 Deployment

### GitHub Pages
The application is automatically deployed to GitHub Pages from the main branch.

### Custom Deployment
```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Statistics Canada** for providing the tourism data
- **D3.js Community** for the excellent visualization library
- **Open Source Contributors** for various tools and libraries

## 📞 Contact

- **Author**: Justin K Lee
- **Website**: [https://devneolee.github.io/justinklee/](https://devneolee.github.io/justinklee/)
- **GitHub**: [https://github.com/devneolee](https://github.com/devneolee)

---

**Note**: This is a refactored version of the original project, implementing modern JavaScript/TypeScript best practices, improved architecture, enhanced user experience, and **LLM support** (local mini LLM in the browser via transformers.js plus Groq API) for answering and broadening extra information about the dataset.
