import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type QqLoginStatus = {
  provider: "qq";
  loggedIn: boolean;
  hasCookie: boolean;
  userId?: string;
  nickname?: string;
  avatarUrl?: string;
  playbackKeyReady: boolean;
  profileSource?: "qq-profile" | "fallback";
  message?: string;
};

type QqProfileResponse = {
  code?: number;
  result?: number;
  data?: unknown;
  profile?: unknown;
  creator?: unknown;
};

export type QqSongSearchResult = {
  id: string;
  mid: string;
  songmid: string;
  mediaMid?: string;
  name: string;
  artist: string;
  album?: string;
  externalUrl?: string;
  coverUrl?: string;
};

export type QqLyricLine = {
  time: number;
  text: string;
};

export type QqLyricsResult = {
  provider: "qq" | "lrclib";
  songMid?: string;
  matchedTitle: string;
  matchedArtist: string;
  lines: QqLyricLine[];
};

export type QqPlayableUrlResult =
  | {
      provider: "qq";
      playable: true;
      url: string;
      matchedTitle: string;
      matchedArtist: string;
      externalUrl?: string;
      coverUrl?: string;
      quality: string;
    }
  | {
      provider: "qq";
      playable: false;
      matchedTitle?: string;
      matchedArtist?: string;
      externalUrl?: string;
      coverUrl?: string;
      reason: string;
      message: string;
      playbackKeyReady: boolean;
      qqCode?: string | number;
    };

type QqMusicuResponse = {
  req_0?: {
    data?: {
      sip?: string[];
      midurlinfo?: Array<{
        purl?: string;
        filename?: string;
        result?: number;
        code?: number;
        errtype?: string | number;
        msg?: string;
        tips?: string;
        errmsg?: string;
      }>;
    };
  };
  songinfo?: {
    data?: {
      track_info?: QqRawTrack;
    };
  };
};

type QqRawTrack = {
  id?: number;
  mid?: string;
  name?: string;
  title?: string;
  singer?: Array<{ id?: number; mid?: string; name?: string }>;
  album?: { mid?: string; pmid?: string; name?: string; title?: string };
  file?: { media_mid?: string };
};

const qqMusicuUrl = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const qqSmartboxUrl = "https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg";
const qqLyricUrl = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg";
const lrcLibSearchUrl = "https://lrclib.net/api/search";
const qqHeaders = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
  Origin: "https://y.qq.com",
  Referer: "https://y.qq.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
};

const qqQualityCandidates = [
  { prefix: "F000", ext: ".flac", label: "Lossless FLAC" },
  { prefix: "M800", ext: ".mp3", label: "320k MP3" },
  { prefix: "M500", ext: ".mp3", label: "128k MP3" },
  { prefix: "C400", ext: ".m4a", label: "AAC/M4A" }
];

