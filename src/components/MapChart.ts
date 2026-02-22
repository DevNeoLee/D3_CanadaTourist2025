import * as d3 from 'd3';
import { TouristData, CityData, MapData, ProvinceData } from '../types';
import { BaseChart } from './BaseChart';
import { MAP_COLOR_SCALE, MAP_PROJECTION_CONFIG, CHART_DIMENSIONS } from '../constants';

/** Callback when user hovers a province: (provinceName, visitorValue, planeCount, targetScreenX, targetScreenY). */
export type OnProvinceHoverCallback = (name: string, value: number, planeCount: number, screenX: number, screenY: number) => void;

export class MapChart extends BaseChart {
  private projection: d3.GeoProjection;
  private path: d3.GeoPath<any, any>;
  private colorScale: d3.ScaleThreshold<number, string>;
  /** When set, province hover notifies the Three.js plane effect (plane count + target position). */
  private onProvinceHover: OnProvinceHoverCallback | null = null;
  /** Cached once at first render; reused on year/month change to avoid refetching. */
  private citiesCache: CityData[] | null = null;
  /** Cached once at first render; reused on year/month change to avoid refetching. */
  private mapDataCache: MapData | null = null;
  /** Single load promise so concurrent renders don't trigger duplicate fetches. */
  private staticDataLoadPromise: Promise<[CityData[], MapData]> | null = null;

  constructor() {
    super('.mapWrap', CHART_DIMENSIONS.map);
    this.projection = d3.geoMercator()
      .scale(MAP_PROJECTION_CONFIG.scale)
      .translate(MAP_PROJECTION_CONFIG.translate as [number, number]);
    
    this.path = d3.geoPath().projection(this.projection);
    this.colorScale = d3.scaleThreshold<number, string>()
      .domain(MAP_COLOR_SCALE.domain)
      .range(MAP_COLOR_SCALE.range);
  }

  /**
   * Load canadian_cities.csv and province_map.json once; subsequent calls return cached data (no refetch on year/month change).
   */
  private async getStaticData(): Promise<[CityData[], MapData]> {
    if (this.citiesCache && this.mapDataCache) {
      return [this.citiesCache, this.mapDataCache];
    }
    if (!this.staticDataLoadPromise) {
      this.staticDataLoadPromise = Promise.all([
        d3.csv<CityData>('data/canadian_cities.csv'),
        d3.json<MapData>('data/province_map.json')
      ]).then(([citiesRaw, mapData]) => {
        if (!mapData) throw new Error('Failed to load map data');
        const cities = citiesRaw as unknown as CityData[];
        return [cities, mapData];
      });
    }
    const [cities, mapData] = await this.staticDataLoadPromise;
    this.citiesCache = cities;
    this.mapDataCache = mapData;
    return [cities, mapData];
  }

  public async render(data: TouristData[]): Promise<void> {
    try {
      this.clear();
      // Only province paths receive pointer events (tooltips); rest passes through
      // this.svg.attr('class', 'map-chart-svg');

      // Add Northwest Territories data if not present
      const hasNWT = data.some(d => d.GEO === "Northwest Territories");
      const dataWithNWT = hasNWT 
        ? data 
        : [...data, { 
            REF_DATE: data[0]?.REF_DATE || '', 
            GEO: "Northwest Territories", 
            VALUE: "0",
            'Traveller characteristics': '',
            'Seasonal adjustment': ''
          }];

      const chartGroup = this.getChartGroup();
      
      // Use cached static data (fetched once per app lifecycle)
      const [cities, mapData] = await this.getStaticData();

      // Create a lookup map for tourist data by province name
      const dataMap = new Map<string, TouristData>();
      dataWithNWT.forEach(item => {
        dataMap.set(item.GEO, item);
      });

      // Log warning if any GeoJSON provinces don't have matching data
      mapData.features.forEach(feature => {
        const provinceName = (feature.properties as any).PRENAME || feature.properties.name;
        if (!dataMap.has(provinceName)) {
          console.warn(`No tourist data found for province: ${provinceName}`);
        }
      });

      // Draw map with proper data matching
      const paths = this.drawMap(chartGroup, mapData, dataMap);
      this.addMapEvents(paths);
      
      // Draw cities
      this.drawCities(chartGroup, cities);
      
      // Draw legend
      this.drawLegend();

    } catch (error) {
      console.error('Error rendering map chart:', error);
    }
  }

  /**
   * Draw map with proper province-to-data matching
   * Uses province name from GeoJSON properties to match with tourist data
   * GeoJSON uses PRENAME (English name) for province names
   */
  private drawMap(
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    mapData: MapData,
    dataMap: Map<string, TouristData>
  ): d3.Selection<SVGPathElement, { feature: ProvinceData; data: TouristData | null }, SVGGElement, unknown> {
    // Create combined data structure with both feature and tourist data
    const combinedData = mapData.features.map(feature => {
      // GeoJSON uses PRENAME for English province name, fallback to name if not available
      const provinceName = (feature.properties as any).PRENAME || feature.properties.name;
      const touristData = dataMap.get(provinceName) || null;
      return { feature, data: touristData };
    });

    // Bind data to province groups
    const provinces = chartGroup.selectAll('g.province')
      .data(combinedData, (d: { feature: ProvinceData; data: TouristData | null }) => {
        const provinceName = (d.feature.properties as any).PRENAME || d.feature.properties.name;
        return provinceName;
      })
      .enter()
      .append('g')
      .attr('class', 'province');

    // Draw map boundaries with matched data - paths inherit data from parent groups
    const paths = provinces.append('path')
      .attr('d', d => this.path(d.feature))
      .attr('class', 'path')
      .attr('fill', 'white')
      .style('fill', d => {
        if (d.data) {
          const value = parseInt(d.data.VALUE);
          return this.colorScale(value);
        }
        return '#ffffff'; // Default white for provinces without data
      })
      .style('stroke', '#000')
      .style('stroke-width', '0.5px')
      .style('cursor', 'pointer'); // Add pointer cursor for better UX

    return paths;
  }

