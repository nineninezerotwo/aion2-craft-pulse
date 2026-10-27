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
def confirm_mapping():
    print("Server label discovery — two metadata requests maximum")
    for endpoint in ("https://aion2.exchange/api/servers", "https://aion2.exchange/items"):
        req=urllib.request.Request(endpoint,headers=HEADERS)
        try:
            with urllib.request.urlopen(req,timeout=20) as response:
                text=response.read(350000).decode("utf-8",errors="replace")
                print("Mapping source",endpoint,"status",response.status,"bytes",len(text))
                for term in ("11507","Fregion","Asia"):
                    index=text.lower().find(term.lower())
                    if index>=0:
                        excerpt=text[max(0,index-110):index+160]
                        print("Found",term,"near",repr(excerpt[:250]))
                    else:print("No",term,"literal in first 350k")
        except urllib.error.HTTPError as exc:
            print("Mapping source",endpoint,"HTTP",exc.code)
            if exc.code in (401,403,429):
                print("Refused access; stopping metadata checks");break
        except Exception as exc:
            print("Mapping request failed",type(exc).__name__,str(exc)[:150])
        time.sleep(2)

def check_robots():
    import urllib.robotparser
    target="https://aion2.exchange/robots.txt"
    req=urllib.request.Request(target,headers=HEADERS)
    try:
        with urllib.request.urlopen(req,timeout=20) as r:
            robots=r.read(16000).decode("utf-8",errors="replace")
            print("robots.txt HTTP",r.status,"rules bytes",len(robots))
            print("robots.txt lines:",repr(robots[:2500]))
            rp=urllib.robotparser.RobotFileParser()
            rp.parse(robots.splitlines())
            print("Our UA may fetch /api/items:",rp.can_fetch(HEADERS["User-Agent"],BASE))
    except urllib.error.HTTPError as exc:
        print("robots.txt HTTP",exc.code,"— permission still unverified")
    except Exception as exc:
        print("robots.txt diagnostic:",type(exc).__name__,str(exc)[:120])

if __name__=="__main__":
    main()
    confirm_mapping()
    check_robots()
