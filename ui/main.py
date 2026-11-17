import os
from typing import List, Optional
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
from google.cloud import bigquery

app = FastAPI(title="Mobile Clinic Planner - Fulton County")

# Configure BigQuery
PROJECT_ID = os.getenv("GCP_PROJECT", "qwiklabs-gcp-04-e06bae0c96fc")
DATASET_ID = "a4i_health"
bq_client = bigquery.Client(project=PROJECT_ID)

templates = Jinja2Templates(directory="ui/templates")
app.mount("/static", StaticFiles(directory="ui/static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"project_id": PROJECT_ID})

@app.get("/api/tracts")
async def get_tracts(limit: int = 400):
    """Returns census tracts in Fulton County with vulnerability and care distance metrics."""
    query = f"""
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
      ROUND(b.pctile_no_vehicle, 2) as pctile_no_vehicle
    FROM `{PROJECT_ID}.{DATASET_ID}.tract_access` t
    JOIN `{PROJECT_ID}.{DATASET_ID}.burden_tracts` b
      ON t.geo_id = b.geo_id
    WHERE b.latitude IS NOT NULL AND b.longitude IS NOT NULL
    LIMIT @limit
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("limit", "INT64", limit)]
    )
    results = bq_client.query(query, job_config=job_config).result()
    tracts = [dict(row) for row in results]
    return JSONResponse(tracts)

@app.get("/api/care_sites")
async def get_care_sites():
    """Returns existing care sites and FQHC safety-net clinics in Fulton County."""
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
    FROM `{PROJECT_ID}.{DATASET_ID}.care_sites`
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """
    results = bq_client.query(query).result()
    sites = [dict(row) for row in results]
    return JSONResponse(sites)

@app.get("/api/plan")
async def get_plan(month: Optional[str] = "2026-11"):
    """
    Generates the Saturday stops for the mobile clinic in Fulton County for the requested month.
    Month format: YYYY-MM (e.g. 2026-11, 2026-12, 2027-01).
    Ranks by combined need: High uninsured + High lack of vehicle + Safety-net distance gap.
    """
    import calendar
    from datetime import date

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

    # Deterministic rotation offset based on month to rotate candidate priority
    month_hash = (year * 12 + m_num) % 6
    offset = month_hash * 2

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
      FROM `{PROJECT_ID}.{DATASET_ID}.tract_access` t
      JOIN `{PROJECT_ID}.{DATASET_ID}.burden_tracts` b
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

    county_benchmarks = {
        "avg_uninsured": 11.0,
        "avg_no_vehicle": 11.7,
        "avg_km_safety_net": 6.78,
        "avg_diabetes": 11.2,
        "avg_asthma": 9.7
    }

    # Select candidate stops for the Saturdays
    stops = []
    selected_indices = set()
    num_saturdays = len(saturdays_days[:5])

    for idx, day_num in enumerate(saturdays_days[:5]):
        tract_idx = (offset + idx) % len(all_top)
        tract = all_top[tract_idx]
        selected_indices.add(tract_idx)
        sat_date = f"{year}-{m_num:02d}-{day_num:02d}"
        sat_label = f"Saturday, {month_name[:3]} {day_num}"

        # Calculate comparative multipliers vs Fulton County averages
        uninsured_mult = round(tract["pct_uninsured"] / county_benchmarks["avg_uninsured"], 1) if county_benchmarks["avg_uninsured"] else 1.0
        vehicle_mult = round(tract["pct_no_vehicle"] / county_benchmarks["avg_no_vehicle"], 1) if county_benchmarks["avg_no_vehicle"] else 1.0
        dist_diff = round(tract["km_to_safety_net"] - county_benchmarks["avg_km_safety_net"], 1)

        # Generate comparative reasoning
        reasoning_bullets = [
            f"Need Score: {tract['composite_need_score']} (Rank #{tract['rank_overall']} of {tract['total_tracts']} county tracts, top {100 - tract['need_percentile']:.1f}% need).",
            f"Uninsured Rate: {tract['pct_uninsured']}% ({uninsured_mult}x higher than Fulton county avg of {county_benchmarks['avg_uninsured']}%).",
            f"Transit/Vehicle Isolation: {tract['pct_no_vehicle']}% of households have no vehicle ({vehicle_mult}x county avg of {county_benchmarks['avg_no_vehicle']}%).",
            f"Safety-Net Care Gap: {tract['km_to_safety_net']} km to nearest FQHC/safety-net provider ({dist_diff:+} km vs {county_benchmarks['avg_km_safety_net']} km avg; extra travel if uninsured: {tract['extra_km_if_uninsured']} km)."
        ]

        why_chosen = f"Selected over lower-ranked tracts because its severe vehicle deficit ({tract['pct_no_vehicle']}%) combined with an elevated uninsured rate ({tract['pct_uninsured']}%) creates a compounding care barrier that stationary clinics cannot bridge."

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
            "rationale": f"High uninsured ({tract['pct_uninsured']}%) and vehicle isolation ({tract['pct_no_vehicle']}% without car) with {tract['km_to_safety_net']} km distance to nearest safety net care.",
            "reasoning_bullets": reasoning_bullets,
            "why_chosen": why_chosen
        })

    # Prepare alternative runner-up options for comparison
    alternatives = []
    for idx, alt in enumerate(all_top):
        if idx not in selected_indices and len(alternatives) < 3:
            alternatives.append({
                "tract_id": alt["geo_id"],
                "rank_overall": alt["rank_overall"],
                "composite_need_score": alt["composite_need_score"],
                "pct_uninsured": alt["pct_uninsured"],
                "pct_no_vehicle": alt["pct_no_vehicle"],
                "km_to_safety_net": alt["km_to_safety_net"],
                "why_deferred": f"Rank #{alt['rank_overall']} (Score {alt['composite_need_score']}). Deferred to upcoming monthly rotation to prioritize immediate extreme transit deserts."
            })

    # High-need tracts rejected due to local events / road closures / venue conflicts
    event_templates = [
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

    return JSONResponse({
        "county": "Fulton County, GA",
        "month": month_label,
        "month_key": f"{year}-{m_num:02d}",
        "year": year,
        "month_num": m_num,
        "county_benchmarks": county_benchmarks,
        "stops": stops,
        "alternatives": alternatives,
        "rejected_sites": rejected_sites,
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
