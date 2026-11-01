# Telugu Originals — Latest OTT

A free catalog and metadata add-on for Stremio and Nuvio, covering Telugu original movies and Telugu original series / TV shows. It combines public publisher listings with official OTT metadata. This is an independent repository and add-on, adapted from the MIT-licensed `josemsd7/telugu-dub-catalog` project.

## Install

Manifest URL:

```
https://josemsd7.github.io/telugu-original-catalog/manifest.json
```

Open https://josemsd7.github.io/telugu-original-catalog/ and click **Install in Stremio**, or paste the manifest URL into Stremio's add-on search field. In Nuvio, add the same manifest URL as a Stremio-compatible add-on. After upgrading from a catalog-only version, remove and re-add this add-on once so Nuvio reloads its manifest and recognizes the new metadata resource. Playback still requires separate stream add-ons.

| Catalog | Type / ID | Order |
| --- | --- | --- |
| Telugu Originals — Movies | `movie/telugu-original-movies` | Earliest reported Telugu OTT release date, newest first |
| Telugu Originals — Series & TV | `series/telugu-original-series` | Original first-season premiere, newest first |

The add-on has a distinct manifest ID (`org.josemsd7.telugu.original.catalog`). Movies and shows stay separate. Later seasons and episode updates do not promote an older series above a newly premiered show. One entry per IMDb ID; duplicate sources and platforms are merged. Static hosting supports browsing and pagination; dynamic search is not advertised. The add-on serves its own `/meta/movie/{IMDb ID}.json` and `/meta/series/{IMDb ID}.json` responses, so clients such as Nuvio can open title details without a separate metadata add-on. The manifest declares the `meta` resource with the stable `tt` IMDb prefix, so future catalog additions work without reinstalling. Metadata is served for titles included in these catalogs; it is not a general replacement for other metadata add-ons. Movie facts use the verified identity cache; series episode lists use public Cinemeta metadata, refreshed every six hours and cached in `data/series-details.json`. Both Cinemeta episode schemas (`episode`/`released` and `number`/`firstAired`) are supported. Episode IDs remain `tt…:season:episode` for other stream add-ons. Missing episode lists remain empty rather than inventing episodes, and temporary source failures retain previous successful lists. [Metadata coverage status](https://josemsd7.github.io/telugu-original-catalog/meta/status.json) reports these gaps.

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

## Direct public OTT sources (v1.2)

The refresh also reads public metadata from the following official services, without signing in, calling players, using paid APIs or creating sessions:

| Service | Public discovery and evidence | Release-date handling |
| --- | --- | --- |
| Netflix | South Indian Cinema collection; matching titles from public Movies and TV collections; title details, cast, Telugu audio and explicit `[Original]` audio labels | Film years do not establish OTT dates; a dated release listing is required |
| Prime Video | Public Telugu search, matching public movie cards, title-bound hydration metadata, cast, audio tracks and film year | Film release dates do not establish OTT dates |
| SonyLIV | Public home/movie/Telugu pages and their embedded title metadata | Contract dates, original film dates and generated page-upload timestamps do not establish new OTT dates |
| ETV Win | Official movie/series XML sitemaps and title-bound Movie/TVSeries metadata exposed in public pages | Only explicit WatchAction availability offers can supply independent OTT dates; uploadDate/dateCreated also contain theatrical dates and are used only as metadata context |
| Sun NXT | Official Telugu movie sitemap records, recent TV sitemap partitions, full-title pages and the official public blog/feed | Explicit same-title streaming wording can supply a date; film years, article publication dates and generic teaser-upload dates cannot |
| JioHotstar | The public India page is checked and its result reported | During validation this server received the Disney Bundle regional page, so direct India catalog metadata was unavailable. Existing publisher listings for JioHotstar remain active |

Original-language evidence is checked separately from available audio. A movie having a Telugu audio track does not make it a Telugu original. Netflix's explicit Original labels can fill missing original-language facts, but conflicting Wikidata/TMDB/platform evidence remains excluded. Platform metadata is joined only to compatible title names and years; evidence links are retained with accepted entries. Official streaming dates require a known film year so an unknown old film cannot be promoted as a new release.

Each refresh budgets up to 120 Netflix, 45 Prime Video, 120 ETV Win and 100 Sun NXT new or expired detail pages. Recent dated source titles receive priority. Fresh cached titles do not consume this budget, allowing later refreshes to inspect previously unchecked titles. Successful detail facts cache for seven days, recent dated releases for six hours, and transient failures for six hours. Retained records, partial scans and regional restrictions are visible in the live status reports. These sources improve discovery and matching; they do not guarantee every platform title or independently verify playable audio in India.

Recent publisher release listings also shorten missing-audio checks to six hours, so a pre-release title page cannot remain hidden behind an older seven-day metadata cache.

Sun NXT's main site worked during local validation but returned HTTP 403 from GitHub Actions. The adapter retains the last verified title records and also checks the separate official public blog/feed for discovery. An article's publication date is never used as an OTT release date; only an explicit dated streaming announcement for that named film can establish one. Source status reports distinguish these partial results and failures.

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
