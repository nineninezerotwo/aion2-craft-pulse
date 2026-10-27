#!/usr/bin/env python3
"""Read-only Aion2Market feed diagnostics. Does not store responses or bypass 403/429."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
BASE="https://aion2.exchange/api/items"
HEADERS={"User-Agent":"FregionCraftPulse/0.2 (noncommercial API connectivity probe; https://github.com/nineninezerotwo/aion2-craft-pulse)","Accept":"application/json"}
def main():
    print("Probe: 2 single-item requests maximum; no saved market data",flush=True)
    for pos,candidate in enumerate(("1507","11507")):
        url=BASE+"?"+urllib.parse.urlencode({"server":candidate,"limit":1,"offset":0,"sort":"name","order":"asc","window":"24h"})
        req=urllib.request.Request(url,headers=HEADERS)
        print("Trying candidate server parameter:",candidate,flush=True)
        try:
            with urllib.request.urlopen(req,timeout=20) as r:
                ct=r.headers.get("content-type","")
                body=r.read(200000)
                print("HTTP",r.status,"Content-Type",ct,"bytes",len(body),flush=True)
                if "json" not in ct:
                    print("Unexpected format — API not verified");continue
                payload=json.loads(body)
                if not isinstance(payload,dict):
                    print("Unexpected JSON shape",type(payload).__name__);continue
                print("Top-level keys:",sorted(payload.keys()))
                for field in ("server","server_id","region","faction","total"):
                    if field in payload:print(field,str(payload[field])[:90])
                items=payload.get("items")
                if isinstance(items,list):
                    print("Number of returned items:",len(items))
                    if items and isinstance(items[0],dict):print("First item fields:",sorted(items[0].keys()))
                else:print("No items list: collector schema must be updated")
                print("IMPORTANT: HTTP success alone does NOT prove selected Fregion market")
        except urllib.error.HTTPError as e:
            print("HTTP",e.code,"— source rejected or endpoint unavailable")
            if e.code in (401,403,429):
                print("Source declined access; stop without retries or bypass");break
        except Exception as e:
            print("Connectivity:",type(e).__name__,str(e)[:130])
        if pos==0:time.sleep(2)
if __name__=="__main__":main()
