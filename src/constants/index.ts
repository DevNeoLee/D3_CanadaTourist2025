import { ColorScale } from '../types';

export const PROVINCES = [
  "Newfoundland and Labrador",
  "Prince Edward Island",
  "Nova Scotia",
  "New Brunswick",
  "Quebec",
  "Ontario",
  "Manitoba",
  "Saskatchewan",
  "Alberta",
  "British Columbia",
  "Yukon",
  "Nunavut"
] as const;

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'June',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
] as const;

export const YEARS = Array.from({ length: 20 }, (_, i) => 2000 + i);

export const VISITOR_THRESHOLDS = [
  0, 500, 5000, 10000, 50000, 100000, 
  300000, 700000, 1000000, 1300000, 1700000
];

export const MAP_COLOR_SCALE: ColorScale = {
  domain: VISITOR_THRESHOLDS,
  range: [
    "#ffffff", "#f7fbff", "#e3eef9", "#cfe1f2", "#b5d4e9",
    "#93c3df", "#6daed5", "#4b97c9", "#2f7ebc", "#1864aa",
    "#0a4a90", "#08306b"
  ]
};

export const BAR_COLOR_SCALE: ColorScale = {
  domain: Array.from({ length: 12 }, (_, i) => i + 1),
  range: [
    "#4a58dd", "#2f9df5", "#27d7c4", "#4df884", "#95fb51",
    "#dedd32", "#ffa423", "#f65f18", "#ba2208", "#900c00",
    "#bf3caf", "#fe4b83"
  ]
};

export const CHART_DIMENSIONS = {
  map: {
    width: 670,
    height: 505,
    margin: { top: 62, left: 30, right: 50, bottom: 50 }
  },
  bar: {
    width: 580,
    height: 550,
    margin: { top: 10, right: 0, bottom: 190, left: 80 }
  },
  pie: {
    width: 231,
    height: 245,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  }
};

export const MAP_PROJECTION_CONFIG = {
  scale: 410,
  translate: [980, 770]
};

export const ANIMATION_CONFIG = {
  duration: 350,
  delay: 30
}; 