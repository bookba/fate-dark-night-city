// Servant portraits from the Fate/Grand Order wiki (fategrandorder.fandom.com),
// first-ascension art downscaled to 240px wide. Type-Moon / FGO art: fine for a
// private prototype, replace before sharing the game publicly.
import artoria from './art/servants/artoria.webp';
import artoria_alter from './art/servants/artoria_alter.webp';
import cu from './art/servants/cu.webp';
import cu_alter from './art/servants/cu_alter.webp';
import diarmuid from './art/servants/diarmuid.webp';
import emiya from './art/servants/emiya.webp';
import emiya_alter from './art/servants/emiya_alter.webp';
import gilgamesh from './art/servants/gilgamesh.webp';
import gilles from './art/servants/gilles.webp';
import hassan from './art/servants/hassan.webp';
import heracles from './art/servants/heracles.webp';
import iskandar from './art/servants/iskandar.webp';
import kojiro from './art/servants/kojiro.webp';
import lancelot from './art/servants/lancelot.webp';
import medea from './art/servants/medea.webp';
import medusa from './art/servants/medusa.webp';
import siegfried from './art/servants/siegfried.webp';

export const SERVANT_ART = {
  artoria, artoria_alter, cu, cu_alter, diarmuid, emiya, emiya_alter, gilgamesh, gilles, hassan, heracles, iskandar, kojiro, lancelot, medea, medusa, siegfried,
};

// an Alter without its own art uses its base Servant's
export const servantArt = (key) => (key && (SERVANT_ART[key] || SERVANT_ART[key.replace(/_alter$/, '')])) || '';
