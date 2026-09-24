import {
  FINALS,
  FOOTER_ROW,
  GROUP_HEADERS,
  INITIAL_ROWS,
  type ChartCell,
  type ChartRow,
} from './chart-data.ts'

/** Payload served by `GET /api/chart` and rendered by the React chart. */
export type ChartData = {
  groups: { label: string; span: number }[]
  finals: string[]
  rows: ChartRow[]
  footer: ChartCell[]
}

export const chartData: ChartData = {
  groups: GROUP_HEADERS.map((group) => ({ label: group.label, span: group.span })),
  finals: FINALS,
  rows: INITIAL_ROWS,
  footer: FOOTER_ROW,
}
