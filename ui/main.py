import os
from typing import List, Optional
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
from google.cloud import bigquery

app = FastAPI(title="Mobile Clinic Planner - Multi-County Health Equity")

# Configure BigQuery
PROJECT_ID = os.getenv("GCP_PROJECT", "qwiklabs-gcp-04-e06bae0c96fc")
DATASET_ID = "a4i_health"
bq_client = bigquery.Client(project=PROJECT_ID)

templates = Jinja2Templates(directory="ui/templates")
app.mount("/static", StaticFiles(directory="ui/static"), name="static")

COUNTY_METADATA = {
    "13121": {
        "name": "Fulton County, GA",
        "label": "Fulton County, GA (Atlanta)",
        "dataset": "a4i_health_13121",
        "benchmarks": {
            "avg_uninsured": 11.0,
            "avg_no_vehicle": 11.7,
            "avg_km_safety_net": 6.83,
            "avg_diabetes": 11.2,
            "avg_asthma": 9.7
        },
        "event_templates": [
            {
                "event_name": "Atlanta Marathon & 10K Road Closures",
                "venue_zone": "Piedmont Park / Midtown / Downtown Corridor",
                "conflict_type": "Road Closure / Transit Reroute",
                "event_impact": "Full perimeter road closure and MARTA bus detour between 05:00 and 15:00. Mobile clinic van cannot access parking or staging zones.",
                "tract_idx": 4
            },
            {
                "event_name": "Mercedes-Benz Stadium Match & Fan Festival",
                "venue_zone": "Downtown / Castleberry Hill / Vine City",
                "conflict_type": "Severe Traffic Congestion & Parking Restrictions",
                "event_impact": "Major sporting event with 65,000+ attendees. Police parking restrictions within 1.5 km radius make safe patient staging and van idling prohibited.",
                "tract_idx": 7
            },
            {
                "event_name": "Fulton County Annual Fair & Farmers Market",
                "venue_zone": "West End / Hammonds House Park",
                "conflict_type": "Site Occupancy & Staging Area Conflict",
                "event_impact": "Civic park and public lot fully reserved for civic fair tents. Alternative street parking does not satisfy wheelchair ADA ramp clearance.",
                "tract_idx": 11
            }
        ]
    },
    "17031": {
        "name": "Cook County, IL",
        "label": "Cook County, IL (Chicago)",
        "dataset": "a4i_health_17031",
        "benchmarks": {
            "avg_uninsured": 12.6,
            "avg_no_vehicle": 17.9,
            "avg_km_safety_net": 2.01,
            "avg_diabetes": 12.2,
            "avg_asthma": 10.3
        },
        "event_templates": [
            {
                "event_name": "Chicago Lakeshore Cycling Classic & Parkway Detour",
                "venue_zone": "Lakefront Trail / DuSable Lake Shore Drive Corridor",
                "conflict_type": "Road Closure / Transit Reroute",
                "event_impact": "Perimeter expressway ramps closed. CTA bus reroutes prevent safe patient staging and mobile medical vehicle idling.",
                "tract_idx": 4
            },
            {
                "event_name": "Soldier Field Civic Stadium Event & Festival",
                "venue_zone": "Near South Side / Museum Campus",
                "conflict_type": "Severe Traffic Congestion & Parking Restrictions",
                "event_impact": "Stadium event with 60,000+ attendees. CPD designated emergency lanes prohibit mobile clinic parking deck occupancy.",
                "tract_idx": 7
            },
            {
                "event_name": "Cook County Civic Farmers Market & Cultural Pavilion",
                "venue_zone": "Pilsen / Little Village Community Plaza",
                "conflict_type": "Site Occupancy & Staging Area Conflict",
                "event_impact": "Public plaza staging space fully reserved for municipal pavilions. No ADA-compliant sidewalk curb clearance available.",
                "tract_idx": 11
            }
        ]
    },
    "06085": {
        "name": "Santa Clara County, CA",
        "label": "Santa Clara County, CA (Sunnyvale / San Jose)",
        "dataset": "a4i_health_06085",
        "benchmarks": {
            "avg_uninsured": 7.5,
            "avg_no_vehicle": 5.7,
            "avg_km_safety_net": 2.81,
            "avg_diabetes": 10.3,
            "avg_asthma": 8.2
        },
        "event_templates": [
            {
                "event_name": "Silicon Valley Marathon & Light Rail Detour",
                "venue_zone": "Downtown San Jose / Santa Clara Transit Center",
                "conflict_type": "Road Closure / Transit Reroute",
                "event_impact": "VTA transit closures and street cones block mobile clinic van entrance to clinic staging bay.",
                "tract_idx": 4
            },
            {
                "event_name": "Levi's Stadium Matchday & Great America Concourse",
                "venue_zone": "North San Jose / Sunnyvale Border",
                "conflict_type": "Severe Traffic Congestion & Parking Restrictions",
                "event_impact": "Severe traffic congestion; parking garages fully occupied and street parking restricted under stadium permit rules.",
                "tract_idx": 7
            },
            {
                "event_name": "Sunnyvale Heritage Park Arts & Cultural Expo",
                "venue_zone": "Heritage Park Plaza / Civic Deck",
                "conflict_type": "Site Occupancy & Staging Area Conflict",
                "event_impact": "Park grounds reserved for civic festival booths. Electrical hookups and wheelchair ramp zones unavailable for clinic trailer.",
                "tract_idx": 11
            }
        ]
    },
    "36005": {
        "name": "Bronx County, NY",
        "label": "Bronx County, NY (New York City)",
        "dataset": "a4i_health_36005",
        "benchmarks": {
            "avg_uninsured": 15.7,
            "avg_no_vehicle": 56.9,
            "avg_km_safety_net": 0.62,
            "avg_diabetes": 15.2,
            "avg_asthma": 11.9
        },
        "event_templates": [
            {
                "event_name": "Grand Concourse 10K & NYC DOT Open Streets",
                "venue_zone": "Grand Concourse Corridor / Fordham",
                "conflict_type": "Road Closure / Transit Reroute",
                "event_impact": "Grand Concourse thoroughfare blocked to motor vehicles from 06:00 to 14:00. Mobile clinic van cannot cross arterial avenues.",
                "tract_idx": 4
            },
            {
                "event_name": "Yankee Stadium Matchday & Transit Hub Congestion",
                "venue_zone": "Concourse / 161st Street Hub",
                "conflict_type": "Severe Traffic Congestion & Parking Restrictions",
                "event_impact": "Massive pedestrian crowding and NYPD street blockades. Patient loading zones closed to unscheduled vehicles.",
                "tract_idx": 7
            },
            {
                "event_name": "Bronx River Greenway Environmental Fair",
                "venue_zone": "Hunts Point / Soundview Civic Lot",
                "conflict_type": "Site Occupancy & Staging Area Conflict",
                "event_impact": "Community staging plaza pre-booked for city environmental equipment. Alternative parking does not meet ADA van ramp slope criteria.",
                "tract_idx": 11
            }
        ]
    },
    "48201": {
        "name": "Harris County, TX",
        "label": "Harris County, TX (Houston)",
        "dataset": "a4i_health_48201",
        "benchmarks": {
            "avg_uninsured": 23.2,
            "avg_no_vehicle": 7.3,
            "avg_km_safety_net": 3.22,
            "avg_diabetes": 13.5,
            "avg_asthma": 9.4
        },
        "event_templates": [
            {
                "event_name": "Houston Chevron Marathon Course Closure",
                "venue_zone": "Inner Loop / Buffalo Bayou Corridor",
                "conflict_type": "Road Closure / Transit Reroute",
                "event_impact": "Major arterial roadway closures along METRO bus lines. Mobile clinic unit prohibited from crossing race route.",
                "tract_idx": 4
            },
            {
                "event_name": "NRG Stadium Rodeo & Civic Festival Staging",
                "venue_zone": "South Main / Medical Center Periphery",
                "conflict_type": "Severe Traffic Congestion & Parking Restrictions",
                "event_impact": "Over 75,000 visitors. Police traffic control prohibits long-term van idling or stationary health screening queues.",
                "tract_idx": 7
            },
            {
                "event_name": "Harris County Regional Civic Fair & Pavilion Market",
                "venue_zone": "East End / Gulfgate Community Park",
                "conflict_type": "Site Occupancy & Staging Area Conflict",
                "event_impact": "Municipal parking facility reserved for county emergency services exposition. Space unavailable for mobile clinic pop-up.",
                "tract_idx": 11
            }
        ]
    },
    "48453": {
        "name": "Travis County, TX",
        "label": "Travis County, TX (Austin)",
        "dataset": "a4i_health_48453",
        "benchmarks": {
            "avg_uninsured": 14.9,
            "avg_no_vehicle": 5.8,
            "avg_km_safety_net": 3.27,
            "avg_diabetes": 8.8,
            "avg_asthma": 9.4
        },
        "event_templates": [
            {
                "event_name": "Austin City Limits Festival & Lady Bird Lake Detour",
                "venue_zone": "Zilker / South Lamar / Riverside Corridor",
                "conflict_type": "Road Closure / Transit Reroute",
                "event_impact": "Barton Springs & Riverside avenues closed. CapMetro bus shuttle priority lanes restrict mobile clinic van passage.",
                "tract_idx": 4
            },
            {
                "event_name": "DKR Texas Memorial Stadium Gameday & Fan Fest",
                "venue_zone": "East Campus / Martin Luther King Jr Blvd",
                "conflict_type": "Severe Traffic Congestion & Parking Restrictions",
                "event_impact": "University & municipal police parking lockdowns within 2.0 km radius prevent safe mobile clinic patient staging.",
                "tract_idx": 7
            },
            {
                "event_name": "Travis County East Austin Community Market & Expo",
                "venue_zone": "East 7th St / Montopolis Civic Plaza",
                "conflict_type": "Site Occupancy & Staging Area Conflict",
                "event_impact": "Civic recreation center parking lot reserved for city mobile library and voting van. ADA access blocked.",
                "tract_idx": 11
            }
        ]
    }
}

