// Servant art from the v1 demo (src/art). Taken out 2 Nov 2026 with the Fuyuki map ("เอารูปจากเว็บออกก่อน",
// paper 4.6 item 17) and put back 3 Nov 2026 as B asked ("เอารูปเซอแว้นกลับมา"); the map stays out.
// Type-Moon / FGO art: fine for a private prototype, replace before sharing the game publicly.
import artoria from '../src/art/servants/artoria.webp';
import emiya from '../src/art/servants/emiya.webp';
import cu from '../src/art/servants/cu.webp';
import medea from '../src/art/servants/medea.webp';
import medusa from '../src/art/servants/medusa.webp';
import heracles from '../src/art/servants/heracles.webp';
import kojiro from '../src/art/servants/kojiro.webp';
import gilgamesh from '../src/art/servants/gilgamesh.webp';
import hassan from '../src/art/servants/hassan.webp';
// The card backs are in style.css (paper 4.6 item 13).
// Real Fate/Domination cards B sent (paper 4.6 item 16): the picture part for the small tiles
// (name bar and text box cut off), the whole card for the details. Fate/Domination art: fine
// for a private prototype, replace before sharing the game publicly.
import cursedArmArt from '../src/art/cards/hassan-cursed-arm-art.webp';
import cursedArm from '../src/art/cards/hassan-cursed-arm.webp';
import metaArt from '../src/art/cards/hassan-metamorphosis-art.webp';
import meta from '../src/art/cards/hassan-metamorphosis.webp';
import assassinArt from '../src/art/cards/hassan-assassin-class-art.webp';
import assassin from '../src/art/cards/hassan-assassin-class.webp';

// keyed by the Servant's key; a Servant without art shows its class crest, drawn in main.js
export const SV_ART = { artoria, emiya, cu, medea, medusa, heracles, kojiro, gilgamesh, hassan };
// keyed by the card's name in the demo (Zabaniya is printed "Cursed Arm" on the card)
export const CARD_ART = {
  Zabaniya: { art: cursedArmArt, full: cursedArm },
  Metamorphosis: { art: metaArt, full: meta },
  'Assassin Class': { art: assassinArt, full: assassin },
};
