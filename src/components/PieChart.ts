import { select, Selection } from 'd3-selection';
import { scaleThreshold, ScaleThreshold } from 'd3-scale';
import { pie, PieArcDatum } from 'd3-shape';
import { arc, Arc } from 'd3-shape';
import 'd3-transition'; // Extend selection with transition methods
import { easeLinear } from 'd3-ease';
import { interpolate } from 'd3-interpolate';
import { TouristData } from '../types';
import { BaseChart } from './BaseChart';
import { BAR_COLOR_SCALE, CHART_DIMENSIONS } from '../constants';

export class PieChart extends BaseChart {
  private colorScale: ScaleThreshold<number, string>;
  private radius: number;

  constructor() {
    super('.pieWrap', CHART_DIMENSIONS.pie);
    this.colorScale = scaleThreshold<number, string>()
      .domain(BAR_COLOR_SCALE.domain)
      .range(BAR_COLOR_SCALE.range);
    this.radius = 100;
  }

  public async render(data: TouristData[], total: number): Promise<void> {
    try {
      // Validate data
      if (!data || data.length === 0) {
        console.warn('PieChart: No data provided');
        return;
      }

      if (!total || total <= 0) {
        console.warn('PieChart: Invalid total value');
        return;
      }

      this.clear();
      
      const chartGroup = this.getChartGroup();
      const { pieces } = this.drawPie(chartGroup, data, total);
      this.animatePie(pieces, data, total);
    } catch (error) {
      console.error('Error rendering pie chart:', error);
    }
  }

  protected getChartGroup(): Selection<SVGGElement, unknown, null, undefined> {
    // Move to the bottom right
    return this.svg
      .append('g')
      .attr('transform', 'translate(130, 110)');
  }

  private drawPie(
    chartGroup: Selection<SVGGElement, unknown, null, undefined>,
    data: TouristData[],
    totalVisitors: number
  ): { pieces: Selection<SVGPathElement, PieArcDatum<TouristData>, SVGGElement, unknown> } {
    // Generate pie
    const pieGenerator = pie<TouristData>()
      .value(d => {
        const value = parseInt(d.VALUE);
        return isNaN(value) ? 0 : value;
      });

    // Generate arc
    const arcGenerator = arc<PieArcDatum<TouristData>>()
      .innerRadius(35)
      .outerRadius(this.radius);

    const arcLarge = arc<PieArcDatum<TouristData>>()
      .innerRadius(30)
      .outerRadius(110);

    // Generate pie data
    const pieData = pieGenerator(data);
    
    // Filter out invalid data
    const validPieData = pieData.filter(d => d && d.data && !isNaN(parseInt(d.data.VALUE)));

    // Generate arc group
    const arcs = chartGroup.selectAll('g')
      .data(validPieData)
      .enter()
      .append('g')
      .attr('class', 'arc');

    // Draw pie pieces
    const self = this;
    const pieces = arcs.append('path')
      .attr('class', 'piece')
      .attr('d', (d) => {
        if (!d || !d.data) return '';
        const path = arcGenerator(d);
        return path ? path : '';
      })
      .attr('fill', (d, i) => this.colorScale(i + 1))
      // Connect event listeners before transition
      .on('pointerenter', function(event: PointerEvent, d: PieArcDatum<TouristData>) {
        if (!d || !d.data) return;
        select(this)
          .attr('d', arcLarge(d))
          .style('opacity', '0.5');
        const percentage = Math.round((parseInt(d.data.VALUE) / totalVisitors) * 100);
        const content = `${d.data.GEO} on ${d.data.REF_DATE}<br/>Non-Residential Travellers: ${self.formatNumber(parseInt(d.data.VALUE))} persons<br/>${percentage}%`;
        self.tooltip.show(content, event.pageX + 5, event.pageY - 100);
      })
      .on('pointerleave', function(event: PointerEvent, d: PieArcDatum<TouristData>) {
        if (!d || !d.data) return;
        select(this)
          .attr('d', arcGenerator(d))
          .style('opacity', '1.0');
        self.tooltip.hide();
      });

    // Add percent text
    arcs.append('text')
      .transition()
      .ease(easeLinear)
      .duration(350)
      .attr('transform', (d) => {
        const c = arcGenerator.centroid(d);
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
    pieces: Selection<SVGPathElement, PieArcDatum<TouristData>, SVGGElement, unknown>,
    data: TouristData[],
    totalVisitors: number
  ): void {
    const arcGenerator = arc<PieArcDatum<TouristData>>()
      .innerRadius(35)
      .outerRadius(this.radius);
    pieces
      .transition()
      .ease(easeLinear)
      .duration(400)
      .attrTween('d', (d) => {
        if (!d || !d.data) return () => null;
        return this.pieTween(d, arcGenerator);
      });
  }

  private pieTween(
    b: PieArcDatum<TouristData>,
    arcGenerator: Arc<any, PieArcDatum<TouristData>>
  ): (t: number) => string | null {
    const interpolator = interpolate({ startAngle: 0, endAngle: 0 }, b);
    return (t: number) => arcGenerator(interpolator(t));
  }
} 