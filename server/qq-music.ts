import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type QqLoginStatus = {
  provider: "qq";
  loggedIn: boolean;
  hasCookie: boolean;
  userId?: string;
  nickname?: string;
  playbackKeyReady: boolean;
  message?: string;
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
const qqHeaders = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
  Origin: "https://y.qq.com",
  Referer: "https://y.qq.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
};

const qqQualityCandidates = [
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

  return readQqLoginStatusFromCookie(normalizedCookie);
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
  return readQqLoginStatusFromCookie(cookie);
}

export async function resolveQqPlayableUrl(
  rootDir: string,
  title: string,
  artist: string
): Promise<QqPlayableUrlResult> {
  const songs = await searchQqSongsWithFallback(title, artist, 6);
  const song = pickBestQqSong(songs, title, artist);

  if (!song) {
    return {
      provider: "qq",
      playable: false,
      reason: "not_found",
      message: "QQ 音乐未找到这首歌",
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

    if (songs.some((song) => normalize(song.name) === normalize(title))) {
      break;
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

function pickBestQqSong(
  songs: QqSongSearchResult[],
  title: string,
  artist: string
) {
  const titleKey = normalize(title);
  const artistKey = normalize(artist);

  return (
    songs.find(
      (song) =>
        normalize(song.name) === titleKey &&
        (!artistKey || normalize(song.artist).includes(artistKey))
    ) ??
    songs.find((song) => normalize(song.name).includes(titleKey) || titleKey.includes(normalize(song.name))) ??
    songs[0]
  );
}

function readQqLoginStatusFromCookie(cookie: string): QqLoginStatus {
  const obj = parseCookieString(cookie);
  const userId = qqCookieUin(obj);
  const musicKey = qqCookieMusicKey(obj);
  const playbackKey = qqCookiePlaybackKey(obj);

  return {
    provider: "qq",
    loggedIn: !!(userId && musicKey),
    hasCookie: !!cookie.trim(),
    userId,
    nickname: qqCookieNickname(obj, userId) || (userId ? `QQ ${userId}` : undefined),
    playbackKeyReady: !!(userId && playbackKey)
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
  const raw =
    Number(obj.login_type) === 2
      ? obj.wxuin || obj.uin || obj.p_uin
      : obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin;

  return normalizeQqUin(raw);
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

function qqCookieNickname(obj: Record<string, string>, uin: string) {
  const padded = uin ? `0${uin}` : "";
  const keys = [
    uin ? `ptnick_${uin}` : "",
    padded ? `ptnick_${padded}` : "",
    "ptnick",
    "nick",
    "nickname",
    "qq_nickname"
  ].filter(Boolean);

  for (const key of keys) {
    if (obj[key]) {
      return decodeCookieValue(obj[key]);
    }
  }

  return "";
}

function normalizeQqUin(raw: string | undefined) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20")).trim();
  } catch {
    return value.trim();
  }
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
