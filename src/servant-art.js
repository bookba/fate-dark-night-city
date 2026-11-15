// Servant art from the Fate/Grand Order wiki (fategrandorder.fandom.com): first-
// ascension art downscaled to 240px wide, and the face icons (96px) for the small
// round portraits. Type-Moon / FGO art: fine for a private prototype, replace before
// sharing the game publicly.
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
import artoriaIcon from './art/icons/artoria.webp';
import artoria_alterIcon from './art/icons/artoria_alter.webp';
import cuIcon from './art/icons/cu.webp';
import cu_alterIcon from './art/icons/cu_alter.webp';
import diarmuidIcon from './art/icons/diarmuid.webp';
import emiyaIcon from './art/icons/emiya.webp';
import emiya_alterIcon from './art/icons/emiya_alter.webp';
import gilgameshIcon from './art/icons/gilgamesh.webp';
import gillesIcon from './art/icons/gilles.webp';
import hassanIcon from './art/icons/hassan.webp';
import heraclesIcon from './art/icons/heracles.webp';
import iskandarIcon from './art/icons/iskandar.webp';
import kojiroIcon from './art/icons/kojiro.webp';
import lancelotIcon from './art/icons/lancelot.webp';
import medeaIcon from './art/icons/medea.webp';
import medusaIcon from './art/icons/medusa.webp';
import siegfriedIcon from './art/icons/siegfried.webp';

export const SERVANT_ART = {
  artoria, artoria_alter, cu, cu_alter, diarmuid, emiya, emiya_alter, gilgamesh, gilles, hassan, heracles, iskandar, kojiro, lancelot, medea, medusa, siegfried,
};
export const SERVANT_ICON = {
  artoria: artoriaIcon, artoria_alter: artoria_alterIcon, cu: cuIcon, cu_alter: cu_alterIcon, diarmuid: diarmuidIcon, emiya: emiyaIcon, emiya_alter: emiya_alterIcon, gilgamesh: gilgameshIcon, gilles: gillesIcon, hassan: hassanIcon, heracles: heraclesIcon, iskandar: iskandarIcon, kojiro: kojiroIcon, lancelot: lancelotIcon, medea: medeaIcon, medusa: medusaIcon, siegfried: siegfriedIcon,
};

// an Alter without its own art uses its base Servant's
const lookup = (table, key) => (key && (table[key] || table[key.replace(/_alter$/, '')])) || '';
export const servantArt = (key) => lookup(SERVANT_ART, key);
export const servantIcon = (key) => lookup(SERVANT_ICON, key);
