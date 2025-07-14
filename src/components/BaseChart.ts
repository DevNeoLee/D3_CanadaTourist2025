import * as d3 from 'd3';
import { ChartDimensions } from '../types';
import { Tooltip } from './Tooltip';

export abstract class BaseChart {
  protected container: string;
  protected dimensions: ChartDimensions;
  protected tooltip: Tooltip;
  protected svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;

  constructor(container: string, dimensions: ChartDimensions) {
    this.container = container;
    this.dimensions = dimensions;
    this.tooltip = new Tooltip();
    this.svg = this.createSVG();
  }

  protected createSVG(): d3.Selection<SVGSVGElement, unknown, null, undefined> {
    return d3.select(this.container)
      .append('svg')
      .attr('width', this.dimensions.width + this.dimensions.margin.left + this.dimensions.margin.right)
      .attr('height', this.dimensions.height + this.dimensions.margin.top + this.dimensions.margin.bottom);
  }

  protected getChartGroup(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return this.svg
      .append('g')
      .attr('transform', `translate(${this.dimensions.margin.left}, ${this.dimensions.margin.top})`);
  }

  public clear(): void {
    d3.select(this.container).selectAll('svg').remove();
    this.svg = this.createSVG();
  }

  public destroy(): void {
    this.tooltip.destroy();
    d3.select(this.container).selectAll('svg').remove();
  }

  protected formatNumber(value: number): string {
    return new Intl.NumberFormat().format(value);
  }

  protected getTooltipContent(data: any, title: string): string {
    return `${title}<br/>${data.GEO} on ${data.REF_DATE}<br/>Tourists from Overseas: ${this.formatNumber(parseInt(data.VALUE))} persons`;
  }
} 