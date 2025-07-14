import * as d3 from 'd3';
import { TouristData } from '../types';
import { BaseChart } from './BaseChart';
import { BAR_COLOR_SCALE, CHART_DIMENSIONS } from '../constants';

export class PieChart extends BaseChart {
  private colorScale: d3.ScaleThreshold<number, string>;
  private radius: number;

  constructor() {
    super('.pieWrap', CHART_DIMENSIONS.pie);
    this.colorScale = d3.scaleThreshold<number, string>()
      .domain(BAR_COLOR_SCALE.domain)
      .range(BAR_COLOR_SCALE.range);
    this.radius = 100;
  }

  public render(data: TouristData[], totalVisitors: number): void {
    try {
      this.clear();
      
      const chartGroup = this.getChartGroup();
      const { pieces } = this.drawPie(chartGroup, data, totalVisitors);
      this.animatePie(pieces, data, totalVisitors);
    } catch (error) {
      console.error('Error rendering pie chart:', error);
    }
  }

  protected getChartGroup(): d3.Selection<SVGGElement, unknown, null, undefined> {
    // Move to the bottom right
    return this.svg
      .append('g')
      .attr('transform', 'translate(130, 110)');
  }

  private drawPie(
    chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: TouristData[],
    totalVisitors: number
  ): { pieces: d3.Selection<SVGPathElement, d3.PieArcDatum<TouristData>, SVGGElement, unknown> } {
    // Generate pie
    const pie = d3.pie<TouristData>()
      .value(d => parseInt(d.VALUE));

    // Generate arc
    const arc = d3.arc<d3.PieArcDatum<TouristData>>()
      .innerRadius(35)
      .outerRadius(this.radius);

    const arcLarge = d3.arc<d3.PieArcDatum<TouristData>>()
      .innerRadius(30)
      .outerRadius(110);

    // Generate arc group
    const arcs = chartGroup.selectAll('g')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc');

    // Draw pie pieces
    const pieces = arcs.append('path')
      .attr('class', 'piece')
      .attr('d', arc)
      .attr('fill', (d, i) => this.colorScale(i + 1))
      // Connect event listeners before transition
      .on('pointerenter', function(event: PointerEvent, d: d3.PieArcDatum<TouristData>) {
        d3.select(this)
          .attr('d', arcLarge)
          .style('opacity', '0.5');
        const percentage = Math.round((parseInt(d.data.VALUE) / totalVisitors) * 100);
        const content = `${d.data.GEO} on ${d.data.REF_DATE}<br/>Non-Residential Travellers: ${this.formatNumber(parseInt(d.data.VALUE))} persons<br/>${percentage}%`;
        this.tooltip.show(content, event.pageX + 5, event.pageY - 100);
      }.bind(this))
      .on('pointerleave', function(event: PointerEvent, d: d3.PieArcDatum<TouristData>) {
        d3.select(this)
          .attr('d', arc)
          .style('opacity', '1.0');
        this.tooltip.hide();
      }.bind(this));

    // Add percent text
    arcs.append('text')
      .transition()
      .ease(d3.easeLinear)
      .duration(350)
      .attr('transform', (d) => {
        const c = arc.centroid(d);
        return `translate(${c[0] - 14}, ${c[1]})`;
      })
      .text((d) => {
        const percentage = Math.round((parseInt(d.data.VALUE) / totalVisitors) * 100);
        return percentage > 3 ? `${percentage}%` : null;
      })
      .attr('class', 'text');

    // Add title
    arcs.append('text')
      .attr('x', -35)
      .attr('y', 130)
      .text('Visitor Ratio');

    return { pieces };
  }

  private animatePie(
    pieces: d3.Selection<SVGPathElement, d3.PieArcDatum<TouristData>, SVGGElement, unknown>,
    data: TouristData[],
    totalVisitors: number
  ): void {
    const arc = d3.arc<d3.PieArcDatum<TouristData>>()
      .innerRadius(35)
      .outerRadius(this.radius);
    pieces
      .transition()
      .ease(d3.easeLinear)
      .duration(400)
      .attrTween('d', (d) => this.pieTween(d, arc));
  }

  private pieTween(
    b: d3.PieArcDatum<TouristData>,
    arc: d3.Arc<any, d3.PieArcDatum<TouristData>>
  ): (t: number) => string | null {
    const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, b);
    return (t: number) => arc(interpolate(t));
  }
} 