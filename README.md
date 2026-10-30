# Telugu Originals — Latest OTT

A free, catalog-only Stremio add-on for Telugu original movies and Telugu original series / TV shows, combining public publisher listings with official ZEE5 and Aha metadata. This is an independent repository and add-on, adapted from the MIT-licensed `josemsd7/telugu-dub-catalog` project.

## Install

Manifest URL:

```
https://josemsd7.github.io/telugu-original-catalog/manifest.json
```

Open https://josemsd7.github.io/telugu-original-catalog/ and click **Install in Stremio**, or paste the manifest URL into Stremio's add-on search field.

| Catalog | Type / ID | Order |
| --- | --- | --- |
| Telugu Originals — Movies | `movie/telugu-original-movies` | Earliest reported Telugu OTT release date, newest first |
| Telugu Originals — Series & TV | `series/telugu-original-series` | Original first-season premiere, newest first |

The add-on has a distinct manifest ID (`org.josemsd7.telugu.original.catalog`). Movies and shows stay separate. Later seasons and episode updates do not promote an older series above a newly premiered show. One entry per IMDb ID; duplicate sources and platforms are merged. Static hosting supports browsing and pagination; dynamic search is not advertised. Stremio's Cinemeta supplies detailed metadata and episode lists for the IMDb IDs.

## Language and release rules

- Telugu must be a confirmed **original language**, using Wikidata, the matching public TMDB Movie/TV original-language field, or an explicit publisher original-language label. A plain Telugu availability list is insufficient to establish original language. Telugu bilingual originals qualify.
- Titles with other original languages, conflicting language facts, uncertain identity, subtitle-only language labels, tentative dates, and future releases remain excluded. Country consistency is checked when available; a missing country field does not override confirmed original-Telugu language evidence. Matching considers title, year, available cast and separate Movie/TV identities. Same-name candidates are checked for language and identity before deciding whether the result is ambiguous.
- Verified search names are retained as alternate titles only for the same IMDb ID. This handles working titles such as `Mega 157` versus `Mana Shankara Vara Prasad Garu` without changing the film identity. IMDb suggestions supplement incomplete cast lists and outdated production years. Shorter suggestion queries recover spelling variants; weak transliteration matches still need cast or an explicit source year. Recent failed matches receive a recovery lookup after matcher updates, so a cached rejection does not hide a newly resolvable title.
- Movies sort by the earliest reported OTT date across accepted source rows. These dates are publisher reports; a late listing or a new platform does not prove first-ever digital availability. Date disagreements are retained in the coverage report.
- Documented postponed announcements are excluded from that earliest-date merge. For example, Sri Chidambaram Garu uses its confirmed February 26, 2026 streaming date, with the superseded February 19 listing and correction evidence retained in coverage data.
- Series premiere comes from Cinemeta season 1 episode 1, falling back to the series premiere date. A year-only fallback is marked approximate; unknown premiere dates sort last. A listing of a particular season does not confirm every season or episode.
- There is no one-year archive cutoff. Titles from accessible older source archives can appear below newer releases. A movie listing more than one calendar year after its confirmed film year is rejected as a possible later platform listing or old namesake; it cannot promote a 1984 or 2021 film into the 2026 new-release rows. Earlier, contemporaneous source listings can still establish the older film’s proper position. Delayed first digital releases beyond that threshold remain excluded without additional evidence. Older shows retain their original first-season ordering even when a new season is released. Live channels are outside this catalog.
- Date eligibility and coverage windows use **Asia/Kolkata**. A title dated October 30 becomes eligible on October 30 in India, even while it is October 29 elsewhere.

## Sources and known coverage limits

