import os
import io
import json
from flask import Flask, request, jsonify, render_template
from PIL import Image
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

app = Flask(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
client = None

if GEMINI_API_KEY and not GEMINI_API_KEY.startswith("your_"):
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        print("Gemini SDK initialized successfully!")
    except Exception as e:
        print(f"Failed to initialize Client: {e}")

@app.route("/")
def home():
    return render_template("index.html", has_api_key=bool(client))

@app.route("/api/scan-receipt", methods=["POST"])
def scan_receipt():
    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files["image"]
    image = Image.open(file.stream)
    
    # Convert image to bytes for seamless SDK ingestion
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format=image.format or "JPEG")
    image_bytes = img_byte_arr.getvalue()

    if client:
        try:
            prompt = """
            Analyze this wholesale mandi receipt or produce inventory.
            Extract the items into a structured JSON array of objects with the following keys:
            - "item_name": standard name (e.g. 'Tomato', 'Onion')
            - "quantity_kg": numeric value in kg or units
            - "cost_per_unit": wholesale purchase price per unit/kg in INR
            - "category": 'vegetable', 'fruit', or 'grocery'
            - "shelf_life_days": estimated shelf life under ambient tropical storage (integer)

            Return ONLY raw JSON, with no code blocks or markdown fences:
            [
              {"item_name": "Tomato", "quantity_kg": 25, "cost_per_unit": 26, "category": "vegetable", "shelf_life_days": 2}
            ]
            """

            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )

            data = json.loads(response.text.strip())
            print("Successfully executed live Gemini 2.5 call!")
            return jsonify({"status": "success", "items": data, "source": "gemini-3.6-flash(live)"})

        except Exception as e:
            print(f"\n=== LIVE API ERROR ===\n{e}\n=====================\n")

    demo_extracted = [
        {"item_name": "Desi Tomatoes", "quantity_kg": 25, "cost_per_unit": 26, "category": "vegetable", "shelf_life_days": 2},
        {"item_name": "Nashik Red Onions", "quantity_kg": 50, "cost_per_unit": 22, "category": "vegetable", "shelf_life_days": 7},
        {"item_name": "Fresh Spinach (Palak)", "quantity_kg": 10, "cost_per_unit": 15, "category": "vegetable", "shelf_life_days": 1},
        {"item_name": "Fresh Cauliflower", "quantity_kg": 15, "cost_per_unit": 28, "category": "vegetable", "shelf_life_days": 3},
        {"item_name": "Robusta Bananas", "quantity_kg": 20, "cost_per_unit": 30, "category": "fruit", "shelf_life_days": 2}
    ]
    return jsonify({"status": "success", "items": demo_extracted, "source": "demo-mode (check terminal for API error)"})

@app.route("/api/spoilage-advisory", methods=["POST"])
def spoilage_advisory():
    data = request.get_json() or {}
    inventory = data.get("inventory", [])

    if not inventory:
        return jsonify([])

    if client:
        try:
            prompt = f"""
            You are an AI retail pricing assistant for Indian street vendors.
            Vendor's current stock: {json.dumps(inventory)}
            Recommend clearance markdowns and 1-sentence sales callouts for perishable items nearing expiry (<= 2 days).
            Return ONLY raw JSON, without markdown fences:
            [
              {{"item_name": "...", "action": "...", "discount_percent": 20, "callout_pitch": "..."}}
            ]
            """
            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            return jsonify(json.loads(response.text.strip()))
        except Exception as e:
            print(f"\n=== ADVISORY ERROR ===\n{e}\n======================\n")

    advisories = []
    for item in inventory:
        shelf = int(item.get("shelf_life_days", 3))
        if shelf <= 2:
            discount = 25 if shelf == 1 else 15
            advisories.append({
                "item_name": item.get("item_name", "Item"),
                "action": "Liquidate before evening close to prevent total loss.",
                "discount_percent": discount,
                "callout_pitch": f"Special evening offer: Fresh {item.get('item_name')} at {discount}% off!"
            })

    return jsonify(advisories)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)