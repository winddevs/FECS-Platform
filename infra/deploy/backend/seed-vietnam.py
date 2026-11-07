"""Add Vietnam (VND) to the seeded Medusa demo data. Idempotent: safe to repeat.

Runs ON the backend droplet against the private Medusa address, because
Cloudflare blocks Python's HTTP client on the public hostname (error 1010).

  ssh bibaestudios-backend 'ADMIN_PW=... ADMIN_EMAIL=you@example.com python3 -' \
    < infra/deploy/backend/seed-vietnam.py

Creates: VND store currency, a "Vietnam" region (vn), a fulfillment set and service
zone, two shipping options, and a VND price on every variant that has a EUR price.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("MEDUSA_URL", "http://10.104.0.5:9000")
EMAIL = os.environ["ADMIN_EMAIL"]
VND_PER_EUR = 27000  # demo rate; edit prices in Medusa Admin for real ones
ROUND_TO = 1000


def call(method, path, token=None, body=None, key=None):
    req = urllib.request.Request(
        BASE + path, method=method,
        data=(json.dumps(body).encode() if body is not None else None),
    )
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if key:
        req.add_header("x-publishable-api-key", key)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} failed: HTTP {e.code} {e.read().decode()[:600]}")


tok = call("POST", "/auth/user/emailpass", body={"email": EMAIL, "password": os.environ["ADMIN_PW"]})["token"]

# 1. VND as a store currency (keep the existing ones and their default)
store = call("GET", "/admin/stores?fields=id,supported_currencies.*", tok)["stores"][0]
cur = [(c["currency_code"], bool(c.get("is_default"))) for c in store["supported_currencies"]]
if not any(code == "vnd" for code, _ in cur):
    cur.append(("vnd", False))
    call("POST", f"/admin/stores/{store['id']}", tok,
         {"supported_currencies": [{"currency_code": c, "is_default": d} for c, d in cur]})
    print("added vnd to store currencies")
else:
    print("vnd already a store currency")

# 2. Region
regions = call("GET", "/admin/regions?fields=id,name,currency_code,countries.iso_2", tok)["regions"]
vn = next((r for r in regions if any(c["iso_2"] == "vn" for c in r.get("countries", []))), None)
if vn is None:
    vn = call("POST", "/admin/regions", tok, {
        "name": "Vietnam", "currency_code": "vnd", "countries": ["vn"],
        "payment_providers": ["pp_system_default"],
    })["region"]
    print("created region", vn["id"])
else:
    print("region for vn exists:", vn["id"], vn["name"], vn["currency_code"])

# 3. Fulfillment set + service zone for Vietnam on the existing stock location
LOC_FIELDS = ("/admin/stock-locations?fields=id,name,fulfillment_sets.id,fulfillment_sets.name,"
              "fulfillment_sets.service_zones.id,fulfillment_sets.service_zones.name,"
              "fulfillment_sets.service_zones.geo_zones.country_code")


def load_loc():
    return call("GET", LOC_FIELDS, tok)["stock_locations"][0]


def find_zone(loc):
    for fs in loc.get("fulfillment_sets", []):
        for z in fs.get("service_zones", []):
            if any(g.get("country_code") == "vn" for g in z.get("geo_zones", [])):
                return z["id"]
    return None


loc = load_loc()
zone_id = find_zone(loc)
if zone_id is None:
    fset = next((f for f in loc.get("fulfillment_sets", []) if f["name"] == "Vietnam delivery"), None)
    if fset is None:
        call("POST", f"/admin/stock-locations/{loc['id']}/fulfillment-sets", tok,
             {"name": "Vietnam delivery", "type": "shipping"})
        fset = next(f for f in load_loc()["fulfillment_sets"] if f["name"] == "Vietnam delivery")
        print("created fulfillment set", fset["id"])
    call("POST", f"/admin/fulfillment-sets/{fset['id']}/service-zones", tok,
         {"name": "Vietnam", "geo_zones": [{"type": "country", "country_code": "vn"}]})
    zone_id = find_zone(load_loc())
    assert zone_id, "service zone for vn was not created"
    print("created service zone", zone_id)
else:
    print("service zone for vn exists:", zone_id)

# 4. Shipping options in VND
profile = call("GET", "/admin/shipping-profiles", tok)["shipping_profiles"][0]["id"]
existing = {o["name"] for o in call("GET", "/admin/shipping-options", tok)["shipping_options"]}
rules = [{"attribute": "enabled_in_store", "value": "true", "operator": "eq"},
         {"attribute": "is_return", "value": "false", "operator": "eq"}]
for name, label, desc, code, amount in [
    ("Giao hàng tiêu chuẩn", "Standard", "Giao trong 3-5 ngày.", "standard", 30000),
    ("Giao hàng nhanh", "Express", "Giao trong 24 giờ.", "express", 60000),
]:
    if name in existing:
        print("shipping option exists:", name)
        continue
    call("POST", "/admin/shipping-options", tok, {
        "name": name, "price_type": "flat", "provider_id": "manual_manual",
        "service_zone_id": zone_id, "shipping_profile_id": profile,
        "type": {"label": label, "description": desc, "code": code},
        "prices": [{"currency_code": "vnd", "amount": amount}, {"region_id": vn["id"], "amount": amount}],
        "rules": rules,
    })
    print("created shipping option:", name)

# 5. VND prices on every variant (existing prices are sent back unchanged)
products = call("GET", "/admin/products?limit=100&fields=id,title,variants.id,variants.prices.*", tok)["products"]
updated = 0
for p in products:
    updates = []
    for v in p["variants"]:
        prices = v["prices"]
        if any(x["currency_code"] == "vnd" for x in prices):
            continue
        eur = next((x["amount"] for x in prices if x["currency_code"] == "eur"), None)
        if eur is None:
            continue
        vnd = int(round(eur * VND_PER_EUR / ROUND_TO) * ROUND_TO)
        keep = [{"id": x["id"], "currency_code": x["currency_code"], "amount": x["amount"]}
                for x in prices if not x.get("rules") and not x.get("price_rules")]
        updates.append({"id": v["id"], "prices": keep + [{"currency_code": "vnd", "amount": vnd}]})
    if updates:
        call("POST", f"/admin/products/{p['id']}/variants/batch", tok, {"update": updates})
        updated += len(updates)
        print(f"  {p['title']}: {len(updates)} variants got a VND price")
print("variants updated:", updated)

# 6. Verify the way the storefront sees it
pk = call("GET", "/admin/api-keys?type=publishable", tok)["api_keys"][0]["token"]
sregions = call("GET", "/store/regions", key=pk)["regions"]
print("store regions:", [(r["name"], r["currency_code"], [c["iso_2"] for c in r["countries"]]) for r in sregions])
vn_store = next(r for r in sregions if any(c["iso_2"] == "vn" for c in r["countries"]))
sp = call("GET", f"/store/products?region_id={vn_store['id']}&fields=title,*variants.calculated_price&limit=10", key=pk)["products"]
for p in sp:
    cp = p["variants"][0].get("calculated_price") if p.get("variants") else None
    print(" ", p["title"], "->", (cp["calculated_amount"], cp["currency_code"]) if cp else "NO PRICE")
