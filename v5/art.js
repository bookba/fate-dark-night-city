// Card pictures in the demo: only pictures B sent. The FGO wiki Servant art and the Fuyuki map
// were taken out 2 Nov 2026 as B asked ("เอารูปจากเว็บออกก่อน", paper 4.6 item 17); a Servant now
// shows its class crest, drawn in main.js. The card backs are in style.css (paper 4.6 item 13).
// Real Fate/Domination cards B sent (paper 4.6 item 16): the picture part for the small tiles
// (name bar and text box cut off), the whole card for the details. Fate/Domination art: fine
// for a private prototype, replace before sharing the game publicly.
import cursedArmArt from '../src/art/cards/hassan-cursed-arm-art.webp';
import cursedArm from '../src/art/cards/hassan-cursed-arm.webp';
import metaArt from '../src/art/cards/hassan-metamorphosis-art.webp';
import meta from '../src/art/cards/hassan-metamorphosis.webp';
import assassinArt from '../src/art/cards/hassan-assassin-class-art.webp';
import assassin from '../src/art/cards/hassan-assassin-class.webp';

// keyed by the card's name in the demo (Zabaniya is printed "Cursed Arm" on the card)
export const CARD_ART = {
  Zabaniya: { art: cursedArmArt, full: cursedArm },
  Metamorphosis: { art: metaArt, full: meta },
  'Assassin Class': { art: assassinArt, full: assassin },
};
