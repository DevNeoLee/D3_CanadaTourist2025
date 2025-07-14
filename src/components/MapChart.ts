import * as d3 from 'd3';
import { TouristData, CityData, MapData } from '../types';
import { BaseChart } from './BaseChart';
import { MAP_COLOR_SCALE, MAP_PROJECTION_CONFIG, CHART_DIMENSIONS } from '../constants';

export class MapChart extends BaseChart {
  private projection: d3.GeoProjection;
  private path: d3.GeoPath<any, any>;
  private colorScale: d3.ScaleThreshold<number, string>;

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

  public async render(data: TouristData[]): Promise<void> {
    try {
      this.clear();
      
      // Add Northwest Territories data (keep original logic)
      const dataWithNWT = [...data, { 
        REF_DATE: data[0]?.REF_DATE || '', 
        GEO: "Northwest Territories", 
        VALUE: "0",
        'Traveller characteristics': '',
        'Seasonal adjustment': ''
      }];

      // Sort in original order
      const dataSorted = [
        dataWithNWT[9], dataWithNWT[4], dataWithNWT[11], dataWithNWT[1], 
        dataWithNWT[7], dataWithNWT[10], dataWithNWT[6], dataWithNWT[5], 
        dataWithNWT[3], dataWithNWT[12], dataWithNWT[8], dataWithNWT[0], dataWithNWT[2]
      ];

      const chartGroup = this.getChartGroup();
      
      // Load city and map data
      const [citiesRaw, mapData] = await Promise.all([
        d3.csv<CityData>('data/canadian_cities.csv'),
        d3.json<MapData>('data/province_map.json')
      ]);

      const cities = citiesRaw as unknown as CityData[];

      if (!mapData) throw new Error('Failed to load map data');

      // Draw map
      const paths = this.drawMap(chartGroup, mapData, dataSorted);
      this.addMapEvents(paths, dataSorted);
      
      // Draw cities
      this.drawCities(chartGroup, cities);
      
      // Draw legend
      this.drawLegend();

    } catch (error) {
      console.error('Error rendering map chart:', error);
    }
  }

  private drawMap(
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    mapData: MapData,
    data: TouristData[]
  ): d3.Selection<SVGPathElement, TouristData, SVGGElement, unknown> {
    const provinces = chartGroup.selectAll('g')
      .data(mapData.features)
      .enter()
      .append('g')
      .attr('class', 'province');

    // Draw map boundaries
    const paths = provinces.append('path')
      .attr('d', this.path)
      .attr('class', 'path')
      .attr('fill', 'white')
      .data(data)
      .style('fill', (d: TouristData) => this.colorScale(parseInt(d.VALUE)));

    return paths;
  }

  private addMapEvents(
    paths: d3.Selection<SVGPathElement, TouristData, SVGGElement, unknown>,
    data: TouristData[]
  ): void {
    paths
      .on('pointerenter', function(event: PointerEvent, d: TouristData) {
        const content = (this as any).getTooltipContent(d, 'Province');
        (this as any).tooltip.show(content, event.pageX - 100, event.pageY - 120);
      }.bind(this))
      .on('pointerleave', function() {
        (this as any).tooltip.hide();
      }.bind(this));
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
      .text('person');

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