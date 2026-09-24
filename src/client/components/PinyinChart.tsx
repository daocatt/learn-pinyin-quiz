import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ChartCell, ChartRow } from '../../shared/chart-data'
import type { ChartData } from '../../shared/chart'
import { SoundPlayer, type PlayerPosition } from './SoundPlayer'

/** 1-based table-cell indexes that close a vowel group (thicker divider). */
const GROUP_END_COLUMNS: number[] = [1, 6, 9, 14, 24, 32]

/** The chart alternates white / grey blocks of initial rows. */
function isGreyRow(rowIndex: number): boolean {
  return (
    (rowIndex >= 4 && rowIndex <= 7) ||
    (rowIndex >= 11 && rowIndex <= 14) ||
    (rowIndex >= 18 && rowIndex <= 20)
  )
}

const THEME = {
  white: 'bg-white hover:bg-[#eaf6ef]',
  grey: 'bg-[#edf4ef] hover:bg-[#f5fbf7]',
} as const

type PlayerState = PlayerPosition & { syllable: string }

/**
 * Place the popup against the document, not the viewport. It is
 * `position: absolute`, so document coordinates are what keep it glued to its
 * cell when the page scrolls.
 */
function positionFor(syllable: string, element: HTMLElement): PlayerState {
  const rect = element.getBoundingClientRect()
  const docTop = rect.top + window.scrollY
  const docLeft = rect.left + window.scrollX
  // The popup is vertically centred on the cell (CSS translateY(-50%)), so it
  // needs the cell's midpoint rather than its top edge.
  const top = docTop + rect.height / 2
  // Flip to the left when the four-tone row would run off the right edge.
  if (rect.right + 380 < window.innerWidth) {
    return { syllable, top, left: docLeft + rect.width + 14, right: null, pointer: 'left' }
  }
  // `right` is measured from the containing block's right edge, which is
  // viewport-wide and anchored at the document origin.
  return {
    syllable,
    top,
    left: null,
    right: window.innerWidth - docLeft + 16,
    pointer: 'right',
  }
}

function cellText(cell: ChartCell): string {
  if (!cell) return ''
  return typeof cell === 'string' ? cell : cell.text
}

function cellBold(cell: ChartCell): boolean {
  return typeof cell === 'object' && cell !== null && Boolean(cell.bold)
}

export function PinyinChart({ data }: { data: ChartData }) {
  const [player, setPlayer] = useState<PlayerState | null>(null)
  /** The cell the popup points at, so it can be repositioned when things move. */
  const anchor = useRef<HTMLElement | null>(null)
  const isOpen = player !== null

  // Clicking anywhere outside the popup dismisses it.
  useEffect(() => {
    if (!isOpen) return
    const close = () => {
      anchor.current = null
      setPlayer(null)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [isOpen])

  // Keep the popup glued to its cell. The chart scrolls inside #pinyin
  // (overflow-x: auto), which is a separate scroll container from the page, so
  // the listener runs in the capture phase to observe both.
  useEffect(() => {
    if (!isOpen) return
    let frame = 0
    const reposition = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const element = anchor.current
        if (element) setPlayer((prev) => (prev ? positionFor(prev.syllable, element) : prev))
      })
    }
    window.addEventListener('scroll', reposition, { capture: true, passive: true })
    window.addEventListener('resize', reposition)
    // A viewport resize can also reflow the table itself — crossing the 980px
    // breakpoint changes the header font-size — which moves the cell without
    // any further scroll or resize event. Watching the table catches that.
    const table = anchor.current?.closest('table')
    const observer = table ? new ResizeObserver(reposition) : null
    observer?.observe(table!)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', reposition, { capture: true })
      window.removeEventListener('resize', reposition)
      observer?.disconnect()
    }
  }, [isOpen])

  const openPlayer = (syllable: string, element: HTMLElement) => {
    anchor.current = element
    setPlayer(positionFor(syllable, element))
  }

  const handleCellClick = (syllable: string, event: MouseEvent<HTMLTableCellElement>) => {
    if (!syllable) return
    event.stopPropagation()
    openPlayer(syllable, event.currentTarget)
  }

  const renderCell = (
    cell: ChartCell,
    columnIndex: number,
    theme: keyof typeof THEME,
    rowKey: string,
  ) => {
    const text = cellText(cell)
    const tdIndex = columnIndex + 2
    const groupEnd = GROUP_END_COLUMNS.includes(tdIndex)
    return (
      <td
        key={`${rowKey}-${columnIndex}`}
        className={`${THEME[theme]} text-[13px]${groupEnd ? ' group-end' : ''}`}
        onClick={(event) => handleCellClick(text, event)}
      >
        {text ? cellBold(cell) ? <b>{text}</b> : text : null}
      </td>
    )
  }

  return (
    <>
      <div id="pinyin_chart_wrapper" className="mx-auto w-full">
        <div id="pinyin" className="w-full overflow-x-auto">
          <table className="pinyin-table">
            <thead>
              <tr>
                <th aria-hidden="true" />
                {data.groups.map((group) => (
                  <th key={group.label} colSpan={group.span}>
                    {group.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="finals-row">
                <td aria-hidden="true" />
                {data.finals.map((final, index) => {
                  // FOOTER_ROW is column-aligned with FINALS: a non-null entry
                  // means this bare final has a recording, so it is the
                  // clickable audio trigger, replacing the separate bottom row
                  // that used to mark the same thing.
                  const hasAudio = Boolean(data.footer[index])
                  const tdIndex = index + 2
                  return (
                    <td
                      key={`final-${index}`}
                      className={`text-[13px]${
                        GROUP_END_COLUMNS.includes(tdIndex) ? ' group-end' : ''
                      }${hasAudio ? ' finals-row__audio' : ''}`}
                      onClick={hasAudio ? (event) => handleCellClick(final, event) : undefined}
                    >
                      {final}
                    </td>
                  )
                })}
              </tr>

              {data.rows.map((row: ChartRow, rowIndex) => {
                const theme: keyof typeof THEME = isGreyRow(rowIndex) ? 'grey' : 'white'
                return (
                  <tr key={row.initial}>
                    <td className="group-end text-[13px]">
                      <b>{row.initial}</b>
                    </td>
                    {row.cells.map((cell, columnIndex) =>
                      renderCell(cell, columnIndex, theme, row.initial),
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {player && (
        <SoundPlayer syllable={player.syllable} position={player} />
      )}

      {/* mt replaces the gap the removed 单击时 control row used to occupy. */}
      <p className="mt-[25px] text-center text-[13px] italic leading-[1.4] text-ink">
        <b>提示：</b>
        {'加粗音节为特殊读法，其中元音的发音与常见读法不同。对比理解：'}
        <b>zi</b>
        {' 的 i 不同于 ni，'}
        <b>yan</b>
        {' 的 a 不同于 ban，'}
        <b>ye</b>
        {' 的 e 不同于 de，'}
        <b>yuan</b>
        {' 的 a 不同于 duan，其余依此类推。'}
      </p>
    </>
  )
}
