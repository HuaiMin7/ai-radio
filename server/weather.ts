export type WeatherSnapshot =
  | {
      status: "configured";
      provider: "qweather";
      location: string;
      observedAt: string;
      text: string;
      temperature: string;
      feelsLike: string;
      humidity: string;
      windDirection: string;
      windScale: string;
    }
  | {
      status: "not-configured";
      provider: "qweather";
      message: string;
    };

type QWeatherNowResponse = {
  code?: string;
  updateTime?: string;
  now?: {
    text?: string;
    temp?: string;
    feelsLike?: string;
    humidity?: string;
    windDir?: string;
    windScale?: string;
  };
};

export async function getWeatherSnapshot(): Promise<WeatherSnapshot> {
  const apiKey = process.env.AI_RADIO_QWEATHER_API_KEY;
  const token = process.env.AI_RADIO_QWEATHER_TOKEN;
  const location = process.env.AI_RADIO_QWEATHER_LOCATION;
  const host = process.env.AI_RADIO_QWEATHER_HOST ?? "https://api.qweather.com";

  if ((!apiKey && !token) || !location) {
    return {
      status: "not-configured",
      provider: "qweather",
      message: "未配置和风天气 API Key / Token 或 location"
    };
  }

  const url = new URL("/v7/weather/now", host);
  url.searchParams.set("location", location);

  const headers: Record<string, string> = apiKey
    ? { "X-QW-Api-Key": apiKey }
    : { Authorization: `Bearer ${token}` };

  const response = await fetch(url, {
    headers
  });

  if (!response.ok) {
    return {
      status: "not-configured",
      provider: "qweather",
      message: `和风天气请求失败：${response.status}，请检查 API Host、API Key 和已启用 API`
    };
  }

  const data = (await response.json()) as QWeatherNowResponse;

  if (data.code !== "200" || !data.now) {
    return {
      status: "not-configured",
      provider: "qweather",
      message: `和风天气返回异常：${data.code ?? "unknown"}，请检查 location 和 API 权限`
    };
  }

  return {
    status: "configured",
    provider: "qweather",
    location,
    observedAt: data.updateTime ?? new Date().toISOString(),
    text: data.now.text ?? "未知",
    temperature: data.now.temp ?? "未知",
    feelsLike: data.now.feelsLike ?? "未知",
    humidity: data.now.humidity ?? "未知",
    windDirection: data.now.windDir ?? "未知",
    windScale: data.now.windScale ?? "未知"
  };
}

export function getLocalTimeSnapshot() {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return {
    iso: now.toISOString(),
    timeZone,
    localDate: new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "full",
      timeZone
    }).format(now),
    localTime: new Intl.DateTimeFormat("zh-CN", {
      timeStyle: "medium",
      hour12: false,
      timeZone
    }).format(now)
  };
}
