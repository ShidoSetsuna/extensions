// AnimeTosho Custom Provider - Standalone Version
// All type definitions included inline

// Type definitions
type AnimeProviderSmartSearchFilter = "batch" | "episodeNumber" | "resolution" | "query" | "bestReleases"
type AnimeProviderType = "main" | "special"

interface AnimeProviderSettings {
    canSmartSearch: boolean
    smartSearchFilters: AnimeProviderSmartSearchFilter[]
    supportsAdult: boolean
    type: AnimeProviderType
}

interface Media {
    id: number
    idMal?: number
    status?: string
    format?: string
    englishTitle?: string
    romajiTitle?: string
    episodeCount?: number
    absoluteSeasonOffset?: number
    synonyms: string[]
    isAdult: boolean
    startDate?: FuzzyDate
}

interface FuzzyDate {
    year: number
    month?: number
    day?: number
}

interface AnimeSearchOptions {
    media: Media
    query: string
}

interface AnimeSmartSearchOptions {
    media: Media
    query: string
    batch: boolean
    episodeNumber: number
    resolution: string
    anidbAID: number
    anidbEID: number
    bestReleases: boolean
}

interface AnimeTorrent {
    name: string
    date: string
    size: number
    formattedSize: string
    seeders: number
    leechers: number
    downloadCount: number
    link: string
    downloadUrl?: string
    magnetLink?: string
    infoHash?: string
    resolution?: string
    isBatch?: boolean
    episodeNumber: number
    releaseGroup?: string
    isBestRelease: boolean
    confirmed: boolean
}

// AnimeTosho API response type
type ToshoTorrent = {
    id: number
    title: string
    link: string
    timestamp: number
    status: string
    tosho_id?: number
    nyaa_id?: number
    nyaa_subdom?: any
    anidex_id?: number
    torrent_url: string
    info_hash: string
    info_hash_v2?: string
    magnet_uri: string
    seeders: number
    leechers: number
    torrent_download_count: number
    tracker_updated?: any
    nzb_url?: string
    total_size: number
    num_files: number
    anidb_aid: number
    anidb_eid: number
    anidb_fid: number
    article_url: string
    article_title: string
    website_url: string
}

// Main Provider Class
class Provider {
    api = "https://feed.animetosho.org/json"

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query"],
            supportsAdult: false,
            type: "main",
        }
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const query = `?q=${encodeURIComponent(opts.query)}&only_tor=1`
        console.log("AnimeTosho Custom search query:", query)
        const torrents = await this.fetchTorrents(query)
        return torrents.map(t => this.toAnimeTorrent(t))
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        const ret: AnimeTorrent[] = []

        // Handle batch search
        if (opts.batch) {
            if (!opts.anidbAID) return []
            
            let torrents = await this.searchByAID(opts.anidbAID, opts.resolution)
            
            // Filter for batches (multiple files) unless it's a movie or single episode
            if (!(opts.media.format == "MOVIE" || opts.media.episodeCount == 1)) {
                torrents = torrents.filter(t => t.num_files > 1)
            }
            
            for (const torrent of torrents) {
                const t = this.toAnimeTorrent(torrent)
                t.isBatch = true
                ret.push(t)
            }
            
            return ret
        }

        // Handle episode search
        if (!opts.anidbEID) return []
        
        const torrents = await this.searchByEID(opts.anidbEID, opts.resolution)
        
        for (const torrent of torrents) {
            ret.push(this.toAnimeTorrent(torrent))
        }
        
        return ret
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash || ""
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return torrent.magnetLink || ""
    }

    async getLatest(): Promise<AnimeTorrent[]> {
        const query = `?q=&only_tor=1`
        const torrents = await this.fetchTorrents(query)
        return torrents.map(t => this.toAnimeTorrent(t))
    }

    // Search by AniDB Anime ID
    async searchByAID(aid: number, quality: string): Promise<ToshoTorrent[]> {
        const q = encodeURIComponent(this.formatQualityQuery(quality))
        const query = `?qx=1&order=size-d&aid=${aid}&q=${q}`
        return this.fetchTorrents(query)
    }

    // Search by AniDB Episode ID
    async searchByEID(eid: number, quality: string): Promise<ToshoTorrent[]> {
        const q = encodeURIComponent(this.formatQualityQuery(quality))
        const query = `?qx=1&eid=${eid}&q=${q}`
        return this.fetchTorrents(query)
    }

    // Fetch torrents from AnimeTosho API
    async fetchTorrents(url: string): Promise<ToshoTorrent[]> {
        const furl = `${this.api}${url}`
        
        try {
            const response = await fetch(furl)
            
            if (!response.ok) {
                throw new Error(`Failed to fetch torrents, ${response.statusText}`)
            }
            
            const torrents: ToshoTorrent[] = await response.json()
            
            // AnimeTosho sometimes returns invalid seeder/leecher counts
            return torrents.map(t => {
                if (t.seeders > 30000) {
                    t.seeders = 0
                }
                if (t.leechers > 30000) {
                    t.leechers = 0
                }
                return t
            })
        } catch (error) {
            throw new Error(`Error fetching torrents: ${error}`)
        }
    }

    // Format quality/resolution query to exclude other resolutions
    formatQualityQuery(quality: string): string {
        if (quality === "") {
            return ""
        }
        
        // Remove 'p' suffix if present (e.g., "1080p" -> "1080")
        quality = quality.replace(/p$/, "")
        
        // Common resolutions
        const resolutions = ["480", "540", "720", "1080"]
        
        // Get all resolutions except the one we want
        const others = resolutions.filter(r => r !== quality)
        
        // Create exclusion strings (!"480" !"540")
        const othersStrs = others.map(r => `!"${r}"`)
        
        // Return query that includes desired resolution and excludes others
        return `("${quality}" ${othersStrs.join(" ")})`
    }

    // Helper function to detect language/dub from torrent name
    detectLanguage(title: string): { isDub: boolean, isSub: boolean, isMulti: boolean } {
        const lowerTitle = title.toLowerCase()
        
        const isDub = /\b(dub|dubbed|english dub)\b/i.test(title)
        const isMulti = /\b(dual audio|multi-audio|multi audio)\b/i.test(title)
        const isSub = !isDub && !isMulti // If not explicitly dub or multi, assume sub
        
        return { isDub, isSub, isMulti }
    }

    // Convert AnimeTosho torrent to AnimeTorrent format
    toAnimeTorrent(torrent: ToshoTorrent): AnimeTorrent {
        return {
            name: torrent.title,
            date: new Date(torrent.timestamp * 1000).toISOString(),
            size: torrent.total_size,
            formattedSize: "",
            seeders: torrent.seeders,
            leechers: torrent.leechers,
            downloadCount: torrent.torrent_download_count,
            link: torrent.link,
            downloadUrl: torrent.torrent_url,
            magnetLink: torrent.magnet_uri,
            infoHash: torrent.info_hash,
            resolution: "",
            isBatch: false,
            episodeNumber: -1,
            isBestRelease: false,
            confirmed: true,
        }
    }
}