Movie release metadata combines [OTTReleaseMovies](https://ottreleasemovies.com/), [Trendraja](https://trendraja.in/telugu-movie-ott-release-dates-2021/), [Sacnilk](https://www.sacnilk.com/ott-movie-releases), and the **OTT Releases** tab of [123telugu](https://www.123telugu.com/mnews/latest-telugu-movie-theatrical-and-ott-release-dates-list.html). Only factual title, date, language, platform and cast fields are extracted.

Series discovery combines series rows from the applicable tables, [Sacnilk's series cards](https://www.sacnilk.com/entertainmenttopbar/Recent_WebSeries), and [91mobiles' Telugu series list](https://www.91mobiles.com/entertainment/new-telugu-web-series). The public pagination endpoints are bounded. 91mobiles' explicitly Telugu-original list cards provide candidates; other-language cards require detail-page Telugu streaming labels and are ultimately rejected by this add-on's original-language checks. Original-Telugu identity is still checked against the matching metadata record. Detail-page errors are reported, with the previous source snapshot retained where available.

SV Telugu OTT has no verified adapter: the reference project's access checks returned HTTP 403. It is disabled and contributes no titles. This is a recorded access limit, not evidence that the site is unavailable to ordinary visitors. IMDb’s public title suggestions supplement Cinemeta search without an API key. Suggestions provide candidate identities, not proof of language or availability. Movie and TV types remain separate; cast, year and original-language checks still apply. Some ambiguous or missing identities remain excluded. A narrowly scoped SI Yugandhar correction binds Netflix title 83001320 to IMDb tt47421307, the 2026 film year, October 30 release, Netflix platform and corroborating cast. Netflix explicitly lists Telugu as original audio; only the known conflicting TMDB 1811964 record is ignored for that verified mapping. Other original-language conflicts still remain excluded. The add-on cannot guarantee every Telugu original; source omissions and incorrect publisher data can affect coverage. Actual audio tracks, subscriptions and regional availability are not inspected.

Public reports:

- [Movie status](https://josemsd7.github.io/telugu-original-catalog/status.json) and [movie inclusion/exclusion evidence](https://josemsd7.github.io/telugu-original-catalog/coverage.json)
- [Series status](https://josemsd7.github.io/telugu-original-catalog/series/status.json) and [series inclusion/exclusion evidence](https://josemsd7.github.io/telugu-original-catalog/series/coverage.json)
- [Automatic update runs](https://github.com/josemsd7/telugu-original-catalog/actions/workflows/catalog.yml)

## Additional public sources (v1.1)

- **ZEE5 official:** the public Telugu movies category, Telugu series category and Telugu-originals collection. The parser reads only embedded factual metadata: title, Movie/Series type, cast, audio labels, explicit original-language tags and release date. A movie release date is treated as film identity metadata, not an OTT availability date; those movie records need a separately dated streaming listing to enter the catalog. Series dates can establish the original premiere, with year consistency checks. The pages expose a finite set of server-rendered cards; this does not claim a complete platform inventory. Official Movie/Series classification corrects conflicting publisher labels only for an exact title and release-date match.
- **Aha official:** publicly linked titles from the home, movies and shows pages. Title-bound `VideoObject` metadata supplies cast and a dated `WatchAction` offer. Streaming eligibility uses `availabilityStarts`, not a January 1 placeholder in `datePublished`. Only titles with explicit Telugu language evidence qualify for matching; available Telugu audio alone does not prove original language. At most 60 linked detail pages are inspected, and individual missing date/language fields appear in source status.
- **91mobiles movies:** its publicly accessible movie list and the same pagination endpoint used by the page. Only `(OTT)` cards are accepted; theatrical-only and BookMyShow-only dates do not create streaming releases. Scanning is bounded to the newest 40 pages, with the remaining archive reported as partial coverage.

Failed sources retain their previous factual snapshots. Bounded archives, unverified identities and platform-page metadata gaps remain visible in the status/coverage reports.

## Automatic refresh and hosting

GitHub Actions refreshes at **00:00, 06:00, 12:00 and 18:00 IST** (`30 0,6,12,18 * * *` UTC), then publishes static JSON and cached poster images through GitHub Pages. Jobs may run late, and Stremio caches catalogs. Individual source failures preserve the source's prior recent rows. If all release sources fail or no films are verified, deployment stops and the previous live version remains. A series refresh failure preserves its previous populated snapshot. A total poster outage also stops publication. Source layout changes can require a parser fix.

No paid API, API key, streaming provider, debrid account, OpenAI API or ChatGPT quota is used by automatic refreshes. A free public GitHub repo with **Settings → Pages → Source: GitHub Actions** is sufficient. Code and catalog metadata are public. The add-on is not submitted to any public Stremio directory by this project. GitHub can disable scheduled workflows in public repos after 60 days without repository activity; normal successful metadata refresh commits provide activity.

## Local development

Requires Node.js 22+ and Python 3; no npm dependencies.

```sh
npm test
npm run verify
node verify-series.mjs
ADDON_BASE_URL=https://josemsd7.github.io/telugu-original-catalog/ npm run build
npm start
```

Local manifest: `http://127.0.0.1:7000/manifest.json`. `npm start` serves the last built static files. Phone/TV clients should use the hosted HTTPS URL. Generated `public/` output is not committed; Actions creates and deploys it.

Code is MIT licensed. Third-party metadata and artwork retain their respective ownership and terms. No playback links are provided.
