import io
import json
import math
import os
import hmac
from collections import Counter, defaultdict
from datetime import date, datetime

import joblib
import numpy as np
import psycopg
import rasterio
import requests
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from rasterio.mask import mask
from rasterio.warp import transform_geom
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

VERSION = "0.8.0"
EARTH_SEARCH = "https://earth-search.aws.element84.com/v1/search"
DATABASE_URL = os.getenv("DATABASE_URL", "")
WORKER_TOKEN = os.getenv("AGRO_WORKER_TOKEN", "")
BAND_KEYS = {
    "red": ["red", "B04"],
    "green": ["green", "B03"],
    "nir": ["nir", "B08"],
    "swir16": ["swir16", "B11"],
}

app = FastAPI(title="Agro Intelligence Worker", version=VERSION)


class FeatureRequest(BaseModel):
    geometry: dict
    season: str = Field(default=str(datetime.utcnow().year), max_length=20)
    max_cloud: float = Field(default=35, ge=0, le=100)
    max_scenes: int = Field(default=8, ge=2, le=14)


class TrainRequest(BaseModel):
    district_id: int
    season: str
    min_samples_per_class: int = Field(default=3, ge=2, le=30)


def auth_worker(x_worker_token: str = Header(default="")):
    if WORKER_TOKEN and not hmac.compare_digest(x_worker_token, WORKER_TOKEN):
        raise HTTPException(status_code=401, detail="Worker token noto‘g‘ri")


def db():
    if not DATABASE_URL:
        raise HTTPException(status_code=503, detail="DATABASE_URL sozlanmagan")
    return psycopg.connect(DATABASE_URL)


def agricultural_window(season: str):
    try:
        year = int(season[:4])
    except Exception:
        year = datetime.utcnow().year
    return f"{year-1}-10-01T00:00:00Z", f"{year}-11-30T23:59:59Z"


def asset_href(item: dict, logical_name: str):
    assets = item.get("assets") or {}
    for key in BAND_KEYS[logical_name]:
        asset = assets.get(key)
        if asset and asset.get("href"):
            return asset["href"]
    return None


def search_scenes(geometry: dict, season: str, max_cloud: float = 35, limit: int = 30):
    start, end = agricultural_window(season)
    payload = {
        "collections": ["sentinel-2-l2a"],
        "intersects": geometry,
        "datetime": f"{start}/{end}",
        "query": {"eo:cloud_cover": {"lt": float(max_cloud)}},
        "sortby": [{"field": "properties.datetime", "direction": "asc"}],
        "limit": int(limit),
    }
    response = requests.post(EARTH_SEARCH, json=payload, timeout=30)
    response.raise_for_status()
    return response.json().get("features", [])


def select_temporal_scenes(items: list[dict], max_scenes: int):
    if len(items) <= max_scenes:
        return items
    by_month = defaultdict(list)
    for item in items:
        dt = str((item.get("properties") or {}).get("datetime") or "")
        month = dt[:7] if len(dt) >= 7 else "unknown"
        by_month[month].append(item)
    monthly = []
    for month in sorted(by_month):
        monthly.append(min(by_month[month], key=lambda x: float((x.get("properties") or {}).get("eo:cloud_cover") or 100)))
    if len(monthly) <= max_scenes:
        return monthly
    indices = np.linspace(0, len(monthly) - 1, max_scenes).round().astype(int)
    return [monthly[i] for i in indices]


def mean_band(href: str, geometry: dict):
    env = {
        "AWS_NO_SIGN_REQUEST": "YES",
        "AWS_REGION": "us-west-2",
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF",
    }
    with rasterio.Env(**env):
        with rasterio.open(href) as src:
            projected = transform_geom("EPSG:4326", src.crs, geometry, precision=6)
            arr, _ = mask(src, [projected], crop=True, filled=False, indexes=1)
            data = np.ma.asarray(arr).compressed().astype("float64")
            data = data[np.isfinite(data)]
            data = data[data > 0]
            if data.size == 0:
                return None
            return float(np.mean(data))


def ratio(a, b):
    if a is None or b is None:
        return None
    den = a + b
    if abs(den) < 1e-12:
        return None
    return float((a - b) / den)


def scene_features(item: dict, geometry: dict):
    means = {}
    for logical in BAND_KEYS:
        href = asset_href(item, logical)
        if not href:
            means[logical] = None
            continue
        try:
            means[logical] = mean_band(href, geometry)
        except Exception:
            means[logical] = None
    ndvi = ratio(means.get("nir"), means.get("red"))
    ndmi = ratio(means.get("nir"), means.get("swir16"))
    ndwi = ratio(means.get("green"), means.get("nir"))
    props = item.get("properties") or {}
    return {
        "scene_id": item.get("id"),
        "datetime": props.get("datetime"),
        "cloud_cover": props.get("eo:cloud_cover"),
        "red": means.get("red"),
        "green": means.get("green"),
        "nir": means.get("nir"),
        "swir16": means.get("swir16"),
        "ndvi": ndvi,
        "ndmi": ndmi,
        "ndwi": ndwi,
    }


