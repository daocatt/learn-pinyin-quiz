/**
 * Where a syllable's recording lives. Shared because both the chart (client)
 * and the quiz round builder (server) have to point at the same files.
 *
 * `ü` is not addressable in a URL path, so the recordings spell it `v`:
 * nǚ is `public/audio/nv3.mp3`.
 */
export function audioUrl(syllable: string, tone: number): string {
  return `/audio/${syllable.replace('ü', 'v')}${tone}.mp3`
}
