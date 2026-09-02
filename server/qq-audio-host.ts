const qqAudioHostSuffixes = [
  "stream.qqmusic.qq.com",
  "music.tc.qq.com"
];
const qqAudioHosts = new Set(["aqqmusic.tc.qq.com"]);

export function isAllowedQqAudioUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();

  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    (qqAudioHosts.has(hostname) ||
      qqAudioHostSuffixes.some(
        (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
      ))
  );
}
