import { NextResponse } from "next/server"
import { cached, TTL } from "@/lib/redis"

export const runtime = "nodejs"
export const revalidate = 0

const SITE_BASE = "https://komik7.my.id"

interface Genre {
  id: number
  name: string
  slug: string
  count: number
}

// Genre valid yang umum ada di komik7
const GENRE_SLUGS = new Set([
  "action","adventure","comedy","drama","fantasy","horror","mystery",
  "romance","sci-fi","science-fiction","slice-of-life","supernatural",
  "thriller","historical","martial-arts","sports","school","harem",
  "isekai","shounen","shoujo","seinen","josei","mecha","music",
  "psychological","tragedy","yaoi","yuri","ecchi","mature",
  "gender-bender","magic","demons","vampires","zombies","military",
  "police","crime","game","survival","time-travel","reincarnation",
  "villainess","reverse-harem","full-color","long-strip","webtoon",
  "cooking","medical","office","political","racing","samurai",
  "space","vampire","wuxia","xianxia","cultivation","system",
  "overpowered","regression","returnee","dungeon","hunter",
])

function looksLikeGenre(name: string, slug: string): boolean {
  // Skip yang jelas judul komik: mengandung "komik", terlalu panjang, atau banyak kata
  const n = name.toLowerCase()
  const s = slug.toLowerCase()
  if (n.startsWith("komik ")) return false
  if (n.startsWith("baca ")) return false
  if (s.length > 25) return false
  if (name.split(" ").length > 4) return false
  // Slug harus di whitelist ATAU nama pendek (1-2 kata) yang tidak seperti judul
  if (GENRE_SLUGS.has(s)) return true
  // Nama 1-2 kata, huruf biasa, bukan kalimat
  if (name.split(" ").length <= 2 && name.length <= 20 && !/[,!?"]/.test(name)) return true
  return false
}

async function fetchGenres(): Promise<Genre[]> {
  // Ambil semua categories, page by page
  let page = 1
  const all: Genre[] = []

  while (true) {
    const res = await fetch(
      `${SITE_BASE}/wp-json/wp/v2/categories?per_page=100&page=${page}&_fields=id,name,slug,count&orderby=count&order=desc&hide_empty=true`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } }
    )
    if (!res.ok) break
    const data = await res.json() as Genre[]
    if (!data.length) break
    all.push(...data)
    if (data.length < 100) break
    page++
    if (page > 10) break
  }

  const SKIP = new Set(["uncategorized", "manga", "manhwa", "manhua"])

  const genres = all
    .filter(c => {
      if (SKIP.has(c.slug)) return false
      return looksLikeGenre(c.name, c.slug)
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return genres
}

export async function GET() {
  try {
    const genres = await cached("komiku:genres:v8", TTL.genres, fetchGenres)
    return NextResponse.json(genres)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
