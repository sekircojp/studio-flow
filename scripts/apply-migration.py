"""マイグレーションを Supabase の Management API で適用する補助スクリプト。

  python apply-migration.py supabase/migrations/<file>.sql

.env.local の SUPABASE_ACCESS_TOKEN と NEXT_PUBLIC_SUPABASE_URL を読む。
"""
import io, json, re, sys, urllib.request

env = {}
for line in io.open(".env.local", encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')

ref = re.match(r"https://([^.]+)\.", env["NEXT_PUBLIC_SUPABASE_URL"]).group(1)
sql = io.open(sys.argv[1], encoding="utf-8").read()

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/database/query",
    data=json.dumps({"query": sql}).encode(),
    headers={
        "Authorization": "Bearer " + env["SUPABASE_ACCESS_TOKEN"],
        "Content-Type": "application/json",
        "User-Agent": "studio-flow-migrate/1.0",
    },
)
try:
    print(urllib.request.urlopen(req).read().decode()[:800] or "OK")
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:1200])
    sys.exit(1)