export async function saveQqCookie(rootDir: string, cookieText: string) {
  const normalizedCookie = normalizeQqCookieInput(cookieText);
  const status = readQqLoginStatusFromCookie(normalizedCookie);

  if (!status.loggedIn) {
    return {
      ...status,
      message: "QQ Cookie 缺少 uin 或登录票据"
    };
  }

  const path = getQqCookiePath(rootDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${normalizedCookie}\n`, "utf8");

  return getQqLoginStatus(rootDir);
}

export async function clearQqCookie(rootDir: string) {
  try {
    await unlink(getQqCookiePath(rootDir));
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  return getQqLoginStatus(rootDir);
}

export async function getQqLoginStatus(rootDir: string): Promise<QqLoginStatus> {
  const cookie = await readQqCookie(rootDir);
  const fallback = readQqLoginStatusFromCookie(cookie);

  if (!fallback.loggedIn || !fallback.userId) {
    return fallback;
  }

  const profile = await fetchQqProfile(cookie, fallback.userId);
  if (!profile) {
    return fallback;
  }

  return {
    ...fallback,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl || fallback.avatarUrl,
    profileSource: "qq-profile"
  };
}

async function fetchQqProfile(cookie: string, userId: string) {
  const url = new URL("https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg");
  url.searchParams.set("cid", "205360838");
  url.searchParams.set("userid", userId);
  url.searchParams.set("reqfrom", "1");
  url.searchParams.set("g_tk", "5381");
  url.searchParams.set("loginUin", userId);
  url.searchParams.set("hostUin", "0");
  url.searchParams.set("format", "json");
  url.searchParams.set("inCharset", "utf8");
  url.searchParams.set("outCharset", "utf-8");
  url.searchParams.set("notice", "0");
  url.searchParams.set("platform", "yqq.json");
  url.searchParams.set("needNewCode", "0");

  try {
    const response = await fetch(url, {
      headers: {
        ...qqHeaders,
        Cookie: cookie
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!response.ok) return null;

    const body = parseJsonText(await response.text()) as QqProfileResponse;
    if (body.code === 1000 || body.result === 301) return null;

    return readQqProfile(body);
  } catch {
    return null;
  }
}

function readQqProfile(body: QqProfileResponse) {
  const root = asQqProfileObject(body);
  const data = asQqProfileObject(root.data ?? root.profile ?? root.creator ?? root);
  const creator = asQqProfileObject(data.creator ?? data.user ?? data.profile ?? data);
  const nickname = firstQqProfileString(
    creator.nick,
    creator.nickname,
    creator.name,
    creator.hostname,
    creator.title
  );

  if (!nickname) return null;

  return {
    nickname,
    avatarUrl: firstQqProfileString(
      creator.headpic,
      creator.avatar,
      creator.avatarUrl,
      creator.logo
    )
  };
}

function asQqProfileObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstQqProfileString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function resolveQqPlayableUrl(
  rootDir: string,
  title: string,
  artist: string
): Promise<QqPlayableUrlResult> {
  const songs = await searchQqSongsWithFallback(title, artist, 6);
  const rankedSongs = rankQqSongs(songs, title, artist);
  const song = rankedSongs[0];

  if (!song) {
    return {
      provider: "qq",
      playable: false,
      reason: "not_found",
      message: "QQ 音乐未找到这首歌",
      playbackKeyReady: (await getQqLoginStatus(rootDir)).playbackKeyReady
    };
  }

  let firstFailure: QqPlayableUrlResult | null = null;
  let checkedCandidateCount = 0;

  for (const candidate of rankedSongs) {
    if (!isAcceptableQqSongCandidate(candidate, title, artist)) {
      continue;
    }

    checkedCandidateCount += 1;
    const result = await resolveQqSongUrl(rootDir, candidate);

    if (result.playable) {
      return result;
    }

    firstFailure ??= result;
  }

  if (firstFailure) {
    return firstFailure;
  }

  if (checkedCandidateCount === 0) {
    return {
      provider: "qq",
      playable: false,
      matchedTitle: song.name,
      matchedArtist: song.artist,
      externalUrl: song.externalUrl,
      coverUrl: song.coverUrl,
      reason: "not_found",
      message: "QQ 音乐未找到歌名和歌手都匹配的版本",
      playbackKeyReady: (await getQqLoginStatus(rootDir)).playbackKeyReady
    };
  }

  return resolveQqSongUrl(rootDir, song);
}

async function searchQqSongsWithFallback(
  title: string,
  artist: string,
  limit: number
) {
  const queries = buildQqSearchQueries(title, artist);
  const seenSongKeys = new Set<string>();
  const songs: QqSongSearchResult[] = [];

  for (const query of queries) {
    const results = await searchQqSongs(query, limit);

    for (const song of results) {
      const key = song.mid || `${song.name}::${song.artist}`;

      if (seenSongKeys.has(key)) {
        continue;
      }

      seenSongKeys.add(key);
      songs.push(song);
    }

  }

  return songs;
}

function buildQqSearchQueries(title: string, artist: string) {
  const cleanTitle = stripDiacritics(title).trim();
  const cleanArtist = stripDiacritics(artist).trim();
  const primaryArtist = cleanArtist.split(/\s*[\/,，、&]\s*/).find(Boolean) ?? "";
  const queries = [
    `${cleanTitle} ${cleanArtist}`.trim(),
    `${cleanTitle} ${primaryArtist}`.trim(),
    cleanTitle
  ];
  const seenQueries = new Set<string>();

  return queries.filter((query) => {
    const key = normalize(query);

    if (!key || seenQueries.has(key)) {
      return false;
    }

    seenQueries.add(key);
    return true;
  });
}

export async function searchQqSongs(
  keywords: string,
  limit = 6
): Promise<QqSongSearchResult[]> {
  const searchText = keywords.trim();

  if (!searchText) {
    return [];
  }

  const url = new URL(qqSmartboxUrl);
  url.searchParams.set("format", "json");
  url.searchParams.set("key", searchText);
  url.searchParams.set("g_tk", "5381");
  url.searchParams.set("loginUin", "0");
  url.searchParams.set("hostUin", "0");
  url.searchParams.set("inCharset", "utf8");
  url.searchParams.set("outCharset", "utf-8");
  url.searchParams.set("notice", "0");
  url.searchParams.set("platform", "yqq.json");
  url.searchParams.set("needNewCode", "0");

  const response = await fetch(url, { headers: qqHeaders });

  if (!response.ok) {
    throw new Error("QQ 音乐搜索失败");
  }

  const json = parseJsonText(await response.text()) as {
    data?: { song?: { itemlist?: Array<Record<string, unknown>> } };
  };
  const items = json.data?.song?.itemlist ?? [];
  const baseSongs = items
    .slice(0, Math.max(1, Math.min(limit, 10)))
    .map(mapQqSmartSong)
    .filter((song) => song.name && song.mid);

  return Promise.all(
    baseSongs.map(async (song) => {
      try {
        return await getQqSongDetail(song.mid, song);
      } catch {
        return song;
      }
    })
  );
}

export async function resolveQqLyrics(
  title: string,
  artist: string,
  requestedSongMid = "",
  duration = 0
): Promise<QqLyricsResult> {
  const songMid = requestedSongMid.trim();
  let song: QqSongSearchResult | undefined;

  if (songMid) {
    const fallbackSong: QqSongSearchResult = {
      id: songMid,
      mid: songMid,
      songmid: songMid,
      name: title,
      artist
    };

    try {
      song = await getQqSongDetail(songMid, fallbackSong);
    } catch {
      song = fallbackSong;
    }
  } else {
    const songs = await searchQqSongsWithFallback(title, artist, 6);
    const rankedSongs = rankQqSongs(songs, title, artist);
    song =
      rankedSongs.find((candidate) =>
        isAcceptableQqSongCandidate(candidate, title, artist)
      ) ?? rankedSongs[0];
  }

  if (!song?.mid) {
    return {
      provider: "qq",
      matchedTitle: title,
      matchedArtist: artist,
      lines: []
    };
  }

  const url = new URL(qqLyricUrl);
  url.searchParams.set("songmid", song.mid);
  url.searchParams.set("format", "json");
  url.searchParams.set("nobase64", "1");
  url.searchParams.set("g_tk", "5381");
  url.searchParams.set("loginUin", "0");
  url.searchParams.set("hostUin", "0");
  url.searchParams.set("inCharset", "utf8");
  url.searchParams.set("outCharset", "utf-8");
  url.searchParams.set("notice", "0");
  url.searchParams.set("platform", "yqq.json");
  url.searchParams.set("needNewCode", "0");

  const response = await fetch(url, { headers: qqHeaders });

  if (!response.ok) {
    throw new Error("QQ 音乐歌词请求失败");
  }

  const json = parseJsonText(await response.text()) as { lyric?: string };

  const matchedTitle = song.name || title;
  const matchedArtist = song.artist || artist;
  const qqLines = parseQqLrc(json.lyric ?? "", matchedTitle, matchedArtist);
  const fallbackLines = qqLines.length
    ? []
    : await resolveLrcLibLyrics(matchedTitle, matchedArtist, duration);

  return {
    provider: fallbackLines.length ? "lrclib" : "qq",
    songMid: song.mid,
    matchedTitle,
    matchedArtist,
    lines: qqLines.length ? qqLines : fallbackLines
  };
}

export function parseQqLrc(lyric: string, title = "", artist = "") {
  const offsetMatch = lyric.match(/\[offset:([+-]?\d+)]/i);
  const offsetSeconds = Number(offsetMatch?.[1] ?? 0) / 1000;
  const lines: QqLyricLine[] = [];

  for (const rawLine of lyric.split(/\r?\n/)) {
    const timestamps = [
      ...rawLine.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)]/g)
    ];
    const text = decodeQqLyricText(
      rawLine.replace(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)]/g, "")
    ).trim();

    if (!timestamps.length || !text || isQqLyricMetadata(text, title, artist)) {
      continue;
    }

    for (const timestamp of timestamps) {
      const time = Number(timestamp[1]) * 60 + Number(timestamp[2]) + offsetSeconds;

      if (Number.isFinite(time) && time >= 0) {
        lines.push({ time, text });
      }
    }
  }

  return lines
    .sort((left, right) => left.time - right.time)
    .filter(
      (line, index, allLines) =>
        index === 0 ||
        line.time !== allLines[index - 1].time ||
        line.text !== allLines[index - 1].text
    );
}

function isQqLyricMetadata(text: string, title: string, artist: string) {
  const normalizedText = normalize(text.replace(/\s*[-–—]\s*/g, " "));
  const titleKey = normalizeSearchValue(title);
  const artistKey = normalizeSearchValue(artist);

  if (
    titleKey &&
    artistKey &&
    normalizedText.includes(titleKey) &&
    normalizedText.includes(artistKey)
  ) {
    return true;
  }

  return /^(作?词|作?曲|编曲|制作人?|监制|录音|混音|母带|吉他|贝斯|鼓|和声|配唱|原唱|演唱|op|sp)\s*[:：]/i.test(
    text
  );
}

function decodeQqLyricText(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

async function resolveLrcLibLyrics(title: string, artist: string, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [];
  }

  const url = new URL(lrcLibSearchUrl);
  url.searchParams.set("track_name", title);
  url.searchParams.set("artist_name", artist);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Redio/0.1 (local development)"
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!response.ok) {
      return [];
    }

    const records = (await response.json()) as Array<{
      trackName?: string;
      artistName?: string;
      duration?: number;
      syncedLyrics?: string | null;
    }>;
    const titleKey = normalize(stripDiacritics(title));
    const artistKey = normalize(stripDiacritics(artist));
    const matchingRecord = records
      .filter((record) => {
        if (!record.syncedLyrics || !Number.isFinite(record.duration)) {
          return false;
        }

        const recordTitle = normalize(stripDiacritics(record.trackName ?? ""));
        const recordArtist = normalize(stripDiacritics(record.artistName ?? ""));

        return (
          recordTitle === titleKey &&
          (recordArtist === artistKey ||
            recordArtist.includes(artistKey) ||
            artistKey.includes(recordArtist)) &&
          Math.abs((record.duration ?? 0) - duration) <= 5
        );
      })
      .sort(
        (left, right) =>
          Math.abs((left.duration ?? 0) - duration) -
          Math.abs((right.duration ?? 0) - duration)
      )[0];

    return matchingRecord?.syncedLyrics
      ? parseQqLrc(matchingRecord.syncedLyrics, title, artist)
      : [];
  } catch {
    return [];
  }
}

async function resolveQqSongUrl(
  rootDir: string,
  song: QqSongSearchResult
): Promise<QqPlayableUrlResult> {
  const cookie = await readQqCookie(rootDir);
  const cookieObj = parseCookieString(cookie);
  const uin = qqCookieUin(cookieObj) || "0";
  const musicKey = qqCookieMusicKey(cookieObj);
  const playbackKey = qqCookiePlaybackKey(cookieObj);
  const guid = String(10000000 + Math.floor(Math.random() * 90000000));
  const mediaIds = [song.mediaMid, song.mid].filter(
    (value, index, values): value is string =>
      typeof value === "string" && value.length > 0 && values.indexOf(value) === index
  );
  const candidates = mediaIds.flatMap((mediaId) =>
    qqQualityCandidates.map((candidate) => ({
      ...candidate,
      filename: `${candidate.prefix}${mediaId}${candidate.ext}`
    }))
  );
  const payload = {
    comm: {
      uin,
      format: "json",
      ct: musicKey ? 19 : 24,
      cv: 0,
      ...(musicKey ? { authst: musicKey } : {})
    },
    req_0: {
      module: "vkey.GetVkeyServer",
      method: "CgiGetVkey",
      param: {
        guid,
        songmid: candidates.map(() => song.mid),
        songtype: candidates.map(() => 0),
        uin,
        loginflag: 1,
        platform: "20",
        filename: candidates.map((candidate) => candidate.filename)
      }
    }
  };
  const json = await qqMusicRequest(payload, cookie);
  const data = json.req_0?.data;
  const infos = data?.midurlinfo ?? [];
  const infoWithUrl = infos.find((info) => info.purl);

  if (infoWithUrl?.purl) {
    const sip = data?.sip?.[0] ?? "https://ws.stream.qqmusic.qq.com/";
    const quality =
      candidates.find((candidate) => candidate.filename === infoWithUrl.filename)?.label ??
      infoWithUrl.filename ??
      "QQ 音乐";

    return {
      provider: "qq",
      playable: true,
      url: `${sip}${infoWithUrl.purl}`,
      matchedTitle: song.name,
      matchedArtist: song.artist,
      externalUrl: song.externalUrl,
      coverUrl: song.coverUrl,
      quality
    };
  }

  const firstInfo = infos[0];
  const qqCode = firstInfo?.result ?? firstInfo?.code ?? firstInfo?.errtype;
  const rawMessage = firstInfo?.msg ?? firstInfo?.tips ?? firstInfo?.errmsg ?? "";
  const status = readQqLoginStatusFromCookie(cookie);
  const reason = status.playbackKeyReady ? "unavailable" : "login_required";

  return {
    provider: "qq",
    playable: false,
    matchedTitle: song.name,
    matchedArtist: song.artist,
    externalUrl: song.externalUrl,
    coverUrl: song.coverUrl,
    reason,
    message: status.playbackKeyReady
      ? rawMessage || "QQ 音乐没有返回可播放地址，可能是版权、会员或地区限制"
      : "QQ 音乐播放授权不完整，需要重新导入包含 qm_keyst / qqmusic_key / music_key / wxskey 的 Cookie",
    playbackKeyReady: !!(uin && playbackKey),
    qqCode
  };
}

async function getQqSongDetail(mid: string, fallback: QqSongSearchResult) {
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    songinfo: {
      module: "music.pf_song_detail_svr",
      method: "get_song_detail_yqq",
      param: { song_mid: mid }
    }
  });
  const track = json.songinfo?.data?.track_info;

  return track ? mapQqTrack(track, fallback) : fallback;
}

async function qqMusicRequest(payload: unknown, cookie?: string) {
  const response = await fetch(qqMusicuUrl, {
    method: "POST",
    headers: {
      ...qqHeaders,
      "Content-Type": "application/json;charset=UTF-8",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("QQ 音乐接口请求失败");
  }

  return parseJsonText(await response.text()) as QqMusicuResponse;
}

function mapQqSmartSong(item: Record<string, unknown>): QqSongSearchResult {
  const mid = String(item.mid ?? item.songmid ?? item.id ?? "");
  const name = String(item.name ?? item.title ?? "");
  const artist = String(item.singer ?? "");

  return {
    id: mid,
    mid,
    songmid: mid,
    name,
    artist,
    externalUrl: mid ? `https://y.qq.com/n/ryqq/songDetail/${mid}` : undefined
  };
}

