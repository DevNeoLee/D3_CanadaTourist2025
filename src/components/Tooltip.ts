import * as d3 from 'd3';

/**
 * Shared tooltip: one div in body, styled via .tooltip in CSS.
 * Only position and visibility are set in JS.
 */
export class Tooltip {
  private element: d3.Selection<HTMLDivElement, unknown, null, undefined>;

  constructor() {
    this.element = d3.select('body')
      .append('div')
      .attr('class', 'tooltip');
  }

  show(content: string, x: number, y: number): void {
    this.element
      .html(content)
      .style('left', `${x}px`)
      .style('top', `${y}px`)
      .style('opacity', '0.9');
  }

  hide(): void {
    this.element.style('opacity', '0');
  }

  destroy(): void {
    this.element.remove();
  }
} 