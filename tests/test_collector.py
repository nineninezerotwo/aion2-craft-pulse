import datetime as dt
import json
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from collector import normalize, latest_snapshot, update_history, compact_snapshots

class TestCollector(unittest.TestCase):
    def test_normalize(self):
        self.assertEqual(normalize({'item_key':6101,'name':'a','low':120,'listings':30})['listings'],30)
        self.assertIsNone(normalize({'item_key':6101,'name':'a','listings':30})['price'])
        self.assertIsNone(normalize({'item_key':6101,'name':'a','low':120})['listings'])
    def test_zero_listings_is_real(self):
        self.assertEqual(normalize({'item_key':6101,'listings':0,'low':0})['listings'],0)
    def test_history_and_summary(self):
        items = json.loads((Path(__file__).parent / 'fixture.json').read_text())['items']
        now = dt.datetime(2026,10,27,1,0,tzinfo=dt.timezone.utc)
        latest=latest_snapshot(items,'11507',now)
        self.assertEqual(len(latest['items']),7)
        h=update_history({},latest,now)
        self.assertEqual(len(h['snapshots']),1)
        self.assertEqual(h['snapshots'][0]['values']['516530001'],[61000,13])
    def test_downsample(self):
        now=dt.datetime(2026,10,27,0,0,tzinfo=dt.timezone.utc)
        vals=[{'ts':(now-dt.timedelta(hours=i)).isoformat().replace('+00:00','Z'),'values':{'1':[1,2]}} for i in range(2400)]
        pts=compact_snapshots(vals,now)
        self.assertLess(len(pts),340)
        self.assertEqual(pts[-1]['ts'],'2026-10-27T00:00:00Z')
        self.assertTrue(all(p['ts']>='2026-07-28' for p in pts))
if __name__=='__main__':
    unittest.main()
