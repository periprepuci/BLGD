/**
 * Smoke test entry. Built with Vite (so `import.meta.env` and the `@` alias
 * resolve exactly as they do in the app) and then run under Node.
 *
 * Exercises the real service layer against the live AREDL and Geometry Dash
 * APIs, with no Supabase configured - which is precisely the "direct" fallback
 * path, so it also proves the Edge Functions are genuinely optional.
 */
import * as aredl from '@/services/aredl.service'
import * as gd from '@/services/geometryDash.service'
import * as levels from '@/services/levels.service'
import { extractYouTubeId, thumbnailUrl } from '@/utils/youtube'
import { clampRating, parseLevelId, validateYouTubeUrl } from '@/utils/validation'
import { resolveLevelArtwork } from '@/utils/thumbnails'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function main() {
  // --- pure helpers --------------------------------------------------------
  check('youtube watch URL', extractYouTubeId('https://www.youtube.com/watch?v=3CoEaH1CM7o&t=90s') === '3CoEaH1CM7o')
  check('youtube short URL', extractYouTubeId('https://youtu.be/3CoEaH1CM7o') === '3CoEaH1CM7o')
  check('youtube shorts URL', extractYouTubeId('https://www.youtube.com/shorts/3CoEaH1CM7o') === '3CoEaH1CM7o')
  check('rejects javascript: URL', extractYouTubeId('javascript:alert(1)') === null)
  check('rejects lookalike host', extractYouTubeId('https://youtube.com.evil.test/watch?v=3CoEaH1CM7o') === null)
  check('rejects non-youtube', validateYouTubeUrl('https://vimeo.com/123').ok === false)
  check('level id parse', parseLevelId(' 42584142 ') === 42584142 && parseLevelId('12a') === null)
  check('rating snaps to 0.5', clampRating(7.3) === 7.5 && clampRating(11) === 10 && clampRating(-1) === 0)

  // --- AREDL: the full ranking --------------------------------------------
  const list = await aredl.getRankedLevels()
  check('AREDL list loaded', list.entries.length > 1000, `${list.entries.length} entries, source=${list.source}`)
  check('AREDL positions start at 1', list.entries[0]?.position === 1, `#1 is ${list.entries[0]?.name}`)
  check('AREDL entries carry a GD level id', typeof list.entries[0]?.gdLevelId === 'number')

  // --- AREDL: rank resolved by level_id, NOT by path param -----------------
  // Level 128 does not exist as a GD extreme demon; asking AREDL's /levels/128
  // would return the level ranked #128. Our index must return null instead.
  const index = await aredl.getRankIndex()
  check('rank lookup keys on level_id, not position', index.get(128) === undefined,
    'GD level 128 correctly absent')

  const bloodlust = index.get(42584142)
  check('Bloodlust found by GD level id', Boolean(bloodlust), bloodlust ? `AREDL #${bloodlust.position}` : 'not found')

  // --- Geometry Dash provider ----------------------------------------------
  const level = await gd.getLevel(42584142)
  check('GD level fetched', level.name === 'Bloodlust', `${level.name} by ${level.creator}`)
  check('GD level flagged as Extreme Demon', level.isExtremeDemon, String(level.difficulty))

  const player = await gd.getPlayer('robtop')
  check('GD player fetched', player.username.toLowerCase() === 'robtop', `${player.stars} stars, account ${player.accountId}`)
  check('GD stars are a number', typeof player.stars === 'number')

  const results = await gd.searchLevels('bloodlust', { count: 3 })
  check('GD search returns results', results.length > 0, `${results.length} hits`)

  // --- the full resolve pipeline (what "Add Extreme Demon" calls) ----------
  const resolved = await levels.resolveLevel(42584142)
  check('resolveLevel: name', resolved.name === 'Bloodlust', resolved.name)
  check('resolveLevel: creator', Boolean(resolved.creator), String(resolved.creator))
  check('resolveLevel: AREDL rank present', typeof resolved.aredlRank === 'number', `#${resolved.aredlRank}`)
  check('resolveLevel: credits list', resolved.creators.length > 0, resolved.creators.slice(0, 3).join(', '))
  check('resolveLevel: verification video', Boolean(resolved.verificationVideoUrl), String(resolved.verificationVideoUrl))
  check('resolveLevel: thumbnail derived', Boolean(resolved.thumbnailUrl), String(resolved.thumbnailUrl))
  check('resolveLevel: fell back to direct (no Edge, no Supabase)', resolved.source.gd === 'direct', JSON.stringify(resolved.source))

  // --- artwork priority ----------------------------------------------------
  const fakeLevel = {
    name: resolved.name,
    gd_level_id: resolved.gdLevelId,
    thumbnail_url: resolved.thumbnailUrl,
    verification_video_url: resolved.verificationVideoUrl,
  }
  const own = resolveLevelArtwork(fakeLevel, 'dQw4w9WgXcQ')
  check('own completion video wins', own.source === 'completion' && own.url === thumbnailUrl('dQw4w9WgXcQ'))
  const fallback = resolveLevelArtwork(fakeLevel, null)
  check('falls back to AREDL verification', fallback.source === 'verification', String(fallback.url))
  const placeholder = resolveLevelArtwork({ ...fakeLevel, thumbnail_url: null, verification_video_url: null }, null)
  check('placeholder when nothing available', placeholder.source === 'placeholder' && placeholder.url === null)

  // --- a level that is not on AREDL ---------------------------------------
  const unranked = await levels.resolveLevel(128)
  check('unlisted level resolves with a null rank', unranked.aredlRank === null, `${unranked.name} -> ${unranked.aredlRank}`)

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('SMOKE TEST CRASHED:', error)
  process.exit(1)
})
