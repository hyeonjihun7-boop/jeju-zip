const fs = require("fs");
const path = require("path");

const AREAS = ["동쪽", "서쪽", "서귀포", "제주시"];
const MAX_RESULTS = 8;

const jeju = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "jeju_spots.json"), "utf-8")
);
const spots = jeju.spots;

// 장소 이름 -> 지도용 좌표
const spotCoords = Object.fromEntries(
  spots.map((s) => [s.name, { lat: s.lat, lon: s.lon }])
);

function find_spots({ area, indoor } = {}) {
  if (!AREAS.includes(area)) {
    return { error: `area는 ${AREAS.join(" · ")} 중 하나여야 합니다.` };
  }

  const found = spots
    .filter((s) => (s.areas ?? [s.area]).includes(area))
    .filter((s) => indoor === undefined || s.indoor === indoor)
    .slice(0, MAX_RESULTS)
    .map((s) => ({
      name: s.name,
      areas: s.areas ?? [s.area],
      indoor: s.indoor,
      desc: s.desc,
    }));

  return { count: found.length, spots: found };
}

// Open-Meteo 날씨 코드(WMO) -> 한글 설명
function weatherText(code) {
  if (code === 0) return "맑음";
  if (code <= 3) return "구름 많음";
  if (code <= 48) return "안개";
  if (code <= 57) return "이슬비";
  if (code <= 67) return "비";
  if (code <= 77) return "눈";
  if (code <= 82) return "소나기";
  if (code <= 86) return "눈소나기";
  return "뇌우";
}

// 비·눈·소나기·뇌우 계열 코드면 야외 활동이 어렵다고 본다
const isWet = (code) => code >= 51;

async function get_weather({ area, days = 3 } = {}) {
  if (!AREAS.includes(area)) {
    return { error: `area는 ${AREAS.join(" · ")} 중 하나여야 합니다.` };
  }
  const n = Math.min(7, Math.max(1, Math.round(Number(days)) || 3));
  const [lat, lon] = jeju.areas[area];

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,precipitation,weather_code,wind_speed_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min," +
    "precipitation_probability_max,precipitation_sum" +
    `&timezone=Asia%2FSeoul&forecast_days=${n}`;

  let data;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { error: `날씨 서버 오류 (${r.status})` };
    data = await r.json();
  } catch (e) {
    return { error: "날씨를 불러오지 못했습니다." };
  }

  const d = data.daily;
  return {
    area,
    now: {
      weather: weatherText(data.current.weather_code),
      tempC: data.current.temperature_2m,
      windKmh: data.current.wind_speed_10m,
      rainMm: data.current.precipitation,
    },
    daily: d.time.map((date, i) => ({
      date,
      weather: weatherText(d.weather_code[i]),
      outdoorOk: !isWet(d.weather_code[i]),
      maxC: d.temperature_2m_max[i],
      minC: d.temperature_2m_min[i],
      rainChancePct: d.precipitation_probability_max[i],
      rainMm: d.precipitation_sum[i],
    })),
  };
}

const toolDefinitions = [
  {
    name: "find_spots",
    description:
      "제주 관광지 목록(jeju_spots.json)에서 지역과 실내 여부로 장소를 찾아 최대 8곳을 돌려준다. " +
      "목록 밖 장소는 없다: 결과에 없는 장소는 추천하거나 지어내지 말고, 결과가 없으면 없다고 답한다.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: AREAS,
          description: "찾을 지역",
        },
        indoor: {
          type: "boolean",
          description:
            "true면 실내만, false면 야외만. 생략하면 실내·야외 모두.",
        },
      },
      required: ["area"],
    },
  },
  {
    name: "get_weather",
    description:
      "제주 지역(동쪽 · 서쪽 · 서귀포 · 제주시)의 현재 날씨와 일별 예보(기온 · 강수확률 · 강수량)를 Open-Meteo에서 가져온다. " +
      "날짜별 outdoorOk가 false면 비나 눈이 와서 야외 활동이 어렵다는 뜻이다. " +
      "제주 4개 지역만 조회할 수 있다.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: AREAS,
          description: "날씨를 볼 지역",
        },
        days: {
          type: "integer",
          minimum: 1,
          maximum: 7,
          description: "오늘 포함 며칠치 예보를 볼지. 생략하면 3.",
        },
      },
      required: ["area"],
    },
  },
];

const toolHandlers = { find_spots, get_weather };

module.exports = {
  find_spots,
  get_weather,
  toolDefinitions,
  toolHandlers,
  spotCoords,
};
