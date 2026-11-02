// Servant art and the Fuyuki map from the v1 demo (src/art). Type-Moon / FGO art:
// fine for a private prototype, replace before sharing the game publicly.
import artoria from '../src/art/servants/artoria.webp';
import emiya from '../src/art/servants/emiya.webp';
import cu from '../src/art/servants/cu.webp';
import medea from '../src/art/servants/medea.webp';
import medusa from '../src/art/servants/medusa.webp';
import heracles from '../src/art/servants/heracles.webp';
import kojiro from '../src/art/servants/kojiro.webp';
import gilgamesh from '../src/art/servants/gilgamesh.webp';
import hassan from '../src/art/servants/hassan.webp';
import day from '../src/art/map/fuyuki-day.webp';
import night from '../src/art/map/fuyuki-night.webp';
// real Fate/Domination cards B sent (paper 4.6 item 16): the picture part for the small tiles
// (name bar and text box cut off), the whole card for the details. Same copyright note as above.
import cursedArmArt from '../src/art/cards/hassan-cursed-arm-art.webp';
import cursedArm from '../src/art/cards/hassan-cursed-arm.webp';
import metaArt from '../src/art/cards/hassan-metamorphosis-art.webp';
import meta from '../src/art/cards/hassan-metamorphosis.webp';
import assassinArt from '../src/art/cards/hassan-assassin-class-art.webp';
import assassin from '../src/art/cards/hassan-assassin-class.webp';

export const SV_ART = { artoria, emiya, cu, medea, medusa, heracles, kojiro, gilgamesh, hassan };
export const MAP_ART = { day, night };
// keyed by the card's name in the demo (Zabaniya is printed "Cursed Arm" on the card)
export const CARD_ART = {
  Zabaniya: { art: cursedArmArt, full: cursedArm },
  Metamorphosis: { art: metaArt, full: meta },
  'Assassin Class': { art: assassinArt, full: assassin },
};