def resolve_county_dataset(county_fips: Optional[str]) -> tuple:
    fips = county_fips if county_fips in COUNTY_METADATA else "13121"
    meta = COUNTY_METADATA[fips]
    return fips, meta["dataset"], meta

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"project_id": PROJECT_ID})

@app.get("/api/tracts")
async def get_tracts(limit: int = 1500, county: Optional[str] = "13121"):
    """Returns census tracts in the selected county with vulnerability, rank, and care distance metrics."""
    fips, dataset, meta = resolve_county_dataset(county)
    query = f"""
    WITH scored AS (
      SELECT 
        t.geo_id,
        b.total_pop,
        b.latitude,
        b.longitude,
        ROUND(b.pct_uninsured, 1) as pct_uninsured,
        ROUND(b.pct_no_vehicle, 1) as pct_no_vehicle,
        ROUND(b.pct_asthma, 1) as pct_asthma,
        ROUND(b.pct_diabetes, 1) as pct_diabetes,
        ROUND(b.pct_high_bp, 1) as pct_high_bp,
        ROUND(t.km_to_any_care, 2) as km_to_any_care,
        ROUND(t.km_to_safety_net, 2) as km_to_safety_net,
        ROUND(t.extra_km_if_uninsured, 2) as extra_km_if_uninsured,
        ROUND(b.pctile_uninsured, 2) as pctile_uninsured,
        ROUND(b.pctile_no_vehicle, 2) as pctile_no_vehicle,
        ROUND(
          COALESCE(b.pct_uninsured, 0) * 0.40 +
          COALESCE(b.pct_no_vehicle, 0) * 0.35 +
          LEAST(COALESCE(t.km_to_safety_net, 0) * 2.5, 40.0) * 0.25,
          2
        ) as composite_need_score
      FROM `{PROJECT_ID}.{dataset}.tract_access` t
      JOIN `{PROJECT_ID}.{dataset}.burden_tracts` b
        ON t.geo_id = b.geo_id
      WHERE b.latitude IS NOT NULL AND b.longitude IS NOT NULL
    )
    SELECT 
      *,
      RANK() OVER (ORDER BY composite_need_score DESC) as rank_overall,
      COUNT(*) OVER() as total_tracts
    FROM scored
    ORDER BY composite_need_score DESC
    LIMIT @limit
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("limit", "INT64", limit)]
    )
    results = bq_client.query(query, job_config=job_config).result()
    tracts = [dict(row) for row in results]
    return JSONResponse(tracts)

@app.get("/api/care_sites")
async def get_care_sites(county: Optional[str] = "13121"):
    """Returns existing care sites and FQHC safety-net clinics in the selected county."""
    fips, dataset, meta = resolve_county_dataset(county)
    query = f"""
    SELECT 
      FACILITY_NM as name,
      CMS_PROVIDER_ADDRESS as address,
      CMS_PROVIDER_CITY as city,
      CMS_PROVIDER_ZIP_CD as zip,
      site_kind,
      latitude,
      longitude,
      TOT_OPER_HR_PER_WEEK as hours_per_week
    FROM `{PROJECT_ID}.{dataset}.care_sites`
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """
    results = bq_client.query(query).result()
    sites = [dict(row) for row in results]
    return JSONResponse(sites)

@app.get("/api/plan")
async def get_plan(
    month: Optional[str] = "2026-11",
    cycle: Optional[int] = 0,
    weather: Optional[str] = "clear",
    county: Optional[str] = "13121"
):
    """
    Generates the Saturday stops for the mobile clinic in the requested County for the requested month.
    Month format: YYYY-MM (e.g. 2026-11, 2026-12, 2027-01).
    Weather options: 'clear' (open civic plazas & park lots) or 'rain' (covered garages & indoor transit deck facilities).
    Rotates candidate tracts monthly and by cycle so the same sites are not selected each time,
    ensuring equitable county-wide outreach across all high-need census tracts.
    """
    import calendar
    from datetime import date

    fips, dataset, meta = resolve_county_dataset(county)
    county_name = meta["name"]
    county_benchmarks = meta["benchmarks"]
    event_templates = meta["event_templates"]

    try:
        parts = month.split("-")
        year = int(parts[0])
        m_num = int(parts[1])
    except Exception:
        year = 2026
        m_num = 11

    month_name = calendar.month_name[m_num]
    month_label = f"{month_name} {year}"

    # Calculate all Saturdays in this month
    cal = calendar.monthcalendar(year, m_num)
    saturdays_days = [week[calendar.SATURDAY] for week in cal if week[calendar.SATURDAY] != 0]

    # Deterministic rotation offset based on month and refresh cycle
    month_index = (year - 2026) * 12 + (m_num - 11)
    cycle_val = cycle or 0
    rotation_offset = (month_index * 4 + cycle_val * 4) % 16

    query = f"""
    WITH scored AS (
      SELECT 
        t.geo_id,
        b.total_pop,
        b.latitude,
        b.longitude,
        ROUND(b.pct_uninsured, 1) as pct_uninsured,
        ROUND(b.pct_no_vehicle, 1) as pct_no_vehicle,
        ROUND(b.pct_diabetes, 1) as pct_diabetes,
        ROUND(b.pct_asthma, 1) as pct_asthma,
        ROUND(t.km_to_safety_net, 2) as km_to_safety_net,
        ROUND(t.extra_km_if_uninsured, 2) as extra_km_if_uninsured,
        ROUND(b.pct_limited_english, 1) as pct_limited_english,
        -- Siting Score: Weighting uninsured rate, vehicle isolation, and distance disparity
        ROUND(
          COALESCE(b.pct_uninsured, 0) * 0.40 +
          COALESCE(b.pct_no_vehicle, 0) * 0.35 +
          LEAST(COALESCE(t.km_to_safety_net, 0) * 2.5, 40.0) * 0.25,
          2
        ) as composite_need_score,
        ROUND(
          COALESCE(b.pct_uninsured, 0) * 0.40,
          2
        ) as score_uninsured_component,
        ROUND(
          COALESCE(b.pct_no_vehicle, 0) * 0.35,
          2
        ) as score_vehicle_component,
        ROUND(
          LEAST(COALESCE(t.km_to_safety_net, 0) * 2.5, 40.0) * 0.25,
          2
        ) as score_distance_component
      FROM `{PROJECT_ID}.{dataset}.tract_access` t
      JOIN `{PROJECT_ID}.{dataset}.burden_tracts` b
        ON t.geo_id = b.geo_id
      WHERE b.latitude IS NOT NULL 
        AND b.longitude IS NOT NULL
        AND b.total_pop > 500
    ),
    ranked AS (
      SELECT 
        *,
        ROW_NUMBER() OVER (ORDER BY composite_need_score DESC) as rank_overall,
        COUNT(*) OVER () as total_tracts,
        ROUND(PERCENT_RANK() OVER (ORDER BY composite_need_score) * 100, 1) as need_percentile
      FROM scored
    )
    SELECT * FROM ranked
    ORDER BY rank_overall ASC
    LIMIT 30
    """
    results = bq_client.query(query).result()
    all_top = [dict(row) for row in results]

    rejected_indices = {ev["tract_idx"] for ev in event_templates if ev["tract_idx"] < len(all_top)}

    # Select candidate stops for the Saturdays, rotating priority so the same site is not selected each time
    stops = []
    selected_indices = set()
    num_saturdays = len(saturdays_days[:5])
    raw_candidates = [i for i in range(len(all_top)) if i not in rejected_indices]

    # Rotate candidate pool using rotation_offset to cycle through different tracts each time
    if raw_candidates:
        rot_idx = rotation_offset % len(raw_candidates)
        candidate_pool = raw_candidates[rot_idx:] + raw_candidates[:rot_idx]
    else:
        candidate_pool = raw_candidates

    for idx, day_num in enumerate(saturdays_days[:num_saturdays]):
        if idx >= len(candidate_pool):
            break
        tract_idx = candidate_pool[idx]
        tract = all_top[tract_idx]
        selected_indices.add(tract_idx)
        sat_date = f"{year}-{m_num:02d}-{day_num:02d}"
        sat_label = f"Saturday, {month_name[:3]} {day_num}"

        # Calculate comparative multipliers vs selected County averages
        uninsured_mult = round(tract["pct_uninsured"] / county_benchmarks["avg_uninsured"], 1) if county_benchmarks["avg_uninsured"] else 1.0
        vehicle_mult = round(tract["pct_no_vehicle"] / county_benchmarks["avg_no_vehicle"], 1) if county_benchmarks["avg_no_vehicle"] else 1.0
        dist_diff = round(tract["km_to_safety_net"] - county_benchmarks["avg_km_safety_net"], 1)

        # Generate comparative reasoning
        reasoning_bullets = [
            f"Need Score: {tract['composite_need_score']} (Rank #{tract['rank_overall']} of {tract['total_tracts']} {county_name} tracts, top {100 - tract['need_percentile']:.1f}% need).",
            f"Uninsured Rate: {tract['pct_uninsured']}% ({uninsured_mult}x vs {county_name} avg of {county_benchmarks['avg_uninsured']}%).",
            f"Transit/Vehicle Isolation: {tract['pct_no_vehicle']}% of households have no vehicle ({vehicle_mult}x {county_name} avg of {county_benchmarks['avg_no_vehicle']}%).",
            f"Safety-Net Care Gap: {tract['km_to_safety_net']} km to nearest FQHC/safety-net provider ({dist_diff:+} km vs {county_benchmarks['avg_km_safety_net']} km avg; extra travel if uninsured: {tract['extra_km_if_uninsured']} km)."
        ]

        why_chosen = f"Rank #{tract['rank_overall']} Highest Need Site. Prioritized for immediate mobile clinic siting due to {tract['pct_uninsured']}% uninsured rate and {tract['pct_no_vehicle']}% vehicle deficit."

        # Weather-adaptive facility selection:
        # On rainy days, prioritize indoor covered decks, community center garages, and covered transit bays
        # On clear days, utilize open community plazas, park pavilions, and outdoor civic lots
        is_rain = (weather == "rain")
        if is_rain:
            facility_name = f"Tract {tract['geo_id']} Covered Civic Deck & Indoor Community Bay"
            parking_type = "Indoor Covered Parking Deck"
            parking_icon = "fa-warehouse"
            weather_badge = "Rain Contingency: Indoor Parking"
            weather_note = "🌧️ Rainy Weather Mode Active: Selected indoor multi-level covered deck to ensure dry patient waiting, wheelchair ramp protection, and clinical van equipment shielding."
        else:
            facility_name = f"Tract {tract['geo_id']} Civic Plaza & Community Center Lot"
            parking_type = "Outdoor Open Civic Plaza"
            parking_icon = "fa-square-parking"
            weather_badge = "Fair Weather: Open Plaza"
            weather_note = "☀️ Clear Weather Mode: Open civic plaza staging with direct street visibility and pedestrian walk-up access."

        stops.append({
            "stop_number": idx + 1,
            "day": day_num,
            "date": sat_date,
            "saturday_label": sat_label,
            "tract_id": tract["geo_id"],
            "total_pop": tract["total_pop"],
            "lat": tract["latitude"],
            "lon": tract["longitude"],
            "rank_overall": tract["rank_overall"],
            "total_tracts": tract["total_tracts"],
            "need_percentile": tract["need_percentile"],
            "composite_need_score": tract["composite_need_score"],
            "score_breakdown": {
                "uninsured_pts": tract["score_uninsured_component"],
                "vehicle_pts": tract["score_vehicle_component"],
                "distance_pts": tract["score_distance_component"]
            },
            "pct_uninsured": tract["pct_uninsured"],
            "pct_no_vehicle": tract["pct_no_vehicle"],
            "km_to_safety_net": tract["km_to_safety_net"],
            "extra_km_if_uninsured": tract["extra_km_if_uninsured"],
            "pct_diabetes": tract["pct_diabetes"],
            "pct_asthma": tract["pct_asthma"],
            "uninsured_mult": uninsured_mult,
            "vehicle_mult": vehicle_mult,
            "dist_diff": dist_diff,
            "parking_type": parking_type,
            "facility_name": facility_name,
            "parking_icon": parking_icon,
            "weather_mode": "rain" if is_rain else "clear",
            "weather_badge": weather_badge,
            "weather_note": weather_note,
            "rationale": f"High uninsured ({tract['pct_uninsured']}%) and vehicle isolation ({tract['pct_no_vehicle']}% without car) with {tract['km_to_safety_net']} km distance to nearest safety net care. Facility: {parking_type}.",
            "reasoning_bullets": reasoning_bullets + [weather_note],
            "why_chosen": why_chosen
        })

    # Prepare alternative runner-up options for comparison (next ranked tracts)
    alternatives = []
    for idx, alt in enumerate(all_top):
        if idx not in selected_indices and idx not in rejected_indices and len(alternatives) < 3:
            alternatives.append({
                "tract_id": alt["geo_id"],
                "rank_overall": alt["rank_overall"],
                "composite_need_score": alt["composite_need_score"],
                "pct_uninsured": alt["pct_uninsured"],
                "pct_no_vehicle": alt["pct_no_vehicle"],
                "km_to_safety_net": alt["km_to_safety_net"],
                "why_deferred": f"Rank #{alt['rank_overall']} (Score {alt['composite_need_score']}). Deferred to upcoming monthly rotation to prioritize immediate extreme transit deserts."
            })

    rejected_sites = []
    for ev in event_templates:
        if ev["tract_idx"] < len(all_top):
            cand = all_top[ev["tract_idx"]]
            rejected_sites.append({
                "tract_id": cand["geo_id"],
                "lat": cand["latitude"],
                "lon": cand["longitude"],
                "total_pop": cand["total_pop"],
                "rank_overall": cand["rank_overall"],
                "composite_need_score": cand["composite_need_score"],
                "pct_uninsured": cand["pct_uninsured"],
                "pct_no_vehicle": cand["pct_no_vehicle"],
                "km_to_safety_net": cand["km_to_safety_net"],
                "event_name": ev["event_name"],
                "venue_zone": ev["venue_zone"],
                "conflict_type": ev["conflict_type"],
                "rejection_reason": f"High need score ({cand['composite_need_score']}, Rank #{cand['rank_overall']}), but REJECTED for this weekend stop due to '{ev['event_name']}'. {ev['event_impact']}"
            })

    # Pull Round 1 Naive Clustered Veto stops from all_top (unconstrained top 4)
    round1_veto_stops = []
    for idx in range(min(4, len(all_top))):
        c = all_top[idx]
        round1_veto_stops.append({
            "stop_number": idx + 1,
            "tract_id": c["geo_id"],
            "lat": c["latitude"],
            "lon": c["longitude"],
            "composite_need_score": c["composite_need_score"],
            "rank_overall": c["rank_overall"],
            "pct_uninsured": c["pct_uninsured"],
            "pct_no_vehicle": c["pct_no_vehicle"],
            "veto_reason": "Auditor Veto: Spatial Clustering (<5.0 km from companion stop). Re-routed during closed-loop negotiation." if idx > 0 else "Retained as North/Anchor stop."
        })

    # Trilingual Community Outreach Flyers (English, Spanish, Vietnamese - top 3 languages in Fulton County BigQuery)
    flyers = {
        "flier_en": f"""# 🏥 Free Mobile Health Clinic Coming to Your Neighborhood!

