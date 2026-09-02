const qqAudioHostSuffixes = [
  "stream.qqmusic.qq.com",
  "music.tc.qq.com"
];

export function isAllowedQqAudioUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();

  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    qqAudioHostSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
    )
  );
}