def summarize_series(observations: list[dict]):
    variables = ["red", "green", "nir", "swir16", "ndvi", "ndmi", "ndwi"]
    features = {"obs_count": len(observations)}
    for variable in variables:
        vals = [float(row[variable]) for row in observations if row.get(variable) is not None and math.isfinite(float(row[variable]))]
        if not vals:
            for suffix in ["mean", "std", "min", "max", "p25", "p75"]:
                features[f"{variable}_{suffix}"] = None
            continue
        arr = np.asarray(vals, dtype="float64")
        features[f"{variable}_mean"] = float(np.mean(arr))
        features[f"{variable}_std"] = float(np.std(arr))
        features[f"{variable}_min"] = float(np.min(arr))
        features[f"{variable}_max"] = float(np.max(arr))
        features[f"{variable}_p25"] = float(np.percentile(arr, 25))
        features[f"{variable}_p75"] = float(np.percentile(arr, 75))
    return features


def extract_features(geometry: dict, season: str, max_cloud: float = 35, max_scenes: int = 8):
    items = search_scenes(geometry, season, max_cloud=max_cloud, limit=40)
    selected = select_temporal_scenes(items, max_scenes=max_scenes)
    observations = []
    for item in selected:
        row = scene_features(item, geometry)
        if row.get("ndvi") is not None:
            observations.append(row)
    return {
        "season": season,
        "source": "Sentinel-2 L2A via Earth Search public COG mirror",
        "catalog_items_found": len(items),
        "scenes_selected": len(selected),
        "valid_observations": len(observations),
        "observations": observations,
        "features": summarize_series(observations),
    }


def numeric_feature_names(feature_rows: list[dict]):
    names = set()
    for row in feature_rows:
        names.update((row or {}).keys())
    return sorted(name for name in names if name != "obs_count") + (["obs_count"] if "obs_count" in names else [])


def matrix(feature_rows: list[dict], names: list[str]):
    cols = []
    for name in names:
        vals = [row.get(name) for row in feature_rows]
        finite = [float(v) for v in vals if v is not None and math.isfinite(float(v))]
        fill = float(np.median(finite)) if finite else 0.0
        cols.append([fill if v is None or not math.isfinite(float(v)) else float(v) for v in vals])
    return np.asarray(cols, dtype="float64").T


@app.get("/health")
def health():
    return {"ok": True, "version": VERSION, "earth_search": EARTH_SEARCH}


@app.post("/features/polygon", dependencies=[Depends(auth_worker)])
def polygon_features(payload: FeatureRequest):
    try:
        return extract_features(payload.geometry, payload.season, payload.max_cloud, payload.max_scenes)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Satellite katalog xatosi: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Feature extraction xatosi: {exc}")


