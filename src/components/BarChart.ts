import { select, Selection } from 'd3-selection';
import { scaleThreshold, scaleLinear, scaleSqrt, scaleBand, ScaleThreshold, ScaleLinear, ScalePower, ScaleBand } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import 'd3-transition'; // Extend selection with transition methods
import { TouristData } from '../types';
import { BaseChart } from './BaseChart';
import { BAR_COLOR_SCALE, CHART_DIMENSIONS, ANIMATION_CONFIG } from '../constants';

export class BarChart extends BaseChart {
  private colorScale: ScaleThreshold<number, string>;
  private xScale: ScaleLinear<number, number>;
  private yScale: ScalePower<number, number>;
  private xAxisScale: ScaleBand<string>;

  constructor() {
    super('.leftContainer', CHART_DIMENSIONS.bar);
    this.colorScale = scaleThreshold<number, string>()
      .domain(BAR_COLOR_SCALE.domain)
      .range(BAR_COLOR_SCALE.range);
    
    this.xScale = scaleLinear();
    this.yScale = scaleSqrt() as ScalePower<number, number>;
    this.xAxisScale = scaleBand();
  }

  public render(data: TouristData[]): void {
    try {
      // Validate data
      if (!data || data.length === 0) {
        console.warn('BarChart: No data provided');
        return;
      }

      this.clear();
      
      const chartGroup = this.getChartGroup();
      this.setupScales(data);
      const bars = this.drawBars(chartGroup, data);
      this.drawLabels(chartGroup, data);
      this.drawAxes(chartGroup, data);
      this.drawTitle(chartGroup, data);
      // Apply transition after connecting event listeners
      this.animateBars(bars, data);
    } catch (error) {
      console.error('Error rendering bar chart:', error);
    }
  }

  private setupScales(data: TouristData[]): void {
    const { width, height } = this.dimensions;
    const barWidth = width / data.length;

    this.xScale
      .rangeRound([0, width])
      .domain([0, data.length]);

    this.xAxisScale
      .domain(data.map(d => d.GEO))
      .rangeRound([0, width]);

    this.yScale
      .domain([0, 1700000])
      .range([0, height]);
  }

  private drawBars(
    chartGroup: Selection<SVGGElement, unknown, null, undefined>,
    data: TouristData[]
  ): Selection<SVGRectElement, TouristData, SVGGElement, unknown> {
    const { width, height } = this.dimensions;
    const barWidth = width / data.length;

    const self = this;
    const bars = chartGroup.selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('transform', 'translate(65, 0)')
      .attr('width', barWidth)
      .attr('x', (d, i) => barWidth * i)
      .style('fill', (d, i) => this.colorScale(i + 1))
      // Connect event listeners before transition
      .on('pointerenter', function(event: PointerEvent, d: TouristData) {
        if (!d) return;
        select(this)
          .style('opacity', '0.4');
        const content = self.getTooltipContent(d, 'Province');
        self.tooltip.show(content, event.pageX - 50, event.pageY - 100);
      })
      .on('pointerleave', function(event: PointerEvent) {
        select(this)
          .style('opacity', '1');
        self.tooltip.hide();
      })
      .attr('y', height + 20)
      .attr('height', 0);

    return bars;
  }

  private animateBars(
    bars: Selection<SVGRectElement, TouristData, SVGGElement, unknown>,
    data: TouristData[]
  ): void {
    const { height } = this.dimensions;
    bars
      .transition()
      .duration(ANIMATION_CONFIG.duration)
      .delay((d, i) => i * ANIMATION_CONFIG.delay)
      .attr('y', d => height - this.yScale(parseInt(d.VALUE)) + 10)
      .attr('height', d => this.yScale(parseInt(d.VALUE)));
  }

  private drawLabels(
    chartGroup: Selection<SVGGElement, unknown, null, undefined>,
    data: TouristData[]
  ): void {
    const { width, height } = this.dimensions;
    const barWidth = width / data.length;

    chartGroup.selectAll('text')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'label')
      .text(d => this.formatNumber(parseInt(d.VALUE)))
      .attr('y', height - 500)
      .attr('height', 0)
      .transition()
      .duration(250)
      .delay((d, i) => i * ANIMATION_CONFIG.delay)
      .attr('y', d => height - this.yScale(parseInt(d.VALUE)) + 8)
      .style('text-anchor', 'middle')
      .attr('x', (d, i) => (95 + barWidth * i))
      .attr('fill', 'darkblue');
  }

  private drawAxes(
    chartGroup: Selection<SVGGElement, unknown, null, undefined>,
    data: TouristData[]
  ): void {
    const { height } = this.dimensions;

    // X-axis
    const xAxis = axisBottom(this.xAxisScale);
    chartGroup.append('g')
      .attr('class', 'x_axis')
      .attr('transform', `translate(65, ${height + 10})`)
      .call(xAxis)
      .selectAll('text')
      .attr('transform', 'rotate(90)')
      .style('text-anchor', 'start')
      .style('font-size', '13px')
      .attr('x', 8)
      .attr('y', -5);

    // Y-axis
    const yAxisScale = scaleSqrt()
      .domain([1700000, 0])
      .range([0, height]);
    
    const yAxis = axisLeft(yAxisScale);
    chartGroup.append('g')
      .attr('class', 'y_axis')
      .attr('transform', 'translate(65, 10)')
      .call(yAxis);
  }

  private drawTitle(
    chartGroup: Selection<SVGGElement, unknown, null, undefined>,
    data: TouristData[]
  ): void {
    // Title
    chartGroup.append('text')
      .attr('x', '131')
      .attr('y', '55')
      .text(`Provincial Visitors on ${data[0]?.REF_DATE || ''}`)
      .attr('class', 'subTitle');

    // Y-axis label
    chartGroup.append('text')
      .attr('x', -20)
      .attr('y', 5)
      .text('Tourists')
      .attr('class', 'axisText');

    // X-axis label
    chartGroup.append('text')
      .attr('x', '365')
      .attr('y', this.dimensions.height + 140)
      .text('Canadian Province')
      .attr('class', 'axisText');
  }
} 