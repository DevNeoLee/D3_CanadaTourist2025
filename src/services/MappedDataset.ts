/**
 * Mapped dataset: the single source of truth for charts and LLM.
 *
 * Data pipeline:
 * 1. Raw CSV (travel_province_data.csv) → loaded and parsed.
 * 2. Filtered: PROVINCES only, "Total non resident tourists", "Unadjusted", REF_DATE in 2000s.
 * 3. Mapped: aggregated by year (2000–2019), month (1–12), province (12). One visitor count per (year, month, province).
 *
 * Charts and the LLM use only this mapped dataset (filtered + sliced by year/month).
 * Raw CSV is never sent to the LLM or used directly in charts.
 */

/** Human-readable description of the mapped schema for the LLM. */
export const MAPPED_DATASET_DESCRIPTION =
  'Mapped dataset (same as the charts): aggregated by year (2000–2019), month (Jan–Dec), and province (12). ' +
  'Each row is one visitor count for a (year, month, province). Source: Statistics Canada, total non-resident tourists, unadjusted. ' +
  'You know only this mapped dataset. Do not refer to or assume any raw CSV; the numbers below are the only data you have.';
