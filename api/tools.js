const fs = require("fs");
const path = require("path");

const AREAS = ["동쪽", "서쪽", "서귀포", "제주시"];
const MAX_RESULTS = 8;

const spots = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "jeju_spots.json"), "utf-8")
).spots;

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
];

const toolHandlers = { find_spots };

module.exports = { find_spots, toolDefinitions, toolHandlers };
