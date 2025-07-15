import * as d3 from 'd3';
import { TouristData } from '../types';
import { BaseChart } from './BaseChart';
import { BAR_COLOR_SCALE, CHART_DIMENSIONS, ANIMATION_CONFIG } from '../constants';

export class BarChart extends BaseChart {
  private colorScale: d3.ScaleThreshold<number, string>;
  private xScale: d3.ScaleLinear<number, number>;
  private yScale: d3.ScalePower<number, number>;
  private xAxisScale: d3.ScaleBand<string>;

  constructor() {
    super('.leftContainer', CHART_DIMENSIONS.bar);
    this.colorScale = d3.scaleThreshold<number, string>()
      .domain(BAR_COLOR_SCALE.domain)
      .range(BAR_COLOR_SCALE.range);
    
    this.xScale = d3.scaleLinear();
    this.yScale = d3.scaleSqrt() as d3.ScalePower<number, number>;
    this.xAxisScale = d3.scaleBand();
  }

  public render(data: TouristData[]): void {
    try {
      this.clear();
      
      const chartGroup = this.getChartGroup();
      this.setupScales(data);
      const bars = this.drawBars(chartGroup, data);
      this.drawLabels(chartGroup, data);
      this.drawAxes(chartGroup, data);
      this.drawTitle(chartGroup, data);
      // transition은 이벤트 리스너 연결 후 별도로 적용
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
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: TouristData[]
  ): d3.Selection<SVGRectElement, TouristData, SVGGElement, unknown> {
    const { width, height } = this.dimensions;
    const barWidth = width / data.length;

    const bars = chartGroup.selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('transform', 'translate(65, 0)')
      .attr('width', barWidth)
      .attr('x', (d, i) => barWidth * i)
      .style('fill', (d, i) => this.colorScale(i + 1))
      // transition 전에 이벤트 리스너 연결
      .on('pointerenter', function(event: PointerEvent, d: TouristData) {
        d3.select(this)
          .style('opacity', '0.4');
        const content = (this as any).getTooltipContent(d, 'Province');
        (this as any).tooltip.show(content, event.pageX - 50, event.pageY - 100);
      }.bind(this))
      .on('pointerleave', function(event: PointerEvent) {
        d3.select(this)
          .style('opacity', '1');
        (this as any).tooltip.hide();
      }.bind(this))
      .attr('y', height + 20)
      .attr('height', 0);

    return bars;
  }

  private animateBars(
    bars: d3.Selection<SVGRectElement, TouristData, SVGGElement, unknown>,
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
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
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
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: TouristData[]
  ): void {
    const { height } = this.dimensions;

    // X축
    const xAxis = d3.axisBottom(this.xAxisScale);
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

    // Y축
    const yAxisScale = d3.scaleSqrt()
      .domain([1700000, 0])
      .range([0, height]);
    
    const yAxis = d3.axisLeft(yAxisScale);
    chartGroup.append('g')
      .attr('class', 'y_axis')
      .attr('transform', 'translate(65, 10)')
      .call(yAxis);
  }

  private drawTitle(
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: TouristData[]
  ): void {
    // 제목
    chartGroup.append('text')
      .attr('x', '131')
      .attr('y', '55')
      .text(`Provincial Visitors on ${data[0]?.REF_DATE || ''}`)
      .attr('class', 'subTitle');

    // Y축 라벨
    chartGroup.append('text')
      .attr('x', -20)
      .attr('y', 5)
      .text('Tourists')
      .attr('class', 'axisText');

    // X축 라벨
    chartGroup.append('text')
      .attr('x', '365')
      .attr('y', this.dimensions.height + 140)
      .text('Canadian Province')
      .attr('class', 'axisText');
  }
} 