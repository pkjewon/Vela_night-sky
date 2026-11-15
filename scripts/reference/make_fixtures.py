"""Skyfield로 정확도 테스트용 정답지(tests/fixtures/reference.json)를 만든다.

쓰는 법 (프로젝트 폴더에서):
    python -m venv .venv
    .venv/Scripts/python -m pip install -r scripts/reference/requirements.txt
    .venv/Scripts/python scripts/reference/make_fixtures.py

- 별의 J2000 좌표·고유운동은 앱과 같은 HYG v4.2 값(raw/hyg_v42.csv.gz)을 쓴다.
  (앱과 정답지가 같은 별 목록에서 출발해야 "계산 방식"만 비교할 수 있다.)
- 방위각·고도는 대기 굴절 없이 계산한다.
- 생성된 JSON은 저장소에 커밋해서 CI는 파이썬 없이 돈다.
- JPL 천체력 de421.bsp(약 17MB)는 raw/에 내려받는다.
"""
import csv
import gzip
import json
from pathlib import Path

from skyfield import almanac
from skyfield.api import Loader, Star, wgs84

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw"
OUT = ROOT / "tests" / "fixtures" / "reference.json"

LOCATIONS = [
    {"name": "파주", "lat": 37.76, "lon": 126.78},
    {"name": "서울", "lat": 37.5665, "lon": 126.978},
    {"name": "시드니", "lat": -33.8688, "lon": 151.2093},
    {"name": "레이캬비크", "lat": 64.1466, "lon": -21.9426},
    {"name": "싱가포르", "lat": 1.3521, "lon": 103.8198},
]

# 계절이 다른 날짜 + 2030년 하나 (UTC)
TIMES = [
    "2024-03-20T12:00:00Z",
    "2025-06-21T15:00:00Z",
    "2026-09-23T18:30:00Z",
    "2026-12-14T13:00:00Z",  # 한국 시간 22:00, 쌍둥이자리 유성우 무렵
    "2027-02-06T03:00:00Z",
    "2030-08-10T20:00:00Z",
]

# 밝은 별 20개 (HIP 번호). 북극성과 남쪽 하늘 별 포함.
STARS = [
    (32349, "Sirius"), (30438, "Canopus"), (69673, "Arcturus"), (71683, "Rigil Kentaurus"),
    (91262, "Vega"), (24608, "Capella"), (24436, "Rigel"), (37279, "Procyon"),
    (7588, "Achernar"), (27989, "Betelgeuse"), (97649, "Altair"), (60718, "Acrux"),
    (21421, "Aldebaran"), (65474, "Spica"), (80763, "Antares"), (113368, "Fomalhaut"),
    (102098, "Deneb"), (49669, "Regulus"), (11767, "Polaris"), (54061, "Dubhe"),
]

BODIES = {
    "sun": "sun",
    "moon": "moon",
    "mercury": "mercury",
    "venus": "venus",
    "mars": "mars",
    "jupiter": "jupiter barycenter",
    "saturn": "saturn barycenter",
}


def read_hyg(hips):
    """HYG에서 HIP 번호별 J2000 적경(도)·적위(도)·고유운동(mas/년)을 읽는다. 같은 HIP가 여러 줄이면 가장 밝은 것."""
    found = {}
    with gzip.open(RAW / "hyg_v42.csv.gz", "rt", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if not row["hip"]:
                continue
            hip = int(row["hip"])
            if hip not in hips:
                continue
            mag = float(row["mag"])
            if hip in found and found[hip]["mag"] <= mag:
                continue
            found[hip] = {
                "hip": hip,
                "ra_deg": float(row["ra"]) * 15.0,
                "dec_deg": float(row["dec"]),
                "pmra": float(row["pmra"]),
                "pmdec": float(row["pmdec"]),
                "mag": mag,
            }
    return found


def main():
    load = Loader(str(RAW))
    ts = load.timescale()
    eph = load("de421.bsp")
    earth = eph["earth"]

    hyg = read_hyg({h for h, _ in STARS})
    stars = []
    for hip, name in STARS:
        s = dict(hyg[hip])
        s["name"] = name
        stars.append(s)

    cases = []
    for li, loc in enumerate(LOCATIONS):
        site = earth + wgs84.latlon(loc["lat"], loc["lon"], elevation_m=0.0)
        for ti, iso in enumerate(TIMES):
            y, mo, d = int(iso[0:4]), int(iso[5:7]), int(iso[8:10])
            h, mi, sec = int(iso[11:13]), int(iso[14:16]), int(iso[17:19])
            t = ts.utc(y, mo, d, h, mi, sec)
            obs = site.at(t)

            star_out = []
            for s in stars:
                star = Star(
                    ra_hours=s["ra_deg"] / 15.0,
                    dec_degrees=s["dec_deg"],
                    ra_mas_per_year=s["pmra"],
                    dec_mas_per_year=s["pmdec"],
                )
                alt, az, _ = obs.observe(star).apparent().altaz()
                star_out.append([round(float(az.degrees), 5), round(float(alt.degrees), 5)])

            body_out = {}
            for key, target in BODIES.items():
                alt, az, _ = obs.observe(eph[target]).apparent().altaz()
                body_out[key] = [round(float(az.degrees), 5), round(float(alt.degrees), 5)]

            fraction = float(almanac.fraction_illuminated(eph, "moon", t))
            cases.append({
                "loc": li,
                "time": ti,
                "stars": star_out,
                "bodies": body_out,
                "moonFraction": round(fraction, 5),
            })

    out = {
        "meta": {
            "generator": "Skyfield + JPL DE421",
            "note": "방위각(북=0, 동=90)·고도, 도 단위, 대기 굴절 없음. 별 좌표는 HYG v4.2의 J2000 값 + 고유운동.",
        },
        "locations": LOCATIONS,
        "times": TIMES,
        "stars": [{k: s[k] for k in ("hip", "name", "ra_deg", "dec_deg", "pmra", "pmdec")} for s in stars],
        "cases": cases,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
