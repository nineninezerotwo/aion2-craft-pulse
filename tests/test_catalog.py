import unittest
from scripts.import_client_recipes import convert

class RecipeConversionTests(unittest.TestCase):
    def test_client_reference_does_not_claim_success(self):
        # 220 tiny faction-specific rows to exercise conversion without external network.
        item_map = {'100': ['Result', 0, 11, 'craft'], '200': ['Material', 0, 11, 'gather']}
        data = {'items': item_map, 'professions':['alchemy'], 'recipes': [
            {'i': str(i), 'f': 0, 'p':0, 'out':['100',3], 'in':[['200',2]], 'm':20, 'c':0, 't':'Potion', 'mg':'beginner'}
            for i in range(220)
        ]}
        data['icons']=['Good_Icon']
        data['recipes'].append({'i':'not-light','f':1,'p':0,'out':['100',3],'in':[['200',2]]})
        result = convert(data)
        self.assertEqual(len(result['recipes']),220)
        self.assertTrue(all(not r['verified'] and r['success_rate'] is None for r in result['recipes']))
        self.assertEqual(result['recipes'][0]['ingredients'][0]['id'],'200')
        self.assertEqual(result['schema'],5)
        self.assertEqual(result['recipes'][0]['icon'],'Good_Icon')
        self.assertEqual(result['recipes'][0]['craft_type'],'Potion')
        self.assertEqual(result['recipes'][0]['mastery_grade'],'beginner')
        self.assertEqual(result['recipes'][0]['item_grade'],11)

if __name__ == '__main__':unittest.main()