function mapQqTrack(track: QqRawTrack, fallback: QqSongSearchResult): QqSongSearchResult {
  const mid = track.mid || fallback.mid;
  const artists = (track.singer ?? []).map((singer) => singer.name).filter(Boolean);
  const album = track.album ?? {};
  const albumMid = album.pmid || album.mid;

  return {
    id: mid,
    mid,
    songmid: mid,
    mediaMid: track.file?.media_mid,
    name: track.name || track.title || fallback.name,
    artist: artists.join(" / ") || fallback.artist,
    album: album.name || album.title || fallback.album,
    externalUrl: mid ? `https://y.qq.com/n/ryqq/songDetail/${mid}` : fallback.externalUrl,
    coverUrl: albumMid ? buildQqCoverUrl(albumMid) : fallback.coverUrl
  };
}

function buildQqCoverUrl(albumMid: string) {
  return `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg`;
}

function rankQqSongs(
  songs: QqSongSearchResult[],
  title: string,
  artist: string
) {
  const titleKey = normalize(title);
  const artistKey = normalize(artist);

  return [...songs].sort((left, right) => {
    return (
      scoreQqSong(right, titleKey, artistKey) -
      scoreQqSong(left, titleKey, artistKey)
    );
  });
}

function scoreQqSong(song: QqSongSearchResult, titleKey: string, artistKey: string) {
  const songTitle = normalizeSearchValue(song.name);
  const songArtist = normalizeSearchValue(song.artist);
  let score = 0;

  if (songTitle === titleKey) {
    score += 100;
  } else if (songTitle.includes(titleKey) || titleKey.includes(songTitle)) {
    score += 60;
  }

  if (artistKey && songArtist.includes(artistKey)) {
    score += 40;
  }

  if (song.mediaMid) {
    score += 5;
  }

  return score;
}