  /** Register callback for province hover (plane effect). */
  setOnProvinceHover(cb: OnProvinceHoverCallback | null): void {
    this.onProvinceHover = cb;
  }

  /**
   * Add interactive events to map paths
   * Uses arrow functions to properly bind 'this' context
   */
  private addMapEvents(
    paths: d3.Selection<SVGPathElement, { feature: ProvinceData; data: TouristData | null }, SVGGElement, unknown>
  ): void {
    const self = this;

    paths
      .on('pointerenter', function(event: PointerEvent, d) {
        d3.select(this)
          .style('opacity', '0.7');

        if (d.data) {
          const content = self.getTooltipContent(d.data, 'Province');
          self.tooltip.show(content, event.pageX - 100, event.pageY - 120);

          // Notify Three.js plane effect: plane count + target in screen coords
          const value = parseInt(d.data.VALUE, 10);
          const planeCount = Math.max(1, Math.round(value / 1000));
          const centroid = self.path.centroid(d.feature);
          const svgEl = self.svg.node();
          if (svgEl && self.onProvinceHover) {
            const pt = svgEl.createSVGPoint();
            pt.x = self.dimensions.margin.left + centroid[0];
            pt.y = self.dimensions.margin.top + centroid[1];
            const screenCTM = svgEl.getScreenCTM();
            if (screenCTM) {
              const screenPt = pt.matrixTransform(screenCTM);
              self.onProvinceHover(d.data.GEO, value, planeCount, screenPt.x, screenPt.y);
            }
          }
        }
      })
      .on('pointerleave', function() {
        d3.select(this)
          .style('opacity', '1');
        self.tooltip.hide();
      });
  }

  private drawCities(
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    cities: CityData[]
  ): void {
    // Draw city dots
    chartGroup.selectAll('.cityDots')
      .data(cities)
      .enter()
      .append('circle')
      .attr('class', 'cityDots')
      .attr('r', 2)
      .attr('cx', (d: CityData) => {
        const coords = this.projection([d.lng, d.lat]);
        return coords ? coords[0] : 0;
      })
      .attr('cy', (d: CityData) => {
        const coords = this.projection([d.lng, d.lat]);
        return coords ? coords[1] : 0;
      });

    // Draw city name labels
    chartGroup.selectAll('.cityName')
      .data(cities)
      .enter()
      .append('text')
      .attr('class', 'cityName')
      .attr('x', (d: CityData) => {
        const coords = this.projection([d.lng, d.lat]);
        return coords ? coords[0] : 0;
      })
      .attr('y', (d: CityData) => {
        const coords = this.projection([d.lng, d.lat]);
        return coords ? coords[1] : 0;
      })
      .text((d: CityData) => d.city)
      .attr('dx', 1)
      .attr('dy', -2)
      .style('font-size', '13px');
  }

  private drawLegend(): void {
    // Legend for large screens
    const legendLarge = d3.select('.mapWrap')
      .append('svg')
      .attr('width', '130')
      .attr('height', '505')
      .attr('class', 'legend2');

    const squareSize = 25;
    
    legendLarge.selectAll('rect')
      .data(MAP_COLOR_SCALE.domain)
      .enter()
      .append('rect')
      .attr('x', 3)
      .attr('y', (d, i) => 115 + i * (squareSize + 1))
      .attr('width', squareSize)
      .attr('height', squareSize)
      .style('fill', (d) => this.colorScale(d));

    legendLarge.selectAll('text')
      .data(MAP_COLOR_SCALE.domain)
      .enter()
      .append('text')
      .attr('class', 'axisText')
      .attr('x', 32)
      .attr('y', (d, i) => 137 + i * (squareSize + 1))
      .text(d => d !== 0 ? `~ ${this.formatNumber(d)}` : d.toString());

    legendLarge.append('text')
      .attr('class', 'axisText')
      .attr('x', 5)
      .attr('y', 95)
      .text('Tourists');

    // Legend for small screens
    const legendSmall = d3.select('.mapWrap')
      .append('svg')
      .attr('width', '600')
      .attr('height', '140')
      .attr('class', 'legend1');

    legendSmall.selectAll('rect')
      .data(MAP_COLOR_SCALE.domain)
      .enter()
      .append('rect')
      .attr('x', (d, i) => i * (squareSize * 1.5 + 1) + 5)
      .attr('y', 20)
      .attr('width', squareSize * 1.5)
      .attr('height', squareSize)
      .style('fill', (d) => this.colorScale(d));

    legendSmall.selectAll('text')
      .data(MAP_COLOR_SCALE.domain)
      .enter()
      .append('text')
      .text(d => d !== 0 ? `~ ${this.formatNumber(d)}` : d.toString())
      .attr('transform', 'rotate(90)')
      .style('text-anchor', 'start')
      .attr('class', 'axisText')
      .attr('x', 47)
      .attr('y', (d, i) => -19 - i * (squareSize * 1.5 + 1));

    legendSmall.append('text')
      .attr('class', 'axisText')
      .attr('x', 5)
      .attr('y', 125)
      .text('persons');
  }
} 