#!/usr/bin/env python3
"""Convert locally obtained, attributed Global LST reference recipes to Craft Pulse.

Accepts JSON from xtopolis/aion2-static/src/data/crafting.json, published under
MIT. Does NOT scrape Questlog or silently supply unverified success/vendor costs.
Run with: python scripts/import_client_recipes.py --input crafting.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

EXCLUDED_VOUCHER = '632510022'  # Gear transfer/conversion; not a normal craft.
PROFESSIONS = {
    'blacksmithing': 'Blacksmithing',
    'tailoring': 'Armorsmithing',
    'jewelcrafting': 'Handicrafting',
    'alchemy': 'Alchemy',
    'cooking': 'Cooking',
}
SOURCE = 'xtopolis/aion2-static (MIT), AION 2 Global LST client 2026-09-21'
SOURCE_URL = 'https://github.com/xtopolis/aion2-static/blob/main/src/data/crafting.json'


def convert(data: dict) -> dict:
    """Keep source IDs; never infer paid NPC prices or a success probability."""
    if not isinstance(data.get('recipes'), list) or not isinstance(data.get('items'), dict):
        raise ValueError('Not the supported game-client recipe dataset')
    items = data['items']
    profession_names = data.get('professions', [])
    icons = data.get('icons', [])
    rows = []
    seen = set()
    for row in data['recipes']:
        if row.get('f') != 0 or any(str(i[0]) == EXCLUDED_VOUCHER for i in row.get('in', [])):
            continue
        recipe_id = str(row['i'])
        if recipe_id in seen:
            raise ValueError(f'Duplicate recipe ID {recipe_id}')
        seen.add(recipe_id)
        item_id, output_qty = row['out']
        item = items.get(str(item_id))
        if not item or not item[0] or not isinstance(output_qty, (int, float)) or output_qty <= 0:
            continue
        profession_code = profession_names[row['p']]
        if profession_code not in PROFESSIONS:
            raise ValueError(f'Unexpected profession {profession_code}')
        ingredients = []
        for ingredient_id, qty in row['in']:
            material = items.get(str(ingredient_id))
            if not material or not material[0] or qty <= 0:
                raise ValueError(f'Missing ingredient for recipe {recipe_id}: {ingredient_id}')
            ingredients.append({'id': str(ingredient_id), 'name': material[0], 'qty': qty})
        if not ingredients:
            continue  # cannot model without inputs
        icon_idx = row.get('c')
        icon_name = icons[icon_idx] if isinstance(icon_idx, int) and 0 <= icon_idx < len(icons) else None
        if icon_name is not None and (not isinstance(icon_name, str) or not icon_name.replace('_', '').replace('-', '').isalnum()):
            raise ValueError(f'Invalid icon metadata in {recipe_id}')
        rows.append({
            'recipe_id': recipe_id,
            'item_id': str(item_id),
            'name': item[0],
            'profession': PROFESSIONS[profession_code],
            'level': row.get('m'),  # null means unspecified, not level 0!
            'output_qty': output_qty,
            'success_rate': None,   # NC never confirmed ordinary craft-success odds
            'npc_kinah': 0,        # Excludes unlisted extra fees; settings explicitly warn
            'ingredients': ingredients,
            'combo_chance': row.get('cp'),  # percent, combo not counted in earnings
            'combo_item_id': row.get('co'),
            'icon': icon_name,
            'craft_type': row.get('t') or '',
            'mastery_grade': row.get('mg') if row.get('mg') in ('beginner', 'intermediate') else None,
            'reference': True,
            'verified': False,
            'source': SOURCE,
        })
    if len(rows) < 200 or len(rows) > 400:
        raise ValueError(f'Unexpected number of Elyos recipes: {len(rows)}')
    return {
        'schema': 4,
        'source': {
            'name': SOURCE, 'url': SOURCE_URL, 'license': 'MIT',
            'reference_date': '2026-09-21',
            'notes': 'Reference from LST client, not current in-game verification. Unknown success rates and fees. No Questlog scraping.',
            'images': 'Item icon filename references are used from the upstream project; images remain hosted by upstream. Game art rights belong to their respective owners.',
            'rate_note': 'Combo probability is distinct from ordinary crafting success, which is unknown by default.'
        },
        'server': 'Asia / Elyos / Fregion',
        'recipes': sorted(rows, key=lambda x: (x['profession'],x['name'],x['recipe_id'])),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True, help='Local MIT Global client crafting.json')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'docs/data/recipes.json')
    args = parser.parse_args()
    result = convert(json.loads(args.input.read_text(encoding='utf-8')))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"Wrote {len(result['recipes'])} unverified Elyos client-reference recipes")

if __name__ == '__main__':
    main()