function isAcceptableQqSongCandidate(
  song: QqSongSearchResult,
  title: string,
  artist: string
) {
  const titleKey = normalizeSearchValue(title);
  const artistKey = normalizeSearchValue(artist);
  const songTitle = normalizeSearchValue(song.name);
  const songArtist = normalizeSearchValue(song.artist);
  const titleMatches =
    songTitle === titleKey ||
    ((songTitle.includes(titleKey) || titleKey.includes(songTitle)) &&
      artistKey &&
      isArtistMatch(songArtist, artistKey));

  if (!titleMatches) {
    return false;
  }

  return !artistKey || isArtistMatch(songArtist, artistKey);
}

function isArtistMatch(candidateArtist: string, requestedArtist: string) {
  if (!requestedArtist) {
    return true;
  }

  return (
    candidateArtist === requestedArtist ||
    candidateArtist.includes(requestedArtist) ||
    requestedArtist.includes(candidateArtist)
  );
}

function readQqLoginStatusFromCookie(cookie: string): QqLoginStatus {
  const obj = parseCookieString(cookie);
  const userId = qqCookieUin(obj);
  const playbackKey = qqCookiePlaybackKey(obj);

  return {
    provider: "qq",
    loggedIn: !!userId,
    hasCookie: !!cookie.trim(),
    userId,
    nickname: userId ? `QQ ${userId}` : undefined,
    avatarUrl: userId ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(userId)}&s=100` : undefined,
    playbackKeyReady: !!(userId && playbackKey),
    profileSource: userId ? "fallback" : undefined
  };
}

function normalizeQqCookieInput(cookieText: string) {
  const obj = parseCookieString(cookieText);

  if (Number(obj.login_type) === 2 && obj.wxuin && !obj.uin) {
    obj.uin = obj.wxuin;
  }

  if (!obj.uin && (obj.qqmusic_uin || obj.p_uin)) {
    obj.uin = obj.qqmusic_uin || obj.p_uin;
  }

  if (obj.uin) {
    obj.uin = normalizeQqUin(obj.uin);
  }

  return serializeCookieObject(obj);
}

function parseCookieString(cookieText: string) {
  const out: Record<string, string> = {};

  for (const part of cookieText.split(";")) {
    const raw = part.trim();

    if (!raw) {
      continue;
    }

    const index = raw.indexOf("=");

    if (index <= 0) {
      continue;
    }

    out[raw.slice(0, index).trim()] = raw.slice(index + 1).trim();
  }

  return out;
}

function serializeCookieObject(obj: Record<string, string>) {
  return Object.entries(obj)
    .filter(([key, value]) => key && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function qqCookieUin(obj: Record<string, string>) {
  const candidates =
    Number(obj.login_type) === 2
      ? [obj.wxuin, obj.uin, obj.qqmusic_uin, obj.p_uin]
      : [obj.uin, obj.qqmusic_uin, obj.wxuin, obj.p_uin];

  for (const candidate of candidates) {
    const normalized = normalizeQqUin(candidate);
    if (normalized) return normalized;
  }

  return "";
}

function qqCookieMusicKey(obj: Record<string, string>) {
  return (
    obj.qm_keyst ||
    obj.qqmusic_key ||
    obj.music_key ||
    obj.p_skey ||
    obj.skey ||
    obj.psrf_qqaccess_token ||
    obj.psrf_qqrefresh_token ||
    obj.wxrefresh_token ||
    obj.wxskey ||
    ""
  );
}

function qqCookiePlaybackKey(obj: Record<string, string>) {
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || "";
}

function normalizeQqUin(raw: string | undefined) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return /^0+$/.test(digits) ? "" : digits.replace(/^0+/, "");
}

function parseJsonText(text: string) {
  const raw = text.trim();
  const json = raw.replace(/^callback\(([\s\S]*)\);?$/, "$1");
  return JSON.parse(json) as unknown;
}

async function readQqCookie(rootDir: string) {
  try {
    return (await readFile(getQqCookiePath(rootDir), "utf8")).trim();
  } catch (error) {
    if (isMissingFileError(error)) {
      return "";
    }

    throw error;
  }
}

function getQqCookiePath(rootDir: string) {
  return join(rootDir, "data", "qq-cookie.txt");
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSearchValue(value: string) {
  return normalize(stripDiacritics(value))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
