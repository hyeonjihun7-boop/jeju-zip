// Vercel 서버리스 함수: /api/spots?area=동쪽&indoor=true
// find_spots 결과에 지도용 좌표(lat, lon)를 이름으로 찾아 붙여서 돌려줍니다.
const fs = require("fs");
const path = require("path");
const { find_spots } = require("./tools");

const coords = Object.fromEntries(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "jeju_spots.json"), "utf-8")
  ).spots.map((s) => [s.name, { lat: s.lat, lon: s.lon }])
);

module.exports = (req, res) => {
  const { area, indoor } = req.query;
  const result = find_spots({
    area,
    indoor: indoor === undefined || indoor === "" ? undefined : indoor === "true",
  });
  if (result.error) return res.status(400).json(result);

  result.spots = result.spots.map((s) => ({ ...s, ...coords[s.name] }));
  return res.status(200).json(result);
};
