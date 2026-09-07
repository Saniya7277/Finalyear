"""
Convert trained LightGBM .joblib models to JSON tree format
for on-device JavaScript inference in the Expo app.

Original .joblib files are NOT modified.
Output JSON files go to: artifacts/securesphere/assets/models/
"""
import joblib
import json
import numpy as np
import pandas as pd
from pathlib import Path

BASE = Path(__file__).resolve().parent
ML_BASE = BASE
APP_BASE = BASE.parent / "artifacts" / "securesphere"
OUT_DIR = APP_BASE / "assets" / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + np.exp(-x))


def serialize_node(node: dict) -> dict:
    """Recursively serialize a LightGBM tree node."""
    if "leaf_index" in node:
        return {"leaf_value": node["leaf_value"]}
    return {
        "split_feature": node["split_feature"],
        "threshold": node["threshold"],
        "decision_type": node["decision_type"],
        "default_left": node["default_left"],
        "missing_type": node["missing_type"],
        "left": serialize_node(node["left_child"]),
        "right": serialize_node(node["right_child"]),
    }


def convert_model(model_path: Path, features_path: Path, out_name: str) -> dict:
    print(f"\nConverting: {out_name}")

    model = joblib.load(model_path)
    features = joblib.load(features_path)
    booster = model.booster_
    dump = booster.dump_model()

    trees = []
    for tree_info in dump["tree_info"]:
        trees.append({
            "shrinkage": tree_info["shrinkage"],
            "root": serialize_node(tree_info["tree_structure"]),
        })

    out = {
        "model_name": out_name,
        "feature_names": features,
        "num_features": len(features),
        "num_trees": len(trees),
        "trees": trees,
    }

    out_path = OUT_DIR / f"{out_name}.json"
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"  Features: {len(features)}")
    print(f"  Trees: {len(trees)}")
    print(f"  Output size: {size_kb:.1f} KB")

    # Verify by running Python prediction on a zero-vector
    n = len(features)
    col_names = [f"feature_{i}" for i in range(n)]
    test_df = pd.DataFrame([[0] * n], columns=col_names)
    py_prob = float(model.predict_proba(test_df)[0][1])
    print(f"  Python pred on zeros vector: {py_prob:.8f}")

    return out, features, py_prob


CONFIGS = [
    (
        ML_BASE / "pdf-malware" / "models" / "pdf_malware_model.joblib",
        ML_BASE / "pdf-malware" / "models" / "pdf_features.joblib",
        "pdf",
    ),
    (
        ML_BASE / "office-malware" / "models" / "word_model.joblib",
        ML_BASE / "office-malware" / "models" / "word_features.joblib",
        "word",
    ),
    (
        ML_BASE / "office-malware" / "models" / "excel_model.joblib",
        ML_BASE / "office-malware" / "models" / "excel_features.joblib",
        "excel",
    ),
    (
        ML_BASE / "office-malware" / "models" / "html_model.joblib",
        ML_BASE / "office-malware" / "models" / "html_features.joblib",
        "html",
    ),
]

print("=" * 60)
print("LightGBM -> JSON Conversion")
print("=" * 60)

results = {}
for model_path, features_path, name in CONFIGS:
    out, features, py_prob = convert_model(model_path, features_path, name)
    results[name] = {"features": features, "py_prob_zeros": py_prob}

print("\n" + "=" * 60)
print("Conversion Summary")
print("=" * 60)
for name, info in results.items():
    print(f"  {name}: {len(info['features'])} features, zeros_pred={info['py_prob_zeros']:.8f}")

print(f"\nJSON models written to: {OUT_DIR}")
print("Original .joblib files are unchanged.")