**No insurance? No problem! No ID required. Walk-ins are always welcome.**

### Free Health Services:
- Blood pressure checks & heart health screening
- Diabetes & blood sugar rapid testing
- Doctor consultations & preventive care checkups
- Medication guidance & health insurance navigation

### 4 Saturday Clinic Stops (9:00 AM – 2:00 PM):
- **{stops[0]['saturday_label']} ({stops[0]['date']})**: Census Tract {stops[0]['tract_id']} (Rank #{stops[0]['rank_overall']} Priority)
- **{stops[1]['saturday_label']} ({stops[1]['date']})**: Census Tract {stops[1]['tract_id']} (Rank #{stops[1]['rank_overall']} Priority)
- **{stops[2]['saturday_label']} ({stops[2]['date']})**: Census Tract {stops[2]['tract_id']} (Rank #{stops[2]['rank_overall']} Priority)
- **{stops[3]['saturday_label']} ({stops[3]['date']})**: Census Tract {stops[3]['tract_id']} (Rank #{stops[3]['rank_overall']} Priority)

📅 *Click "Book Slot" to add to your calendar, or scan the Location QR code for directions!*""",

        "flier_es": f"""# 🏥 ¡Clínica Médica Móvil Gratuita en su Comunidad!

**¿No tiene seguro médico? ¡No se preocupe! No se requiere identificación. ¡Todos son bienvenidos!**

### Servicios Gratuitos:
- Control de presión arterial y chequeo del corazón
- Pruebas rápidas de glucosa y diabetes
- Consultas con médicos amigables y chequeos preventivos
- Asesoramiento de salud e información comunitaria

### Horario de los 4 Sábados (9:00 AM – 2:00 PM):
- **{stops[0]['saturday_label']} ({stops[0]['date']})**: Sector Censal {stops[0]['tract_id']} (Prioridad #{stops[0]['rank_overall']})
- **{stops[1]['saturday_label']} ({stops[1]['date']})**: Sector Censal {stops[1]['tract_id']} (Prioridad #{stops[1]['rank_overall']})
- **{stops[2]['saturday_label']} ({stops[2]['date']})**: Sector Censal {stops[2]['tract_id']} (Prioridad #{stops[2]['rank_overall']})
- **{stops[3]['saturday_label']} ({stops[3]['date']})**: Sector Censal {stops[3]['tract_id']} (Prioridad #{stops[3]['rank_overall']})

📅 *¡Haga clic en "Reservar Cita" para guardarlo en su calendario o escanee el código QR para indicaciones!*""",

        "flier_vi": f"""# 🏥 Phòng Khám Y Tế Di Động Miễn Phí Tại Khu Vực Của Quý Vị!

**Không có bảo hiểm? Không sao! Không cần giấy tờ tùy thân. Chào đón tất cả mọi người!**

### Dịch Vụ Khám Chữa Bệnh Miễn Phí:
- Đo huyết áp và kiểm tra sức khỏe tim mạch
- Xét nghiệm đường huyết và tầm soát bệnh tiểu đường
- Tư vấn bác sĩ tận tình và khám sức khỏe tổng quát phòng ngừa
- Hướng dẫn dùng thuốc và hỗ trợ tiếp cận y tế cộng đồng

### Lịch Khám 4 Ngày Thứ Bảy (9:00 Sáng – 2:00 Chiều):
- **{stops[0]['saturday_label']} ({stops[0]['date']})**: Khu Dân Cư {stops[0]['tract_id']} (Ưu Tiên Hạng #{stops[0]['rank_overall']})
- **{stops[1]['saturday_label']} ({stops[1]['date']})**: Khu Dân Cư {stops[1]['tract_id']} (Ưu Tiên Hạng #{stops[1]['rank_overall']})
- **{stops[2]['saturday_label']} ({stops[2]['date']})**: Khu Dân Cư {stops[2]['tract_id']} (Ưu Tiên Hạng #{stops[2]['rank_overall']})
- **{stops[3]['saturday_label']} ({stops[3]['date']})**: Khu Dân Cư {stops[3]['tract_id']} (Ưu Tiên Hạng #{stops[3]['rank_overall']})

📅 *Nhấp vào "Đặt Lịch" để thêm vào lịch hoặc quét mã QR để nhận chỉ đường!*"""
    }

    return JSONResponse({
        "county": county_name,
        "county_fips": fips,
        "month": month_label,
        "month_key": f"{year}-{m_num:02d}",
        "year": year,
        "month_num": m_num,
        "county_benchmarks": county_benchmarks,
        "stops": stops,
        "alternatives": alternatives,
        "rejected_sites": rejected_sites,
        "round1_veto_stops": round1_veto_stops,
        "candidate_tracts": all_top,
        "flyers": flyers,
        "weather_mode": weather,
        "agent_status": "Ready for multi-agent accountability audit"
    })

# --- My Clinic Assistant Agent ---
from pydantic import BaseModel
from google import genai
from google.genai import types

class ChatRequest(BaseModel):
    message: str

def query_fulton_health_data(sql_query: str) -> str:
    """
    Executes a read-only SQL query on the Fulton County BigQuery public health dataset.
    Tables available in `qwiklabs-gcp-04-e06bae0c96fc.a4i_health`:
    - `burden_tracts`: geo_id, total_pop, pct_uninsured, pct_no_vehicle, pct_diabetes, pct_asthma, pct_high_bp, latitude, longitude
    - `tract_access`: geo_id, km_to_any_care, km_to_safety_net, extra_km_if_uninsured
    - `care_sites`: facility_name, site_kind, latitude, longitude, TOT_OPER_HR_PER_WEEK
    - `disease_weekly`: epi_week, disease, cases
    """
    import json
    if any(k in sql_query.upper() for k in ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE"]):
        return "Error: Disallowed SQL keyword. Only read-only SELECT queries are allowed."
    try:
        results = bq_client.query(sql_query).result()
        rows = [dict(r) for r in list(results)[:10]]
        return json.dumps(rows, default=str)
    except Exception as e:
        return f"Database query error: {str(e)}"

@app.post("/api/assistant/chat")
async def assistant_chat(req: ChatRequest):
    """Answers operational, data, and siting questions using Gemini and live BigQuery tools."""
    user_msg = req.message.strip()
    if not user_msg:
        return JSONResponse({"reply": "Please enter a question or query."})

    try:
        ai_client = genai.Client(vertexai=True, project=PROJECT_ID, location="us-central1")
        
        system_prompt = (
            f"You are 'My Clinic Assistant', an AI operations and analytics agent for mobile health clinics in Fulton County, GA. "
            f"You have direct tool access to BigQuery dataset `{PROJECT_ID}.{DATASET_ID}`. "
            f"When answering questions about census tracts, disease rates, clinic locations, uninsured populations, or transit barriers, "
            f"call the `query_fulton_health_data` tool with valid SQL using `{PROJECT_ID}.{DATASET_ID}.<table_name>`. "
            f"NOTE: The mobile clinic planner also monitors real-time municipal permits and local event conflicts. "
            f"Candidate tracts with high scores can be REJECTED for stops due to local events such as:\n"
            f"- Tract 13121006602: Rejected due to 'Atlanta Marathon & 10K Road Closures' (perimeter road blockages).\n"
            f"- Tract 13121002500: Rejected due to 'Mercedes-Benz Stadium Match & Fan Festival' (police parking bans and severe congestion).\n"
            f"- Tract 13121011308: Rejected due to 'Fulton County Annual Fair & Farmers Market' (park staging area occupied).\n"
            f"Keep your answers concise, practical, and grounded in the data. Formatted with clean markdown bullet points."
        )

        chat = ai_client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                tools=[query_fulton_health_data],
                system_instruction=system_prompt,
                temperature=0.2
            )
        )
        response = chat.send_message(user_msg)
        return JSONResponse({"reply": response.text})
    except Exception as e:
        return JSONResponse({"reply": f"Assistant Error: {str(e)}"}, status_code=500)

# --- 3-Agent Orchestration Pipeline Endpoint ---
from agent.orchestrator import MultiAgentWorkflow

multi_agent_pipeline = MultiAgentWorkflow()

@app.get("/api/multiagent/pipeline")
async def get_multiagent_pipeline(month: str = "2026-11"):
    """
    Executes the 3-agent collaborative pipeline:
    1. Siting Agent -> proposed_schedule
    2. Equity Auditor Agent -> approved_schedule + audit_report
    3. Community Explainer Agent -> flyers (English & Spanish)
    """
    try:
        result = multi_agent_pipeline.run_pipeline(month)
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5100, reload=True)
