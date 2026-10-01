"""Live T18 diagnostic: real licensed files through browser OCR, cleaner and analyzer, without mocks."""
import json
import os
import argparse
import socket
import subprocess
import tempfile
import time
import urllib.request
from collections import Counter
from pathlib import Path

from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
T18 = ROOT / "audit" / "t18"
MANIFEST = json.loads((T18 / "corpus-manifest.json").read_text(encoding="utf-8"))
USER_AGENT = "AnatomyCosmeticsAudit/0.1 (local reproducible evaluation)"
parser = argparse.ArgumentParser(description="Run the real T18 browser OCR diagnostic.")
parser.add_argument(
    "--partition",
    choices=("setup", "final"),
    default=os.environ.get("T18_PARTITION", "setup").strip().lower(),
)
PARTITION = parser.parse_args().partition
if PARTITION not in {"setup", "final"}:
    raise ValueError("T18_PARTITION must be setup or final")


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_server(url, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("Local server did not become ready")


def download(url, destination):
    data = None
    last_error = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read(15 * 1024 * 1024 + 1)
            break
        except Exception as error:
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    if data is None:
        raise last_error
    if len(data) > 15 * 1024 * 1024:
        raise ValueError("Image exceeds application upload limit")
    destination.write_bytes(data)
    return len(data)


def prepare_for_ocr(source, destination, max_edge=1800):
    with Image.open(source) as image:
        original = {"width": image.width, "height": image.height}
        image = image.convert("RGB")
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        processed = {"width": image.width, "height": image.height}
        image.save(destination, format="JPEG", quality=94, optimize=True)
    return {"original": original, "processed": processed, "resized": original != processed}


def normalize(value):
    return " ".join(str(value or "").strip().rstrip(".").lower().split())


def reference_tokens(value):
    return [normalize(item) for item in str(value or "").replace(";", ",").split(",") if len(normalize(item)) >= 2]


def compare(expected, actual):
    expected_counts = Counter(expected)
    actual_counts = Counter(actual)
    true_positive = sum(min(count, actual_counts[name]) for name, count in expected_counts.items())
    false_positive = max(0, len(actual) - true_positive)
    false_negative = max(0, len(expected) - true_positive)
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else None
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else None
    return {
        "truePositive": true_positive,
        "falsePositive": false_positive,
        "falseNegative": false_negative,
        "precision": round(precision, 4) if precision is not None else None,
        "recall": round(recall, 4) if recall is not None else None,
    }


def select_ingredient_cases():
    setup = [entry for entry in MANIFEST["entries"] if entry["partition"] == PARTITION]
    selected = []
    long_case = next((entry for entry in setup if entry["reference"]["ingredientCountApprox"] >= 40), None)
    if long_case:
        selected.append(long_case)
    for language in ["en", "fr", "de", "es", "nl", "it"]:
        candidate = next((entry for entry in setup if entry["product"]["language"] == language and entry not in selected), None)
        if candidate:
            selected.append(candidate)
        if len(selected) >= 5:
            break
    for entry in setup:
        if entry not in selected:
            selected.append(entry)
        if len(selected) >= 5:
            break
    return selected[:3]


def select_front_cases(excluded):
    setup = [entry for entry in MANIFEST["entries"] if entry["partition"] == PARTITION and entry["id"] not in excluded]
    return [entry for entry in setup if entry["inputs"]["frontImage"]["url"]][:1]


def terminal_photo_state(page):
    page.wait_for_function(
        "['confirmation','clarification','error'].includes(document.querySelector('#photoStatus')?.dataset.state)",
        timeout=180_000,
    )
    return page.locator("#photoStatus").get_attribute("data-state")


def upload_photo(page, image_path, entry, kind):
    page.goto(page.url.split("?")[0] if page.url.startswith("http") else page.url, wait_until="networkidle")
    page.wait_for_function("Boolean(window.Tesseract?.recognize)", timeout=45_000)
    started = time.time()
    page.locator("#photoInput").set_input_files(str(image_path))
    state = terminal_photo_state(page)
    extracted = page.locator("#photoText").input_value()
    status_text = page.locator("#photoStatus").inner_text()
    product_name = page.locator("#productName").input_value()
    analyzed = False
    report_text = ""
    if state == "confirmation" and page.locator("#photoAnalyze").is_enabled():
        page.locator("#photoAnalyze").click()
        page.wait_for_function("!document.querySelector('#result').hasAttribute('aria-busy') && document.querySelector('#result').textContent.trim().length > 0", timeout=60_000)
        report_text = page.locator("#result").inner_text()
        analyzed = not page.locator("#result .error").count()
        product_name = page.locator("#productName").input_value()
    expected = reference_tokens(entry["inputs"]["sourceText"]) if kind == "ingredients" else []
    actual = reference_tokens(extracted)
    return {
        "id": entry["id"],
        "kind": kind,
        "language": entry["product"]["language"],
        "elapsedMs": round((time.time() - started) * 1000),
        "state": state,
        "statusText": status_text,
        "productName": product_name,
        "expectedIngredientCount": len(expected),
        "extractedIngredientCount": len(actual),
        "comparison": compare(expected, actual) if expected else None,
        "analysisCompleted": analyzed,
        "reportLength": len(report_text),
        "reportExcerpt": report_text[:300],
    }


def aggregate(cases):
    compared = [case["comparison"] for case in cases if case.get("comparison")]
    tp = sum(item["truePositive"] for item in compared)
    fp = sum(item["falsePositive"] for item in compared)
    fn = sum(item["falseNegative"] for item in compared)
    return {
        "records": len(compared),
        "truePositive": tp,
        "falsePositive": fp,
        "falseNegative": fn,
        "precision": round(tp / (tp + fp), 4) if tp + fp else None,
        "recall": round(tp / (tp + fn), 4) if tp + fn else None,
        "analysisCompleted": sum(1 for case in cases if case["analysisCompleted"]),
    }


def main():
    port = free_port()
    env = {**os.environ, "PORT": str(port), "HOST": "127.0.0.1"}
    server_log = (T18 / "live-server.log").open("w", encoding="utf-8")
    process = subprocess.Popen(["node", "src/server.js"], cwd=ROOT, env=env, stdout=server_log, stderr=subprocess.STDOUT, text=True)
    ingredient_cases = select_ingredient_cases()
    front_cases = select_front_cases({entry["id"] for entry in ingredient_cases})
    results = []
    errors = []
    try:
        wait_for_server(f"http://127.0.0.1:{port}/health")
        with tempfile.TemporaryDirectory(prefix="anatomy-t18-") as temp_dir, sync_playwright() as playwright:
            temp = Path(temp_dir)
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 390, "height": 844})
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{port}/", wait_until="networkidle")
            for index, entry in enumerate(ingredient_cases):
                image_path = temp / f"ingredients-{index}.jpg"
                try:
                    source_path = temp / f"ingredients-{index}-source.jpg"
                    size = download(entry["inputs"]["ingredientImage"]["url"], source_path)
                    dimensions = prepare_for_ocr(source_path, image_path)
                    result = upload_photo(page, image_path, entry, "ingredients")
                    result["downloadBytes"] = size
                    result["dimensions"] = dimensions
                    results.append(result)
                    print(json.dumps({"id": entry["id"], "state": result["state"], "precision": result["comparison"]["precision"], "recall": result["comparison"]["recall"]}), flush=True)
                except Exception as error:
                    results.append({"id": entry["id"], "kind": "ingredients", "error": str(error), "analysisCompleted": False})
                    print(json.dumps({"id": entry["id"], "error": str(error)}), flush=True)
            for index, entry in enumerate(front_cases):
                image_path = temp / f"front-{index}.jpg"
                try:
                    source_path = temp / f"front-{index}-source.jpg"
                    size = download(entry["inputs"]["frontImage"]["url"], source_path)
                    dimensions = prepare_for_ocr(source_path, image_path)
                    result = upload_photo(page, image_path, entry, "front")
                    result["downloadBytes"] = size
                    result["dimensions"] = dimensions
                    results.append(result)
                    print(json.dumps({"id": entry["id"], "state": result["state"], "productName": result["productName"]}), flush=True)
                except Exception as error:
                    results.append({"id": entry["id"], "kind": "front", "error": str(error), "analysisCompleted": False})
                    print(json.dumps({"id": entry["id"], "error": str(error)}), flush=True)
            context.close()
            browser.close()
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
        server_log.close()

    ingredient_results = [item for item in results if item.get("kind") == "ingredients"]
    front_results = [item for item in results if item.get("kind") == "front"]
    output = {
        "schemaVersion": "1.0",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "provisional_external_transcription_not_human_gold",
        "partition": PARTITION,
        "warning": "Real files and the production browser pipeline were used without mocks. Reference text is an external source transcription, not independently approved project gold.",
        "pipeline": "licensed image file -> Tesseract.js eng+rus -> /api/photo/resolve -> cleaner -> /api/analyze",
        "initialFullResolutionAttempt": {
            "records": 1,
            "timeoutMs": 180000,
            "completed": 0,
            "action": "Stopped the batch and applied a documented max-edge 1800px preprocessing step."
        },
        "ingredientImages": aggregate(ingredient_results),
        "frontImages": {
            "records": len(front_results),
            "identifiedCandidates": sum(1 for item in front_results if item.get("productName") or "Кандидат:" in item.get("statusText", "")),
            "analysisCompleted": sum(1 for item in front_results if item.get("analysisCompleted")),
        },
        "browserPageErrors": errors,
        "cases": results,
    }
    output_name = "ocr-live-final.json" if PARTITION == "final" else "ocr-live.json"
    (T18 / output_name).write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ingredientImages": output["ingredientImages"], "frontImages": output["frontImages"], "pageErrors": len(errors)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