@app.get("/pipeline/readiness", dependencies=[Depends(auth_worker)])
def readiness(district_id: int, season: str):
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT crop_name, COUNT(*)::int,
                       COUNT(*) FILTER (WHERE feature_status='ready' AND feature_json IS NOT NULL)::int
                  FROM agro_field_samples
                 WHERE district_id=%s AND season=%s AND verification_status='verified'
                 GROUP BY crop_name ORDER BY crop_name
                """,
                (district_id, season),
            )
            rows = cur.fetchall()
    classes = [{"crop_name": r[0], "verified": r[1], "features_ready": r[2]} for r in rows]
    total = sum(r["verified"] for r in classes)
    min_class = min([r["verified"] for r in classes], default=0)
    ready = len(classes) >= 2 and total >= 12 and min_class >= 3
    return {
        "district_id": district_id,
        "season": season,
        "verified_samples": total,
        "class_count": len(classes),
        "minimum_class_samples": min_class,
        "classes": classes,
        "training_ready": ready,
        "rule": "Kamida 2 ekin turi, jami 12 verified namuna va har bir sinfda kamida 3 namuna.",
    }


@app.post("/pipeline/extract-sample/{sample_id}", dependencies=[Depends(auth_worker)])
def extract_sample(sample_id: int):
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT sample_id, crop_name, geometry_geojson, season
                  FROM agro_field_samples
                 WHERE sample_id=%s AND verification_status='verified'
                """,
                (sample_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Verified sample topilmadi")
            season = row[3] or str(datetime.utcnow().year)
            try:
                cur.execute("UPDATE agro_field_samples SET feature_status='processing' WHERE sample_id=%s", (sample_id,))
                conn.commit()
                result = extract_features(row[2], season)
                status = "ready" if result["valid_observations"] >= 2 else "insufficient"
                cur.execute(
                    """
                    UPDATE agro_field_samples
                       SET feature_status=%s, feature_json=%s::jsonb, feature_updated_at=NOW(), season=%s
                     WHERE sample_id=%s
                    """,
                    (status, json.dumps(result["features"]), season, sample_id),
                )
                conn.commit()
                return {"sample_id": sample_id, "crop_name": row[1], "feature_status": status, **result}
            except Exception as exc:
                cur.execute("UPDATE agro_field_samples SET feature_status='failed', feature_updated_at=NOW() WHERE sample_id=%s", (sample_id,))
                conn.commit()
                raise HTTPException(status_code=500, detail=f"Feature extraction xatosi: {exc}")


@app.post("/pipeline/train", dependencies=[Depends(auth_worker)])
def train(payload: TrainRequest):
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT sample_id, crop_name, feature_json
                  FROM agro_field_samples
                 WHERE district_id=%s AND season=%s
                   AND verification_status='verified'
                   AND feature_status='ready' AND feature_json IS NOT NULL
                 ORDER BY sample_id
                """,
                (payload.district_id, payload.season),
            )
            samples = cur.fetchall()
            if not samples:
                raise HTTPException(status_code=422, detail="Tayyor feature'li verified sample yo‘q")

            labels = [row[1] for row in samples]
            counts = Counter(labels)
            if len(counts) < 2:
                raise HTTPException(status_code=422, detail="Kamida 2 ta ekin sinfi kerak")
            if min(counts.values()) < payload.min_samples_per_class:
                raise HTTPException(status_code=422, detail=f"Har bir sinfda kamida {payload.min_samples_per_class} ta tayyor namuna kerak")
            if len(samples) < 12:
                raise HTTPException(status_code=422, detail="Jami kamida 12 ta tayyor namuna kerak")

            feature_rows = [row[2] for row in samples]
            names = numeric_feature_names(feature_rows)
            X = matrix(feature_rows, names)
            y = np.asarray(labels)
            n_splits = min(5, min(counts.values()))
            model = RandomForestClassifier(
                n_estimators=350,
                random_state=42,
                class_weight="balanced",
                min_samples_leaf=1,
                n_jobs=-1,
            )
            cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
            pred = cross_val_predict(model, X, y, cv=cv, n_jobs=-1)
            labels_sorted = sorted(counts)
            metrics = {
                "accuracy_cv": float(accuracy_score(y, pred)),
                "macro_f1_cv": float(f1_score(y, pred, average="macro")),
                "n_splits": n_splits,
                "class_counts": dict(counts),
                "labels": labels_sorted,
                "confusion_matrix": confusion_matrix(y, pred, labels=labels_sorted).tolist(),
                "feature_count": len(names),
            }

            cur.execute(
                """
                INSERT INTO agro_model_runs
                  (district_id, season, model_name, model_version, status, metrics, training_samples, classes, worker_version, started_at)
                VALUES (%s,%s,'RandomForest Sentinel-2 temporal features','rf-s2-v1','running',%s::jsonb,%s,%s::jsonb,%s,NOW())
                RETURNING run_id
                """,
                (payload.district_id, payload.season, json.dumps(metrics), len(samples), json.dumps(labels_sorted), VERSION),
            )
            run_id = cur.fetchone()[0]
            conn.commit()

            try:
                model.fit(X, y)
                buffer = io.BytesIO()
                joblib.dump(model, buffer)
                blob = buffer.getvalue()
                cur.execute(
                    """
                    INSERT INTO agro_model_artifacts (run_id, model_format, feature_names, model_blob)
                    VALUES (%s,'joblib',%s::jsonb,%s)
                    ON CONFLICT (run_id) DO UPDATE SET feature_names=EXCLUDED.feature_names, model_blob=EXCLUDED.model_blob
                    """,
                    (run_id, json.dumps(names), blob),
                )
                cur.execute(
                    "UPDATE agro_model_runs SET status='completed', completed_at=NOW(), metrics=%s::jsonb WHERE run_id=%s",
                    (json.dumps(metrics), run_id),
                )
                conn.commit()
                return {"ok": True, "run_id": run_id, "metrics": metrics, "feature_names": names}
            except Exception as exc:
                cur.execute(
                    "UPDATE agro_model_runs SET status='failed', completed_at=NOW(), error_message=%s WHERE run_id=%s",
                    (str(exc)[:2000], run_id),
                )
                conn.commit()
                raise HTTPException(status_code=500, detail=f"Model training xatosi: {exc}")
