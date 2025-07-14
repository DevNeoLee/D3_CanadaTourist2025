import * as d3 from 'd3';

export class Tooltip {
  private element: d3.Selection<HTMLDivElement, unknown, null, undefined>;

  constructor() {
    this.element = d3.select('body')
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('text-align', 'center')
      .style('padding', '10px')
      .style('font', '12px sans-serif')
      .style('background', 'white')
      .style('border', '0.5px solid black')
      .style('border-radius', '8px')
      .style('pointer-events', 'none')
      .style('font-size', '15px')
      .style('line-height', '1.5')
      .style('z-index', '10');
  }

  show(content: string, x: number, y: number): void {
    this.element
      .transition()
      .duration(0)
      .style('opacity', 0.9);

    this.element
      .html(content)
      .style('left', `${x}px`)
      .style('top', `${y}px`);
  }

  hide(): void {
    this.element
      .transition()
      .duration(0)
      .style('opacity', 0);
  }

  destroy(): void {
    this.element.remove();
  }
} 